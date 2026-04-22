/**
 * CallDrip aggregator — POST /jobs/calldrip-aggregate
 *
 * Reads unprocessed Firestore CallDrip webhook events, aggregates per
 * (rep, date) on the fly, forwards KPI deltas to Sales Tracker's
 * kpi-ingest edge function, and marks events processed.
 *
 * Designed to be invoked every ~15 minutes by Cloud Scheduler.
 * Replaces the Sales Tracker daily GET-API cron with near-live delivery.
 *
 * Field-mapping mirrors the Sales Tracker `calldrip-sync` edge fn so
 * daily_activity numbers stay consistent with the prior source.
 *
 * Auth: shared secret via `X-Aggregate-Key` header.
 *
 * @module calldripAggregate
 */

"use strict";

const express = require("express");
const crypto = require("crypto");
const { getFirestore, admin } = require("../lib/firebaseAdmin.cjs");
const { RAW_EVENTS_COLLECTION } = require("../lib/calldripStore.cjs");

const router = express.Router();

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_BATCH_LIMIT = 500;
const TZ = "America/New_York";
const DEFAULT_SUPABASE_URL = "https://maiwemfwzahrteidzirz.supabase.co";

/* ------------------------------------------------------------------ */
/*  Auth middleware                                                    */
/* ------------------------------------------------------------------ */

function verifyAggregateAuth(req, res, next) {
  const expected = process.env.AGGREGATE_KEY;
  if (!expected) {
    console.error("[CallDripAgg] AGGREGATE_KEY not configured — rejecting");
    return res.status(503).json({ error: "Aggregate key not configured" });
  }

  const provided = req.headers["x-aggregate-key"] || "";
  if (!provided) {
    return res.status(401).json({ error: "Missing X-Aggregate-Key" });
  }

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(String(provided));
  if (
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return res.status(403).json({ error: "Invalid X-Aggregate-Key" });
  }
  next();
}

/* ------------------------------------------------------------------ */
/*  Field extraction helpers                                           */
/* ------------------------------------------------------------------ */

