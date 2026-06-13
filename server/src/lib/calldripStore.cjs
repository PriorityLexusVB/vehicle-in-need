/**
 * CallDrip Firestore storage layer.
 *
 * Collections:
 *   - calldrip_raw_events   — one doc per unique webhook event
 *   - system_ingestion      — doc "calldrip_status" for health/status
 *
 * Separated from all existing application collections.
 *
 * @module calldripStore
 */

"use strict";

const crypto = require("crypto");
const { getFirestore, admin } = require("./firebaseAdmin.cjs");
// v1.5.0 commit 2 — PII redaction before Firestore write + transcription enqueue
const { redactPiiDeep } = require("./redactPii.cjs");
const { extractTranscriptionJob, enqueueTranscription } = require("./transcriptionQueue.cjs");

const RAW_EVENTS_COLLECTION = "calldrip_raw_events";
const STATUS_DOC_PATH = "system_ingestion/calldrip_status";

/* ------------------------------------------------------------------ */
/*  Dedupe key                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build an idempotent dedupe key.
 *
 * Priority order:
 *   1. Vendor‑supplied event ID  (calldrip_event_id or event_id)
 *   2. Deterministic hash of (call_id + person_id + occurred_at)
 *   3. SHA-256 of full JSON payload
 *
 * @param {object} payload — parsed webhook body
 * @returns {string} dedupe key
 */
