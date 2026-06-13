/**
 * PII redaction layer for CallDrip webhook payloads.
 *
 * v1.5.0 commit 2 — closes the GLBA blocker identified by Codex + the
 * 4-agent gap audit on 2026-06-13. Mirrors the ESM `redact-pii.mjs` in the
 * bdc-agent repo. Single source of truth for what "redacted" means for
 * customer data persisted to disk / Firestore / Sheets.
 *
 * Pattern coverage (precision-first order):
 *   - SSN              \b\d{3}-\d{2}-\d{4}\b
 *   - Credit card      Luhn-valid 13-19 digit run (no false-positives on
 *                      phone-like digit runs)
 *   - CVV              "cvv NNNN" / "cvv: NNN" (labeled only)
 *   - DOB              labeled context only — bare appt dates not redacted
 *   - Driver License   "drivers license" / "DL#" labeled
 *   - Phone            (XXX) XXX-XXXX / XXX-XXX-XXXX / +1 variants —
 *                      US area code 2-9 (part numbers like 160-313-1031 do
 *                      not false-positive)
 *   - Email            standard RFC-5322 simplified
 *   - Routing number   ABA 9-digit labeled
 *
 * Passes through join-key fields (leadPhoneNumber, leadPhoneDigits, phone,
 * personId, dealId, callId, recording_url, etc.). Customer name in display
 * fields is NOT redacted (handled at the renderer security layer).
 *
 * @module redactPii
 */

"use strict";

const SSN_RE = /\b(?<!\d)(\d{3})-(\d{2})-(\d{4})(?!\d)\b/g;
const CARD_RE = /\b(?<!\d)((?:\d[ -]?){12,18}\d)(?!\d)\b/g;
const CVV_RE = /\bcvv\s*(?:is|:|=|number)?\s*(\d{3,4})\b/gi;
const DOB_RE = /\b(dob|date\s*of\s*birth|born|birthday(?:\s*is)?)\s*[:=-]?\s*((?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:\d{2}|\d{4}))\b/gi;
const DL_RE = /\b(driver'?s?\s*licen[sc]e|dl\s*#|dl\s*number|license\s*(?:number|#))\s*[:=-]?\s*([A-Z0-9-]{6,16})\b/gi;
const PHONE_RE = /(?<!\d)(\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})(?!\d)/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const ROUTING_RE = /\b(routing|aba)\s*(?:number|#)?\s*[:=-]?\s*(\d{9})\b/gi;

function luhnValid(digits) {
  if (!digits || digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const PIPELINE_KEY_PASSTHROUGH = new Set([
  "leadPhoneNumber",
  "leadPhoneDigits",
  "phone",
  "phoneNumber",
  "fromNumber",
  "toNumber",
  "callerNumber",
  "answeredByPhone",
  "leadKey",
  "personId",
  "dealId",
  "callId",
  "calldripLeadId",
  "calldripAccountId",
  "recording_url",
  "recordingUrl",
  "url",
  "webhookType",
  "sourceType",
  "scoredFname",
  "scoredLname",
  "leadFirstName",
  "leadLastName",
  "answeredBy",
  "completedBy",
  "salesPerson",
  "salesperson",
  "agentName",
  "rep",
]);

function redactPii(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { redacted: text, counts: {} };
  }
  const counts = {};
  const bump = (cat) => {
    counts[cat] = (counts[cat] || 0) + 1;
  };

  let out = text;
  out = out.replace(CVV_RE, () => {
    bump("cvv");
    return "[REDACTED:CVV]";
  });
  out = out.replace(DOB_RE, () => {
    bump("dob");
    return "[REDACTED:DOB]";
  });
  out = out.replace(DL_RE, () => {
    bump("dl");
    return "[REDACTED:DL]";
  });
  out = out.replace(ROUTING_RE, () => {
    bump("routing");
    return "[REDACTED:ROUTING]";
  });
  out = out.replace(EMAIL_RE, () => {
    bump("email");
    return "[REDACTED:EMAIL]";
  });
  out = out.replace(SSN_RE, () => {
    bump("ssn");
    return "[REDACTED:SSN]";
  });
  out = out.replace(CARD_RE, (match, group) => {
    const digits = String(group).replace(/[ -]/g, "");
    if (digits.length < 13 || digits.length > 19) return match;
    if (!luhnValid(digits)) return match;
    bump("card");
    return "[REDACTED:CARD]";
  });
  out = out.replace(PHONE_RE, () => {
    bump("phone");
    return "[REDACTED:PHONE]";
  });

  return { redacted: out, counts };
}

function redactPiiDeep(obj) {
  const total = {};
  const add = (c) => {
    for (const k of Object.keys(c)) total[k] = (total[k] || 0) + c[k];
  };
  function walk(node) {
    if (node === null || node === undefined) return node;
    if (typeof node === "string") {
      const { redacted, counts } = redactPii(node);
      add(counts);
      return redacted;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node === "object") {
      const out = {};
      for (const k of Object.keys(node)) {
        if (PIPELINE_KEY_PASSTHROUGH.has(k)) {
          out[k] = node[k];
        } else {
          out[k] = walk(node[k]);
        }
      }
      return out;
    }
    return node;
  }
  const result = walk(obj);
  return { result, counts: total };
}

module.exports = {
  redactPii,
  redactPiiDeep,
  PIPELINE_KEY_PASSTHROUGH,
};