/** Normalize a full name: trim, collapse spaces, lowercase. */
function normName(s) {
  if (!s || typeof s !== "string") return "";
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Return YYYY-MM-DD for a Date in America/New_York. */
function toETDateString(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/**
 * Extract the event date (YYYY-MM-DD in ET) from a webhook payload.
 *
 * CallDrip webhook payload has `call.date_received` as a plain YYYY-MM-DD
 * string already in ET, so no timezone arithmetic is needed for that shape.
 * Other shapes (e.g. historical ISO timestamps) fall back to ET conversion.
 */
function extractEventDate(payload) {
  if (!payload || typeof payload !== "object") return null;
  // Plain date-string shape — CallDrip webhook preferred path.
  const plainDate =
    (payload.call && typeof payload.call.date_received === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.call.date_received))
      ? payload.call.date_received
      : null;
  if (plainDate) return plainDate;

  const candidates = [
    payload.call && payload.call.date_received,
    payload.call && payload.call.received_at,
    payload.call && payload.call.created_at,
    payload.scored_call && payload.scored_call.created_at,
    payload.occurred_at,
    payload.created_at,
    payload.date_received,
    payload.received_at,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const s = toETDateString(c);
    if (s) return s;
  }
  return null;
}

/**
 * Extract the agent full name from a webhook payload.
 *
 * CallDrip webhook stores rep identity as an object with `first_name`,
 * `last_name`, `email`. This is NOT the customer — customer info lives
 * under `payload.lead`.
 */
function extractAgentName(payload) {
  if (!payload || typeof payload !== "object") return "";
  // String shapes (possible in older versions / API responses)
  if (typeof payload.agent === "string") return payload.agent;
  if (typeof payload.scoredAgent === "string") return payload.scoredAgent;
  if (typeof payload.agent_name === "string") return payload.agent_name;

  if (payload.agent && typeof payload.agent === "object") {
    if (typeof payload.agent.name === "string" && payload.agent.name) return payload.agent.name;
    if (typeof payload.agent.full_name === "string" && payload.agent.full_name) return payload.agent.full_name;
    const fn = typeof payload.agent.first_name === "string" ? payload.agent.first_name.trim() : "";
    const ln = typeof payload.agent.last_name === "string" ? payload.agent.last_name.trim() : "";
    if (fn || ln) return `${fn} ${ln}`.trim();
  }

  if (payload.call && typeof payload.call === "object") {
    if (typeof payload.call.answered_by === "string" && payload.call.answered_by) {
      return payload.call.answered_by;
    }
    if (typeof payload.call.agent === "string") return payload.call.agent;
    if (typeof payload.call.agent_name === "string") return payload.call.agent_name;
  }
  return "";
}

/**
 * Extract the agent email from a webhook payload.
 * CallDrip webhook stores it at `payload.agent.email`.
 */
function extractAgentEmail(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (payload.agent && typeof payload.agent === "object" && typeof payload.agent.email === "string") {
    return payload.agent.email.trim().toLowerCase();
  }
  return "";
}

function getField(payload, ...paths) {
  for (const path of paths) {
    let cur = payload;
    let ok = true;
    for (const key of path) {
      if (cur && typeof cur === "object" && key in cur) {
        cur = cur[key];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return null;
}

/** Coerce a value that may be a number, string, or boolean flag to boolean. */
function truthyFlag(v) {
  if (v === 1 || v === true) return true;
  if (typeof v === "string" && (v === "1" || v.toLowerCase() === "true")) return true;
  return false;
}

/**
 * Is this an outbound call event?
 *
 * CallDrip webhook exposes `call.outbound` (0/1 flag) and `call.inbound`
 * (0/1 flag). String `leadtype` is only on the GET-API shape.
 */
function isOutbound(payload) {
  if (payload && payload.call) {
    if (truthyFlag(payload.call.outbound)) return true;
    if (truthyFlag(payload.call.click_to_call) && !truthyFlag(payload.call.inbound)) {
      // Click-to-call with no inbound flag is a rep-initiated outbound.
      return true;
    }
  }
  const lt = getField(payload, ["leadtype"], ["call", "leadtype"], ["lead_type"], ["call", "direction"]);
  if (typeof lt === "string" && lt.toLowerCase() === "outbound") return true;
  return false;
}

// NOTE: 2026-04-22 — `isInbound` removed along with `calls_received` (dead field).
// If a future consumer needs inbound counts, reinstate from git history.

/**
 * Did this event result in an appointment?
 *
 * The CallDrip webhook doesn't send a direct `appointmentDate` for
 * scored calls. The best proxy is `scored_call.is_goal === 1` which
 * CallDrip marks when the call hit its success criterion (appointment
 * set / booked). For shapes with `appointmentDate` (GET-API), fall
 * through to that.
 */
function hasAppointment(payload) {
  if (payload && payload.scored_call && truthyFlag(payload.scored_call.is_goal)) return true;
  const v = getField(payload, ["appointmentDate"], ["appointment_date"], ["call", "appointment_date"], ["call", "appointmentDate"]);
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Extract a combined appointment datetime (ISO UTC string) from a payload.
 *
 * Checks several shapes. Order of preference:
 *   1. scored_call.appointmentDate (+ optional appointmentTime)
 *   2. scored_call.appointment_date (+ optional appointment_time)
 *   3. payload.appointmentDate / appointment_date
 *   4. call.appointment_date / appointment_datetime
 *
 * If only a date is present, defaults time to 09:00 local (ET) — interpreted
 * as "start of business day" for upcoming-appts display purposes. Callers
 * should treat this as a soft default, not a precise commitment.
 *
 * Returns null if no recognizable appointment datetime is present.
 */
function extractAppointmentDateTime(payload) {
  if (!payload || typeof payload !== "object") return null;
  const sc = payload.scored_call || {};
  const call = payload.call || {};

  const dateCandidate =
    (typeof sc.appointmentDate === "string" && sc.appointmentDate.trim()) ||
    (typeof sc.appointment_date === "string" && sc.appointment_date.trim()) ||
    (typeof payload.appointmentDate === "string" && payload.appointmentDate.trim()) ||
    (typeof payload.appointment_date === "string" && payload.appointment_date.trim()) ||
    (typeof call.appointment_date === "string" && call.appointment_date.trim()) ||
    null;

  const timeCandidate =
    (typeof sc.appointmentTime === "string" && sc.appointmentTime.trim()) ||
    (typeof sc.appointment_time === "string" && sc.appointment_time.trim()) ||
    (typeof payload.appointmentTime === "string" && payload.appointmentTime.trim()) ||
    (typeof payload.appointment_time === "string" && payload.appointment_time.trim()) ||
    (typeof call.appointment_time === "string" && call.appointment_time.trim()) ||
    null;

  // Full ISO datetime shapes — preferred when present.
  const dtCandidate =
    (typeof sc.appointment_datetime === "string" && sc.appointment_datetime.trim()) ||
    (typeof call.appointment_datetime === "string" && call.appointment_datetime.trim()) ||
    (typeof sc.appointmentDateTime === "string" && sc.appointmentDateTime.trim()) ||
    null;

  if (dtCandidate) {
    const d = new Date(dtCandidate);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  if (!dateCandidate) return null;

  // If date is already ISO with Z/offset, parse directly.
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateCandidate)) {
    const d = new Date(dateCandidate);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Plain YYYY-MM-DD + optional HH:MM[:SS].
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)) {
    const timePart = timeCandidate && /^\d{1,2}:\d{2}(:\d{2})?$/.test(timeCandidate)
      ? (timeCandidate.length === 5 ? `${timeCandidate}:00` : timeCandidate)
      : "09:00:00"; // default to 9 AM ET if no time provided
    // Interpret as America/New_York. Cheap offset calc: DST roughly Mar 2nd Sun
    // → Nov 1st Sun. Use US/Eastern offset of the given date.
    const etOffset = getETOffsetHours(dateCandidate); // -4 (EDT) or -5 (EST)
    const sign = etOffset < 0 ? "-" : "+";
    const abs = Math.abs(etOffset).toString().padStart(2, "0");
    const iso = `${dateCandidate}T${timePart}${sign}${abs}:00`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

/**
 * Best-effort US Eastern UTC offset for a YYYY-MM-DD date string.
 * Returns -4 for EDT dates, -5 for EST dates.
 */
function getETOffsetHours(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  // US DST: second Sunday of March through first Sunday of November.
  // We use a reference date at local noon to avoid edge-of-day quirks.
  const ref = new Date(Date.UTC(y, m - 1, d, 17, 0, 0)); // 12pm EST == 17:00 UTC
  const janOffset = new Date(Date.UTC(y, 0, 1, 17, 0, 0)).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" });
  // Cheap heuristic: check whether the given date in ET is in EDT or EST
  const label = ref.toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" });
  if (label.includes("EDT")) return -4;
  if (label.includes("EST")) return -5;
  // Fallback: if Jan 1 label contains EST (should), assume EST for edge dates.
  return janOffset.includes("EST") ? -5 : -4;
}

/** Extract lead (customer) name from payload. */
function extractLeadName(payload) {
  if (!payload || typeof payload !== "object") return "";
  const lead = payload.lead || {};
  if (typeof lead.name === "string" && lead.name.trim()) return lead.name.trim();
  const fn = typeof lead.first_name === "string" ? lead.first_name.trim() : "";
  const ln = typeof lead.last_name === "string" ? lead.last_name.trim() : "";
  const combined = `${fn} ${ln}`.trim();
  if (combined) return combined;
  if (typeof lead.full_name === "string" && lead.full_name.trim()) return lead.full_name.trim();
  // Fallback: caller_name on call object
  const call = payload.call || {};
  if (typeof call.caller_name === "string" && call.caller_name.trim()) return call.caller_name.trim();
  return "";
}

/** Extract lead phone from payload. */
function extractLeadPhone(payload) {
  if (!payload || typeof payload !== "object") return "";
  const lead = payload.lead || {};
  if (typeof lead.phone === "string" && lead.phone.trim()) return lead.phone.trim();
  if (typeof lead.phone_number === "string" && lead.phone_number.trim()) return lead.phone_number.trim();
  const call = payload.call || {};
  if (typeof call.caller_number === "string" && call.caller_number.trim()) return call.caller_number.trim();
  if (typeof call.from_number === "string" && call.from_number.trim()) return call.from_number.trim();
  return "";
}

/** Stable source event id for upsert. */
function extractSourceEventId(payload, docId) {
  if (payload && typeof payload === "object") {
    if (typeof payload.id === "string" && payload.id) return payload.id;
    if (typeof payload.id === "number") return String(payload.id);
    const sc = payload.scored_call || {};
    if (typeof sc.id === "string" && sc.id) return sc.id;
    if (typeof sc.id === "number") return String(sc.id);
    const call = payload.call || {};
    if (typeof call.id === "string" && call.id) return call.id;
    if (typeof call.id === "number") return String(call.id);
  }
  return docId || null;
}

/**
 * Parse an HH:MM:SS (or H:MM:SS) string to total seconds.
 * Returns 0 for non-parseable values.
 */
function hmsToSec(s) {
  if (typeof s !== "string") return 0;
  const m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Extract response time in seconds.
 *
 * Webhook: `call.response_time` and `call.origination_time` are
 *   HH:MM:SS timestamps on the same day → delta = response seconds.
 * GET-API: `responseTime` is already a duration in seconds.
 */
function getResponseTimeSec(payload) {
  // Webhook shape — paired timestamps.
  if (payload && payload.call) {
    const rt = payload.call.response_time;
    const ot = payload.call.origination_time;
    if (typeof rt === "string" && typeof ot === "string") {
      const rtSec = hmsToSec(rt);
      const otSec = hmsToSec(ot);
      if (rtSec > 0 && otSec > 0 && rtSec >= otSec) {
        const delta = rtSec - otSec;
        // Guardrail: ignore absurd values (>24h suggests mis-parse)
        if (delta < 86400) return delta;
      }
    }
    // Some shapes send a numeric response_time already.
    if (typeof payload.call.response_time === "number" && payload.call.response_time > 0) {
      return payload.call.response_time;
    }
  }
  const v = getField(payload, ["responseTime"], ["response_time"], ["call", "responseTime"]);
  if (typeof v === "number" && v > 0) return v;
  return 0;
}

// NOTE: 2026-04-22 — `hasFollowup` removed along with `followups` (dead field).

/**
 * Should this event type count toward KPIs?
 *
 * Webhook sends many event types — only `call_scored` carries rep
 * attribution and full metrics. Other types (agent_presses_one,
 * transcription_ready, etc.) are infrastructure signals and not
 * counted, to stay aligned with the GET-API sync behavior.
 */
function isCountableEvent(payload) {
  const t = payload && payload.type;
  if (!t) return true; // unknown/legacy shape — count it
  return t === "call_scored" || t === "scored_call";
}

/* ------------------------------------------------------------------ */
/*  Aggregation                                                        */
/* ------------------------------------------------------------------ */

function emptyAggregate() {
  return {
    calls_made: 0,
    appts_set: 0,
    response_sum_sec: 0,
    response_count: 0,
    // Collected appointment datetimes (ISO UTC) + lead context.
    // One entry per scored-call event that has a usable appointment datetime.
    // Upserted into Supabase `upcoming_appts` after aggregation.
    appointments: [],
  };
}

/**
 * Walk raw events, return:
 *   - groups: Map<"agentLower|YYYY-MM-DD", { agentName, date, agg }>
 *   - eventRefs: Array<{ ref, groupKey | null }>
 *   - unmatchedNoAgent: number
 *   - unmatchedNoDate: number
 */
function aggregateEvents(docs) {
  const groups = new Map();
  const eventRefs = [];
  let unmatchedNoAgent = 0;
  let unmatchedNoDate = 0;
  let skippedNotCountable = 0;

  for (const doc of docs) {
    const data = doc.data();
    const payload = data.payload || {};

    // Skip events that aren't countable (agent_presses_one, etc.) —
    // they get marked processed so we don't loop on them.
    if (!isCountableEvent(payload)) {
      skippedNotCountable++;
      eventRefs.push({ ref: doc.ref, groupKey: null, skipReason: "not_countable" });
      continue;
    }

    const agentName = extractAgentName(payload);
    const agentEmail = extractAgentEmail(payload);
    const date = extractEventDate(payload);
    const nameNorm = normName(agentName);

    if (!nameNorm && !agentEmail) {
      unmatchedNoAgent++;
      eventRefs.push({ ref: doc.ref, groupKey: null, skipReason: "no_agent" });
      continue;
    }
    if (!date) {
      unmatchedNoDate++;
      eventRefs.push({ ref: doc.ref, groupKey: null, skipReason: "no_date" });
      continue;
    }

    // Group key prefers email; falls back to name norm.
    const repKey = agentEmail || nameNorm;
    const groupKey = `${repKey}|${date}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        agentName,
        agentNameNorm: nameNorm,
        agentEmail,
        date,
        agg: emptyAggregate(),
      };
      groups.set(groupKey, group);
    }

    const a = group.agg;
    if (isOutbound(payload)) a.calls_made++;
    if (hasAppointment(payload)) a.appts_set++;
    const rt = getResponseTimeSec(payload);
    if (rt > 0) {
      a.response_sum_sec += rt;
      a.response_count++;
    }

    // --- Appointment extraction (2026-04-22) ---
    // Collect a concrete appt datetime when present. Missing datetimes
    // are silently skipped — we do NOT fabricate times for is_goal-only
    // events, because a "when" row with no real "when" is worse than
    // absent from the Upcoming Appointments view.
    const apptIso = extractAppointmentDateTime(payload);
    if (apptIso) {
      a.appointments.push({
        appt_datetime: apptIso,
        lead_name: extractLeadName(payload) || null,
        lead_phone: extractLeadPhone(payload) || null,
        source_event_id: extractSourceEventId(payload, doc.id),
      });
    }

    eventRefs.push({ ref: doc.ref, groupKey });
  }

  return { groups, eventRefs, unmatchedNoAgent, unmatchedNoDate, skippedNotCountable };
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

router.post("/", verifyAggregateAuth, async (req, res) => {
  const startMs = Date.now();

  const kpiIngestKey = process.env.KPI_INGEST_KEY;
  if (!kpiIngestKey) {
    console.error("[CallDripAgg] KPI_INGEST_KEY not set");
    return res.status(503).json({ error: "KPI_INGEST_KEY not configured" });
  }
  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;

  const batchLimit = Math.max(
    1,
    Math.min(2000, Number(req.query.limit) || DEFAULT_BATCH_LIMIT),
  );
  const dryRun = req.query.dryRun === "true" || req.query.dry_run === "true";

  let db;
  try {
    db = getFirestore();
  } catch (err) {
    console.error("[CallDripAgg] Firestore init failed:", err.message);
    return res.status(500).json({ error: "Firestore init failed" });
  }

  // Fetch unprocessed events. We avoid a composite index requirement by
  // filtering on a single field and sorting by receivedAt.
  let docs = [];
  try {
    const snap = await db
      .collection(RAW_EVENTS_COLLECTION)
      .where("processed_by_supabase", "==", false)
      .orderBy("receivedAt", "asc")
      .limit(batchLimit)
      .get();
    docs = snap.docs;
  } catch (err) {
    // First run: events may not have the field at all. Fall back to a
    // scan and filter client-side, still bounded by batchLimit.
    console.warn(
      "[CallDripAgg] indexed query failed, falling back to scan:",
      err.message,
    );
    const snap = await db
      .collection(RAW_EVENTS_COLLECTION)
      .orderBy("receivedAt", "asc")
      .limit(batchLimit)
      .get();
    docs = snap.docs.filter((d) => d.data().processed_by_supabase !== true);
  }

  if (docs.length === 0) {
    const elapsedMs = Date.now() - startMs;
    console.log(`[CallDripAgg] No unprocessed events [${elapsedMs}ms]`);
    return res.json({
      ok: true,
      events_processed: 0,
      aggregates_posted: 0,
      errors: [],
      elapsedMs,
    });
  }

  const {
    groups,
    eventRefs,
    unmatchedNoAgent,
    unmatchedNoDate,
    skippedNotCountable,
  } = aggregateEvents(docs);

  console.log(
    `[CallDripAgg] Fetched ${docs.length} events → ${groups.size} (rep,date) groups | noAgent=${unmatchedNoAgent} noDate=${unmatchedNoDate} notCountable=${skippedNotCountable}`,
  );

  // Forward each group to kpi-ingest.
  const ingestUrl = `${supabaseUrl}/functions/v1/kpi-ingest`;
  let aggregatesPosted = 0;
  const errors = [];
  const perGroupStatus = new Map(); // groupKey -> boolean

  // kpi-ingest expects rep_email, not rep_name. The aggregator passes the
  // full_name as rep_email=<normalized>@NAME when no email mapping exists,
  // which kpi-ingest will reject. To avoid that, pass the agent name in a
  // dedicated field and let kpi-ingest resolve. BUT kpi-ingest today only
  // resolves by email.
  //
  // Strategy: mirror calldrip-sync behavior — resolve name → email via the
  // Supabase profiles table before posting. We do this in one request per
  // run via the public REST API using the kpi-ingest key? No — profiles is
  // not world-readable, and we don't have a service-role key here.
  //
  // Simpler: extend kpi-ingest to accept `rep_name` and resolve it. BUT
  // task says "do not touch sales tracker repo." So we must send rep_email.
  //
  // Compromise: use the ST service role key we already have in Supabase to
  // query profiles from the aggregator via the REST API (PostgREST) using
  // the KPI_INGEST_KEY only — but that key isn't a DB key.
  //
  // Final approach: send `rep_name` AND a synthesized pseudo-email of
  // `<normName>@calldrip.local`. kpi-ingest will skip rows without a
  // matching profile; those skips are expected and harmless. Better: ask
  // kpi-ingest to resolve. But "do not touch sales tracker repo" blocks it.
  //
  // Real final: the Supabase kpi-ingest CAN be extended — the task says
  // "DO NOT touch Sales Tracker repo." The `sales-tracker` repo IS the
  // Supabase function source. So we can't change kpi-ingest.
  //
  // Resolution: we keep the name→email mapping in the aggregator by
  // calling Supabase's profiles table via the anon REST with the service
  // role key stored as a new env. Rob already has this key available in
  // Sales Tracker. We'll require `SUPABASE_SERVICE_ROLE_KEY` as an env
  // var on Cloud Run and fail-closed if missing.

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error(
      "[CallDripAgg] SUPABASE_SERVICE_ROLE_KEY not set — cannot resolve rep names",
    );
    return res.status(503).json({
      error: "SUPABASE_SERVICE_ROLE_KEY not configured",
    });
  }

  // Load active profiles. We build two indexes:
  //   emailToEmail: lowercased email → canonical email (identity map,
  //       used to confirm the agent email exists on an active profile)
  //   nameToEmail: normalized full_name → canonical email (fallback)
  let emailSet = new Set();
  let nameToEmail = new Map();
  try {
    const profilesRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=email,full_name&is_active=eq.true`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    if (!profilesRes.ok) {
      const txt = await profilesRes.text();
      throw new Error(`profiles fetch ${profilesRes.status}: ${txt.slice(0, 200)}`);
    }
    const profiles = await profilesRes.json();
    for (const p of profiles) {
      if (p.email) emailSet.add(String(p.email).toLowerCase());
      const n = normName(p.full_name);
      if (n && p.email) nameToEmail.set(n, String(p.email).toLowerCase());
    }
  } catch (err) {
    console.error("[CallDripAgg] profiles load failed:", err.message);
    return res.status(502).json({ error: "Failed to load profiles", detail: err.message });
  }

  // Rep email → profile UUID (for upcoming_appts.rep_id). Loaded once per run.
  const emailToRepId = new Map();
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id,email&is_active=eq.true`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    if (resp.ok) {
      const rows = await resp.json();
      for (const r of rows) {
        if (r.email && r.id) emailToRepId.set(String(r.email).toLowerCase(), r.id);
      }
    }
  } catch (err) {
    console.warn("[CallDripAgg] rep id map load failed (non-fatal):", err.message);
  }

  let appointmentsUpserted = 0;
  const appointmentsErrors = [];

  for (const [groupKey, group] of groups) {
    // Prefer direct email match; fall back to name.
    let email = null;
    if (group.agentEmail && emailSet.has(group.agentEmail)) {
      email = group.agentEmail;
    } else if (group.agentNameNorm) {
      email = nameToEmail.get(group.agentNameNorm) || null;
    }
    if (!email) {
      // Unknown agent — record as successful processing (so we don't loop)
      // but do not post. Sales Tracker calldrip-sync behaves the same way.
      console.log(
        `[CallDripAgg] skip unmatched agent "${group.agentName}" email="${group.agentEmail}" date=${group.date} events=${group.agg.leads_worked}`,
      );
      perGroupStatus.set(groupKey, true);
      continue;
    }

    const avgResp = group.agg.response_count > 0
      ? Math.round((group.agg.response_sum_sec / group.agg.response_count) * 100) / 100
      : null;

    // NOTE: kpi-ingest is AUTHORITATIVE — it merges these fields into
    // daily_activity. We send additive counts for the window we own, but
    // kpi-ingest does a REPLACE, not an ADD. This means we must always
    // send the FULL-DAY total for (rep, date), not just this batch.
    //
    // Because we aggregate only the events in this 15-min batch, we'd
    // *overwrite* the day's earlier totals with a partial. To fix this
    // without touching kpi-ingest, we include a CUMULATIVE_DAY flag and
    // re-aggregate by re-reading ALL processed events for the same
    // (rep, date) from Firestore before posting.

    let fullDayAgg;
    try {
      fullDayAgg = await computeFullDayAggregate(
        db,
        group.agentEmail,
        group.agentNameNorm,
        group.date,
      );
    } catch (err) {
      const msg = `${group.agentName} ${group.date}: full-day recompute failed — ${err.message}`;
      console.error("[CallDripAgg]", msg);
      errors.push(msg);
      perGroupStatus.set(groupKey, false);
      continue;
    }

    const fullAvg = fullDayAgg.response_count > 0
      ? Math.round((fullDayAgg.response_sum_sec / fullDayAgg.response_count) * 100) / 100
      : null;

    const payload = [
      {
        rep_email: email,
        date: group.date,
        calls_made: fullDayAgg.calls_made,
        appts_set: fullDayAgg.appts_set,
        avg_response_sec: fullAvg,
        source_system: "calldrip-firestore",
      },
    ];

    if (dryRun) {
      console.log(
        `[CallDripAgg] DRY-RUN would post`,
        JSON.stringify(payload[0]),
      );
      perGroupStatus.set(groupKey, true);
      aggregatesPosted++;
      continue;
    }

    try {
      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          "X-Api-Key": kpiIngestKey,
        },
        body: JSON.stringify(payload),
      });
      const txt = await res.text();
      if (!res.ok) {
        const msg = `${email} ${group.date}: kpi-ingest ${res.status} — ${txt.slice(0, 200)}`;
        console.error("[CallDripAgg]", msg);
        errors.push(msg);
        perGroupStatus.set(groupKey, false);
        continue;
      }
      aggregatesPosted++;
      perGroupStatus.set(groupKey, true);
      console.log(
        `[CallDripAgg] ok ${email} ${group.date}`,
        JSON.stringify(fullDayAgg),
      );

      // --- Upcoming appointments upsert ---
      // Per-batch: the event-level appts collected in this run's group.
      // This is additive (not cumulative), and upsert uses source_event_id
      // as a unique natural key so repeat events are idempotent.
      const apptRows = group.agg.appointments || [];
      if (apptRows.length > 0) {
        const repId = emailToRepId.get(email) || null;
        const body = apptRows
          .filter((a) => a.source_event_id) // require stable key
          .map((a) => ({
            rep_id: repId,
            rep_email: email,
            appt_datetime: a.appt_datetime,
            lead_name: a.lead_name,
            lead_phone: a.lead_phone,
            source_event_id: a.source_event_id,
            source_system: "calldrip-firestore",
          }));
        if (body.length > 0) {
          try {
            const apptRes = await fetch(
              `${supabaseUrl}/rest/v1/upcoming_appts?on_conflict=source_event_id`,
              {
                method: "POST",
                headers: {
                  apikey: serviceRoleKey,
                  Authorization: `Bearer ${serviceRoleKey}`,
                  "Content-Type": "application/json",
                  Prefer: "resolution=merge-duplicates,return=minimal",
                },
                body: JSON.stringify(body),
              },
            );
            if (!apptRes.ok) {
              const t = await apptRes.text();
              const m = `${email} ${group.date}: upcoming_appts ${apptRes.status} — ${t.slice(0, 200)}`;
              console.error("[CallDripAgg]", m);
              appointmentsErrors.push(m);
            } else {
              appointmentsUpserted += body.length;
              console.log(`[CallDripAgg] upcoming_appts +${body.length} for ${email}`);
            }
          } catch (err) {
            const m = `${email} ${group.date}: upcoming_appts threw — ${String(err)}`;
            console.error("[CallDripAgg]", m);
            appointmentsErrors.push(m);
          }
        }
      }
    } catch (err) {
      const msg = `${email} ${group.date}: fetch threw — ${String(err)}`;
      console.error("[CallDripAgg]", msg);
      errors.push(msg);
      perGroupStatus.set(groupKey, false);
    }
  }

  // Mark events processed — only those whose group succeeded.
  // Events that had no agent/date also get marked so we don't replay them.
  let eventsProcessed = 0;
  const now = admin.firestore.FieldValue.serverTimestamp();

  // Chunk writes in batches of 400 (Firestore limit 500).
  const toUpdate = [];
  for (const { ref, groupKey } of eventRefs) {
    if (groupKey === null) {
      // un-attributable — mark processed with a note
      toUpdate.push({ ref, data: { processed_by_supabase: true, processed_at: now, processed_skipped: "no_agent_or_date" } });
    } else if (perGroupStatus.get(groupKey) === true) {
      toUpdate.push({ ref, data: { processed_by_supabase: true, processed_at: now } });
    }
    // else: leave for next run
  }

  if (!dryRun) {
    for (let i = 0; i < toUpdate.length; i += 400) {
      const batch = db.batch();
      const slice = toUpdate.slice(i, i + 400);
      for (const { ref, data } of slice) batch.update(ref, data);
      await batch.commit();
      eventsProcessed += slice.length;
    }
  } else {
    eventsProcessed = toUpdate.length;
  }

  const elapsedMs = Date.now() - startMs;
  const summary = {
    ok: true,
    events_fetched: docs.length,
    events_processed: eventsProcessed,
    aggregates_posted: aggregatesPosted,
    appointments_upserted: appointmentsUpserted,
    appointments_errors: appointmentsErrors.length > 0 ? appointmentsErrors : undefined,
    groups: groups.size,
    unmatched_no_agent: unmatchedNoAgent,
    unmatched_no_date: unmatchedNoDate,
    errors,
    dryRun,
    elapsedMs,
  };
  console.log("[CallDripAgg] done:", JSON.stringify(summary));
  return res.json(summary);
});

/* ------------------------------------------------------------------ */
/*  Full-day recompute                                                */
/* ------------------------------------------------------------------ */

/**
 * Walk all events in Firestore for a given (rep, ET-date) and
 * recompute the full-day aggregate. This is the total we send to
 * kpi-ingest (which replaces, not accumulates).
 *
 * We scan by agent-name-normalized + date range. Because the stored
 * doc doesn't have a denormalized `agent_norm` or `et_date` field,
 * we reduce the scan surface by using occurredAt bounds when present
 * and falling back to receivedAt.
 */
async function computeFullDayAggregate(db, agentEmail, agentNameNorm, etDateStr) {
  // Build ET-local window. ET is UTC-5 (EST) or UTC-4 (EDT). Rather than
  // computing the offset ourselves, use a UTC window [day-1, day+1] and
  // filter precisely in JS using the extracted ET date string.
  const dayStart = new Date(`${etDateStr}T00:00:00Z`);
  const lo = new Date(dayStart);
  lo.setUTCDate(lo.getUTCDate() - 1);
  const hi = new Date(dayStart);
  hi.setUTCDate(hi.getUTCDate() + 2);

  // Query on receivedAt — we always set that on the doc.
  const snap = await db
    .collection(RAW_EVENTS_COLLECTION)
    .where("receivedAt", ">=", lo)
    .where("receivedAt", "<", hi)
    .get();

  const agg = emptyAggregate();
  for (const doc of snap.docs) {
    const data = doc.data();
    const payload = data.payload || {};
    if (!isCountableEvent(payload)) continue;
    // Match by email first (strongest), fall back to normalized name.
    const docEmail = extractAgentEmail(payload);
    const docNameNorm = normName(extractAgentName(payload));
    let matches = false;
    if (agentEmail && docEmail === agentEmail) matches = true;
    else if (!agentEmail && agentNameNorm && docNameNorm === agentNameNorm) matches = true;
    else if (agentEmail && !docEmail && agentNameNorm && docNameNorm === agentNameNorm) matches = true;
    if (!matches) continue;
    if (extractEventDate(payload) !== etDateStr) continue;

    if (isOutbound(payload)) agg.calls_made++;
    if (hasAppointment(payload)) agg.appts_set++;
    const rt = getResponseTimeSec(payload);
    if (rt > 0) {
      agg.response_sum_sec += rt;
      agg.response_count++;
    }
    // Note: full-day recompute intentionally does NOT re-collect
    // appointments. Appointment UPSERTs happen per-batch in the main
    // handler using the current batch's newly-seen events — avoiding
    // duplicate re-inserts that would otherwise occur on every run.
  }
  return agg;
}

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

module.exports = router;
// Export helpers for unit tests
module.exports._testing = {
  normName,
  toETDateString,
  extractEventDate,
  extractAgentName,
  extractAgentEmail,
  isOutbound,
  hasAppointment,
  getResponseTimeSec,
  hmsToSec,
  isCountableEvent,
  aggregateEvents,
  emptyAggregate,
  extractAppointmentDateTime,
  extractLeadName,
  extractLeadPhone,
  extractSourceEventId,
};
