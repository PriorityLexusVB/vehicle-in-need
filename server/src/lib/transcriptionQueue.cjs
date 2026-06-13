/**
 * Transcription job queue for downstream Whisper Turbo re-transcription.
 *
 * v1.5.0 commit 2 — when a CallDrip webhook payload arrives with
 * `recording_url` AND `duration >= 30s`, enqueue a transcription job for
 * commit 3's `re-transcribe-call.mjs` worker to consume.
 *
 * Schema (one doc per callId, race-safe via .create()):
 *   collection: calldrip_transcription_queue
 *   doc id:     <callId>
 *   fields:
 *     callId:           string                — also the doc id, for joins
 *     leadKey:          "<personId>:<dealId>" — optional, may be null
 *     recordingUrl:     string                — Twilio recording URL
 *     direction:        "inbound" | "outbound" | "unknown"
 *     durationSeconds:  number
 *     enqueuedAt:       Firestore timestamp
 *     status:           "pending" — worker flips to "complete" / "failed"
 *     attempts:         number    — worker increments on retry
 *
 * Idempotency: .create() (not .set()) fails on duplicate callId, preventing
 * race condition where two webhook deliveries enqueue the same call twice.
 *
 * @module transcriptionQueue
 */

"use strict";

const { getFirestore, admin } = require("./firebaseAdmin.cjs");

const TRANSCRIPTION_QUEUE_COLLECTION = "calldrip_transcription_queue";

// Gate per v1.5.0 spec — re-transcribe only when:
//   - recording_url is present (no audio = nothing to transcribe)
//   - duration >= 30s (calls under 30s are VM/hangups with no useful audio)
const MIN_DURATION_SECONDS = 30;

/**
 * Inspect a CallDrip webhook payload for transcription eligibility.
 * Returns the recording_url + metadata if eligible, null otherwise.
 *
 * Tolerates field-name drift across CallDrip webhook variants:
 *   - recording_url / recordingUrl / call.recording_url / scored_call.recording_url
 *   - duration / duration_seconds / call.duration / scored_call.duration_seconds
 *
 * @param {object} payload — parsed (and PII-redacted) webhook body
 * @returns {{ callId: string, recordingUrl: string, durationSeconds: number,
 *             direction: string, leadKey: string|null } | null}
 */
function extractTranscriptionJob(payload) {
  if (!payload || typeof payload !== "object") return null;

  const call = payload.call || payload.scored_call || payload;
  const callId = String(
    payload.call_id || payload.callId || call.call_id || call.callId || call.id || "",
  ).trim();
  if (!callId) return null;

  const recordingUrl = String(
    payload.recording_url ||
      payload.recordingUrl ||
      call.recording_url ||
      call.recordingUrl ||
      "",
  ).trim();
  if (!recordingUrl) return null;

  const durationSeconds = Number(
    payload.duration ||
      payload.duration_seconds ||
      call.duration ||
      call.duration_seconds ||
      call.callDuration ||
      0,
  );
  if (!Number.isFinite(durationSeconds) || durationSeconds < MIN_DURATION_SECONDS) {
    return null;
  }

  const directionRaw = String(
    payload.direction || call.direction || payload.source || "",
  ).toLowerCase();
  const direction = directionRaw.includes("inbound")
    ? "inbound"
    : directionRaw.includes("outbound")
    ? "outbound"
    : "unknown";

  const personId = payload.person_id || payload.personId || call.person_id || null;
  const dealId = payload.deal_id || payload.dealId || call.deal_id || null;
  const leadKey = personId && dealId ? `${personId}:${dealId}` : null;

  return { callId, recordingUrl, durationSeconds, direction, leadKey };
}

/**
 * Enqueue a transcription job. Idempotent per callId (race-safe).
 *
 * @param {ReturnType<typeof extractTranscriptionJob>} job
 * @returns {Promise<{ enqueued: boolean, alreadyQueued?: boolean, callId: string }>}
 */
async function enqueueTranscription(job) {
  if (!job) return { enqueued: false, callId: null };

  const db = getFirestore();
  const docRef = db.collection(TRANSCRIPTION_QUEUE_COLLECTION).doc(job.callId);

  try {
    await docRef.create({
      callId: job.callId,
      leadKey: job.leadKey,
      recordingUrl: job.recordingUrl,
      direction: job.direction,
      durationSeconds: job.durationSeconds,
      status: "pending",
      attempts: 0,
      enqueuedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { enqueued: true, callId: job.callId };
  } catch (err) {
    // ALREADY_EXISTS code 6 — duplicate webhook delivery for same callId
    if (err && (err.code === 6 || /already exists/i.test(err.message || ""))) {
      return { enqueued: false, alreadyQueued: true, callId: job.callId };
    }
    throw err;
  }
}

module.exports = {
  TRANSCRIPTION_QUEUE_COLLECTION,
  MIN_DURATION_SECONDS,
  extractTranscriptionJob,
  enqueueTranscription,
};
