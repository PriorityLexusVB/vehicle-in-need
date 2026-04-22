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
 * Walks several known shapes in order of preference.
 */
function extractEventDate(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.call && payload.call.date_received,
    payload.call && payload.call.received_at,
    payload.call && payload.call.created_at,
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

/** Extract the agent full name from a webhook payload. */
function extractAgentName(payload) {
  if (!payload || typeof payload !== "object") return "";
  // Common shapes across CallDrip webhook versions + API responses
  if (typeof payload.agent === "string") return payload.agent;
  if (payload.agent && typeof payload.agent === "object") {
    if (typeof payload.agent.name === "string") return payload.agent.name;
    if (typeof payload.agent.full_name === "string") return payload.agent.full_name;
  }
  if (typeof payload.scoredAgent === "string") return payload.scoredAgent;
  if (payload.call && typeof payload.call === "object") {
    if (typeof payload.call.agent === "string") return payload.call.agent;
    if (payload.call.agent && typeof payload.call.agent === "object") {
      if (typeof payload.call.agent.name === "string") return payload.call.agent.name;
      if (typeof payload.call.agent.full_name === "string") return payload.call.agent.full_name;
    }
    if (typeof payload.call.agent_name === "string") return payload.call.agent_name;
  }
  if (typeof payload.agent_name === "string") return payload.agent_name;
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

/** Is this a scored/outbound call event? */
function isOutbound(payload) {
  const lt = getField(payload, ["leadtype"], ["call", "leadtype"], ["lead_type"], ["call", "direction"]);
  if (typeof lt === "string" && lt.toLowerCase() === "outbound") return true;
  return false;
}

function isInbound(payload) {
  const lt = getField(payload, ["leadtype"], ["call", "leadtype"], ["lead_type"], ["call", "direction"]);
  if (typeof lt === "string" && lt.toLowerCase() === "inbound") return true;
  if (!isOutbound(payload) && (lt === null || lt === "")) return true;
  return false;
}

function hasAppointment(payload) {
  const v = getField(payload, ["appointmentDate"], ["appointment_date"], ["call", "appointment_date"], ["call", "appointmentDate"]);
  return typeof v === "string" && v.trim().length > 0;
}

function getResponseTimeSec(payload) {
  const v = getField(payload, ["responseTime"], ["response_time"], ["call", "response_time"], ["call", "responseTime"]);
  if (typeof v === "number" && v > 0) return v;
  return 0;
}

function hasFollowup(payload) {
  const v = getField(payload, ["coachNotes"], ["coach_notes"], ["call", "coach_notes"], ["call", "coachNotes"]);
  return typeof v === "string" && v.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/*  Aggregation                                                        */
/* ------------------------------------------------------------------ */

function emptyAggregate() {
  return {
    calls_made: 0,
    calls_received: 0,
    appts_set: 0,
    leads_worked: 0,
    response_sum_sec: 0,
    response_count: 0,
    followups: 0,
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

  for (const doc of docs) {
    const data = doc.data();
    const payload = data.payload || {};
    const agentName = extractAgentName(payload);
    const date = extractEventDate(payload);
    const nameNorm = normName(agentName);

    if (!nameNorm) {
      unmatchedNoAgent++;
      eventRefs.push({ ref: doc.ref, groupKey: null });
      continue;
    }
    if (!date) {
      unmatchedNoDate++;
      eventRefs.push({ ref: doc.ref, groupKey: null });
      continue;
    }

    const groupKey = `${nameNorm}|${date}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { agentName, agentNameNorm: nameNorm, date, agg: emptyAggregate() };
      groups.set(groupKey, group);
    }

    const a = group.agg;
    a.leads_worked++;
    if (isOutbound(payload)) a.calls_made++;
    else if (isInbound(payload)) a.calls_received++;
    if (hasAppointment(payload)) a.appts_set++;
    const rt = getResponseTimeSec(payload);
    if (rt > 0) {
      a.response_sum_sec += rt;
      a.response_count++;
    }
    if (hasFollowup(payload)) a.followups++;

    eventRefs.push({ ref: doc.ref, groupKey });
  }

  return { groups, eventRefs, unmatchedNoAgent, unmatchedNoDate };
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

  const { groups, eventRefs, unmatchedNoAgent, unmatchedNoDate } =
    aggregateEvents(docs);

  console.log(
    `[CallDripAgg] Fetched ${docs.length} events → ${groups.size} (rep,date) groups | noAgent=${unmatchedNoAgent} noDate=${unmatchedNoDate}`,
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

  // Load active profiles name→email map.
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
      const n = normName(p.full_name);
      if (n && p.email) nameToEmail.set(n, String(p.email).toLowerCase());
    }
  } catch (err) {
    console.error("[CallDripAgg] profiles load failed:", err.message);
    return res.status(502).json({ error: "Failed to load profiles", detail: err.message });
  }

  for (const [groupKey, group] of groups) {
    const email = nameToEmail.get(group.agentNameNorm);
    if (!email) {
      // Unknown agent — record as successful processing (so we don't loop)
      // but do not post. Sales Tracker calldrip-sync behaves the same way.
      console.log(
        `[CallDripAgg] skip unmatched agent "${group.agentName}" date=${group.date} events=${group.agg.leads_worked}`,
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
        calls_received: fullDayAgg.calls_received,
        appts_set: fullDayAgg.appts_set,
        leads_worked: fullDayAgg.leads_worked,
        avg_response_sec: fullAvg,
        followups: fullDayAgg.followups,
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
async function computeFullDayAggregate(db, agentNameNorm, etDateStr) {
  // Build ET-local window. ET is UTC-5 (EST) or UTC-4 (EDT). Rather than
  // computing the offset ourselves, use a UTC window [day-1, day+1] and
  // filter precisely in JS using the ET toDateString conversion.
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
    if (normName(extractAgentName(payload)) !== agentNameNorm) continue;
    if (extractEventDate(payload) !== etDateStr) continue;

    agg.leads_worked++;
    if (isOutbound(payload)) agg.calls_made++;
    else if (isInbound(payload)) agg.calls_received++;
    if (hasAppointment(payload)) agg.appts_set++;
    const rt = getResponseTimeSec(payload);
    if (rt > 0) {
      agg.response_sum_sec += rt;
      agg.response_count++;
    }
    if (hasFollowup(payload)) agg.followups++;
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
  isOutbound,
  isInbound,
  hasAppointment,
  getResponseTimeSec,
  hasFollowup,
  aggregateEvents,
  emptyAggregate,
};
