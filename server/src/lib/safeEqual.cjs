/**
 * Constant-time comparison for shared-secret API keys.
 *
 * Both values are hashed first so the comparison always runs over equal-length
 * buffers (crypto.timingSafeEqual throws on different lengths, and a length
 * check alone would leak the secret's length).
 */

"use strict";

const crypto = require("crypto");

function safeEqual(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { safeEqual };