function buildDedupeKey(payload) {
  // 1. Prefer vendor event ID
  const vendorId = payload.calldrip_event_id || payload.event_id;
  if (vendorId) return `vendor:${vendorId}`;

  // 2. Composite key from call metadata
  const call = payload.call_id || "";
  const person = payload.person_id || "";
  const occurred = payload.occurred_at || "";
  if (call || person) {
    const composite = `${call}|${person}|${occurred}`;
    return `composite:${crypto.createHash("sha256").update(composite).digest("hex").slice(0, 24)}`;
  }

  // 3. Full payload hash
  const raw = JSON.stringify(payload);
  return `hash:${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

/* ------------------------------------------------------------------ */
/*  Store raw event                                                   */
/* ------------------------------------------------------------------ */

/**
 * Persist a raw CallDrip event to Firestore.
 *
 * Returns { stored: true } on first insert, { duplicate: true } on dupe.
 *
 * @param {object}  payload — parsed webhook body
 * @param {object}  headersSummary — sanitized subset of request headers
 * @returns {Promise<{stored?: boolean, duplicate?: boolean, dedupeKey: string}>}
 */
async function storeRawEvent(payload, headersSummary) {
  const db = getFirestore();
  // v1.5.0 commit 2: dedupe key is computed against the RAW (pre-redact)
  // payload so the same upstream event keys consistently even after
  // redaction pattern updates change the redacted bytes.
  const dedupeKey = buildDedupeKey(payload);
  const docRef = db.collection(RAW_EVENTS_COLLECTION).doc(dedupeKey);

  // Check for existing doc first (cheap read)
  const existing = await docRef.get();
  if (existing.exists) {
    // Duplicate — increment counter on status doc, but don't re-store
    await incrementDuplicateCount(db);
    return { duplicate: true, dedupeKey };
  }

  // v1.5.0 commit 2: deep-redact PII BEFORE Firestore write. The 4-agent +
  // Codex gap audit on 2026-06-13 confirmed transcripts arrive with spoken
  // SSNs / card numbers / DOB / DL / phone / email — must never persist
  // unredacted. Pipeline-key passthrough preserves leadPhoneNumber /
  // leadPhoneDigits / personId / dealId / callId / recording_url so
  // downstream joins still work.
  const { result: payloadRedacted, counts: piiRedactionCounts } = redactPiiDeep(payload);

  // v1.5.0 commit 2: enqueue transcription job if payload carries a
  // recording_url + duration >= 30s. Idempotent per callId. Worker
  // (commit 3 re-transcribe-call.mjs) consumes from this queue.
  let transcriptionEnqueue = null;
  try {
    const job = extractTranscriptionJob(payload); // read from RAW for url accuracy
    if (job) {
      transcriptionEnqueue = await enqueueTranscription(job);
    }
  } catch (err) {
    // Don't let queue failures block raw-event persistence — log and continue
    console.warn("[CallDrip] transcription enqueue failed:", err.message);
  }

  const doc = {
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "calldrip",
    eventKey: payload.event || payload.event_type || "unknown",
    dedupeKey,
    callDripEventId: payload.calldrip_event_id || payload.event_id || null,
    personId: payload.person_id || null,
    dealId: payload.deal_id || null,
    alternateId: payload.alternate_id || null,
    callId: payload.call_id || null,
    textInboxId: payload.text_inbox_id || null,
    occurredAt: payload.occurred_at || null,
    payload: payloadRedacted,      // v1.5.0: redacted body, never raw
    piiRedactionCounts,            // v1.5.0: telemetry — how much was scrubbed
    transcriptionEnqueued: !!(transcriptionEnqueue && transcriptionEnqueue.enqueued),
    transcriptionCallId: transcriptionEnqueue ? transcriptionEnqueue.callId : null,
    headersSummary,                // sanitized headers
    processed: false,              // future: set true after bdc-agent export
    processed_by_supabase: false,  // flipped by calldripAggregate.cjs after
                                   // successful kpi-ingest forward.
  };

  await docRef.set(doc);

  // Update status doc
  await updateStatusOnSuccess(db, payload);

  return { stored: true, dedupeKey };
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                    */
/* ------------------------------------------------------------------ */

/** Increment eventsReceivedCount and timestamps after a successful persist. */
async function updateStatusOnSuccess(db, payload) {
  const statusRef = db.doc(STATUS_DOC_PATH);
  await statusRef.set(
    {
      lastWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEventOccurredAt: payload.occurred_at || null,
      lastSuccessfulPersistAt: admin.firestore.FieldValue.serverTimestamp(),
      eventsReceivedCount: admin.firestore.FieldValue.increment(1),
    },
    { merge: true }
  );
}

/** Increment duplicateCount on status doc. */
async function incrementDuplicateCount(db) {
  const statusRef = db.doc(STATUS_DOC_PATH);
  await statusRef.set(
    {
      duplicateCount: admin.firestore.FieldValue.increment(1),
      lastWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Record an error on the status doc. */
async function recordError(message) {
  try {
    const db = getFirestore();
    const statusRef = db.doc(STATUS_DOC_PATH);
    await statusRef.set(
      {
        lastErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        lastErrorMessage: String(message).slice(0, 500),
      },
      { merge: true }
    );
  } catch (_ignored) {
    // Best-effort — don't let status writes block error handling
  }
}

/* ------------------------------------------------------------------ */
/*  Read status                                                       */
/* ------------------------------------------------------------------ */

/**
 * Read the current CallDrip ingestion status.
 * @returns {Promise<object>} status fields (or defaults if doc missing)
 */
async function readStatus() {
  const db = getFirestore();
  const snap = await db.doc(STATUS_DOC_PATH).get();
  const defaults = {
    lastWebhookReceivedAt: null,
    lastEventOccurredAt: null,
    lastSuccessfulPersistAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    eventsReceivedCount: 0,
    duplicateCount: 0,
  };
  if (!snap.exists) return { ...defaults, fresh: false, exists: false };

  const data = snap.data();
  return {
    ...defaults,
    ...data,
    exists: true,
    fresh: isFresh(data.lastWebhookReceivedAt),
  };
}

/** Consider "fresh" if last webhook received within the last 24 hours. */
function isFresh(ts) {
  if (!ts) return false;
  const millis = typeof ts.toMillis === "function" ? ts.toMillis() : Number(ts);
  return Date.now() - millis < 24 * 60 * 60 * 1000;
}

module.exports = {
  buildDedupeKey,
  storeRawEvent,
  recordError,
  readStatus,
  RAW_EVENTS_COLLECTION,
  STATUS_DOC_PATH,
};
