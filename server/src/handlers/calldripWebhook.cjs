/**
 * CallDrip webhook handler — POST /webhooks/calldrip/v1/events
 *
 * Responsibilities:
 *   1. Authenticate via shared secret
 *   2. Parse + validate body
 *   3. Persist raw event (with idempotent dedupe)
 *   4. Return fast 2xx
 *
 * @module calldripWebhook
 */

"use strict";

const express = require("express");
const { storeRawEvent, recordError } = require("../lib/calldripStore.cjs");

const router = express.Router();

/* ------------------------------------------------------------------ */
/*  Auth middleware                                                    */
/* ------------------------------------------------------------------ */

/**
 * Validate the inbound webhook request's shared secret.
 *
 * Accepts either:
 *   - Authorization: Bearer <token>
 *   - X-CallDrip-Token: <token>
 *
 * The expected token is read from CALLDRIP_WEBHOOK_SECRET env var.
 */
function verifyWebhookAuth(req, res, next) {
  const expected = process.env.CALLDRIP_WEBHOOK_SECRET;

  // If no secret configured, reject all webhook requests for safety
  if (!expected) {
    console.error("[CallDrip] CALLDRIP_WEBHOOK_SECRET not configured — rejecting request");
    return res.status(503).json({ error: "Webhook secret not configured" });
  }

  // Extract token from Authorization header or custom header
  let token = null;
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
  if (!token) {
    token = req.headers["x-calldrip-token"] || null;
  }

  if (!token) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  // Constant-time comparison to prevent timing attacks
  const expected_buf = Buffer.from(expected);
  const token_buf = Buffer.from(token);
  if (expected_buf.length !== token_buf.length || !require("crypto").timingSafeEqual(expected_buf, token_buf)) {
    return res.status(403).json({ error: "Invalid authentication token" });
  }

  next();
}

/* ------------------------------------------------------------------ */
/*  Sanitize headers for storage                                      */
/* ------------------------------------------------------------------ */

const SAFE_HEADERS = [
  "content-type",
  "user-agent",
  "x-request-id",
  "x-calldrip-token",        // presence only, value redacted below
  "x-forwarded-for",
  "x-cloud-trace-context",
];

function sanitizeHeaders(headers) {
  const result = {};
  for (const key of SAFE_HEADERS) {
    if (headers[key]) {
      // Redact secret-bearing headers to presence only
      if (key === "x-calldrip-token" || key === "authorization") {
        result[key] = "[REDACTED]";
      } else {
        result[key] = headers[key];
      }
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                     */
/* ------------------------------------------------------------------ */

router.post("/", verifyWebhookAuth, async (req, res) => {
  const startMs = Date.now();

  try {
    const payload = req.body;

    if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "Empty or invalid JSON body" });
    }

    const headersSummary = sanitizeHeaders(req.headers);
    const result = await storeRawEvent(payload, headersSummary);

    const elapsedMs = Date.now() - startMs;

    if (result.duplicate) {
      console.log(`[CallDrip] Duplicate event ignored (dedupeKey=${result.dedupeKey}) [${elapsedMs}ms]`);
      return res.status(200).json({
        accepted: true,
        duplicate: true,
        dedupeKey: result.dedupeKey,
        elapsedMs,
      });
    }

    console.log(`[CallDrip] Event stored (dedupeKey=${result.dedupeKey}) [${elapsedMs}ms]`);
    return res.status(201).json({
      accepted: true,
      stored: true,
      dedupeKey: result.dedupeKey,
      elapsedMs,
    });
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    console.error(`[CallDrip] Error processing webhook [${elapsedMs}ms]:`, err.message);
    await recordError(err.message);
    return res.status(500).json({ error: "Internal processing error" });
  }
});

module.exports = router;
