/**
 * Constant-time comparison for shared-secret API keys.
 *
 * Both values are copied into buffers of one equal width, so the comparison
 * always covers the same number of bytes. crypto.timingSafeEqual throws on
 * different lengths, and a length check alone would leak the secret's length.
 */

"use strict";

const crypto = require("crypto");

// Far longer than the keys this server uses, so a key's length does not show in the timing.
const MIN_COMPARE_BYTES = 512;

function safeEqual(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  const width = Math.max(MIN_COMPARE_BYTES, a.length, b.length);
  const paddedA = Buffer.alloc(width);
  const paddedB = Buffer.alloc(width);
  a.copy(paddedA);
  b.copy(paddedB);
  // Padding alone would make "key" equal "key\0", so the lengths must match too.
  const sameBytes = crypto.timingSafeEqual(paddedA, paddedB);
  const sameLength = a.length === b.length;
  return sameBytes && sameLength;
}

module.exports = { safeEqual };
