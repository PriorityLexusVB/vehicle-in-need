/**
 * Remove every trailing "/" from a string.
 *
 * Replaces `value.replace(/\/+$/, "")`. That regex is quadratic on a long run
 * of slashes that is not at the end (CodeQL js/polynomial-redos), and the app
 * URL it trims can fall back to the request's Host header. This loop is linear.
 *
 * @param {string} value
 * @returns {string}
 */

"use strict";

function trimTrailingSlashes(value) {
  const text = String(value);
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 47 /* "/" */) end--;
  return text.slice(0, end);
}

module.exports = { trimTrailingSlashes };
