/**
 * CallDrip status handler — GET /api/calldrip/status
 *
 * Returns current ingestion health/status without requiring auth
 * (it exposes only aggregate metadata, no PII or payload data).
 *
 * @module calldripStatus
 */

"use strict";

const express = require("express");
const { readStatus } = require("../lib/calldripStore.cjs");

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const status = await readStatus();
    return res.json({
      service: "calldrip-ingestion",
      enabled: process.env.CALLDRIP_ENABLE_WEBHOOK === "true",
      ...status,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[CallDrip] Error reading status:", err.message);
    return res.status(500).json({
      service: "calldrip-ingestion",
      error: "Unable to read status",
    });
  }
});

module.exports = router;
