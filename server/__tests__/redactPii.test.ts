/**
 * Unit tests for server-side PII redaction layer.
 *
 * v1.5.0 commit 2 — mirrors the bdc-agent repo's test-redact-pii.mjs suite.
 * Build-time leak gate: any test failure fails CI, blocks deploy.
 */

import { describe, it, expect } from "vitest";

// CJS module — load via require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { redactPii, redactPiiDeep, PIPELINE_KEY_PASSTHROUGH } = require("../src/lib/redactPii.cjs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractTranscriptionJob } = require("../src/lib/transcriptionQueue.cjs");

describe("redactPii — content patterns", () => {
  it("redacts dashed SSN", () => {
    const r = redactPii("My SSN is 484-09-5003 for the credit app.");
    expect(r.redacted).toContain("[REDACTED:SSN]");
    expect(r.redacted).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
    expect(r.counts.ssn).toBe(1);
  });

  it("redacts multiple SSNs in one string", () => {
    const r = redactPii("SSNs: 484-09-5003 and 373-00-2020 and 808-45-7635.");
    expect(r.counts.ssn).toBe(3);
    expect(r.redacted).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  });

  it("redacts Luhn-valid credit card", () => {
    const r = redactPii("Card on file is 4532015112830366.");
    expect(r.counts.card).toBe(1);
    expect(r.redacted).not.toMatch(/\b4532015112830366\b/);
  });

  it("does NOT redact non-Luhn 16-digit run (false-positive guard)", () => {
    const r = redactPii("Number 9999999999999999 is not a card.");
    expect(r.counts.card || 0).toBe(0);
  });

  it("redacts labeled CVV", () => {
    const r = redactPii("CVV: 412 from the back.");
    expect(r.redacted).toContain("[REDACTED:CVV]");
    expect(r.counts.cvv).toBe(1);
  });

  it("does NOT redact bare 3-digit number as CVV", () => {
    const r = redactPii("I have 412 dollars in my account.");
    expect(r.counts.cvv || 0).toBe(0);
  });

  it("redacts labeled DOB", () => {
    const r = redactPii("DOB: 03/15/1985 for the application.");
    expect(r.redacted).toContain("[REDACTED:DOB]");
    expect(r.counts.dob).toBe(1);
  });

  it("does NOT redact bare date (appt date stays)", () => {
    const r = redactPii("Appointment is 03/15/2026 at 11am.");
    expect(r.counts.dob || 0).toBe(0);
  });

  it("redacts driver license labeled", () => {
    const r = redactPii("Drivers license number: V12345678");
    expect(r.redacted).toContain("[REDACTED:DL]");
    expect(r.counts.dl).toBe(1);
  });

  it("redacts (XXX) XXX-XXXX phone format", () => {
    const r = redactPii("Call me at (757) 555-1234 today.");
    expect(r.redacted).toContain("[REDACTED:PHONE]");
    expect(r.counts.phone).toBe(1);
  });

  it("redacts bare XXX-XXX-XXXX phone", () => {
    const r = redactPii("Reach me 757-555-1234.");
    expect(r.counts.phone).toBe(1);
  });

  it("does NOT redact part-number 160-313-1031 (1 is not a valid US area code)", () => {
    const r = redactPii("Part number is 160-313-1031 — back ordered.");
    expect(r.counts.phone || 0).toBe(0);
  });

  it("redacts email", () => {
    const r = redactPii("Email me at john.doe@example.com later.");
    expect(r.redacted).toContain("[REDACTED:EMAIL]");
    expect(r.counts.email).toBe(1);
  });

  it("redacts labeled routing number", () => {
    const r = redactPii("Routing number 256074974 for ACH.");
    expect(r.redacted).toContain("[REDACTED:ROUTING]");
    expect(r.counts.routing).toBe(1);
  });
});

describe("redactPii — safety", () => {
  it("handles empty string", () => {
    expect(redactPii("").redacted).toBe("");
  });

  it("handles null / undefined", () => {
    expect(redactPii(null as any).redacted).toBe(null);
    expect(redactPii(undefined as any).redacted).toBe(undefined);
  });

  it("is idempotent", () => {
    const input = "SSN 484-09-5003, phone (757) 555-1234.";
    const r1 = redactPii(input).redacted;
    const r2 = redactPii(r1).redacted;
    expect(r1).toBe(r2);
  });
});

describe("redactPiiDeep — recursive object walker", () => {
  it("walks nested object + array", () => {
    const input = {
      callId: "abc123",
      transcript: "My SSN is 484-09-5003 and CVV 412 from card 4532015112830366.",
      callDripMeta: {
        leadFirstName: "John",
        notes: "Customer prefers (757) 555-1234.",
      },
      activities: [
        { comment: "Email john@example.com", type: "note" },
        { comment: "No PII here, just a number 100." },
      ],
    };
    const { result, counts } = redactPiiDeep(input);
    expect(counts.ssn).toBe(1);
    expect(counts.cvv).toBe(1);
    expect(counts.card).toBe(1);
    expect(counts.phone).toBe(1);
    expect(counts.email).toBe(1);
    expect(result.callDripMeta.leadFirstName).toBe("John");
    expect(JSON.stringify(result)).not.toMatch(/484-09-5003/);
    expect(JSON.stringify(result)).not.toMatch(/john@example\.com/i);
  });

  it("preserves pipeline-key passthrough fields", () => {
    const input = {
      leadPhoneNumber: "+17575551234",
      leadPhoneDigits: "7575551234",
      transcript: "Customer's other number is (757) 555-9999.",
    };
    const { result } = redactPiiDeep(input);
    expect(result.leadPhoneNumber).toBe("+17575551234");
    expect(result.leadPhoneDigits).toBe("7575551234");
    expect(result.transcript).toContain("[REDACTED:PHONE]");
  });
});

describe("passthrough set", () => {
  it("protects join-critical fields", () => {
    const required = [
      "leadPhoneNumber",
      "leadPhoneDigits",
      "personId",
      "dealId",
      "callId",
      "recordingUrl",
      "recording_url",
    ];
    for (const k of required) {
      expect(PIPELINE_KEY_PASSTHROUGH.has(k)).toBe(true);
    }
  });
});

describe("extractTranscriptionJob — gating", () => {
  it("extracts valid job from webhook payload with recording_url + duration", () => {
    const payload = {
      call_id: "C123",
      person_id: 12345,
      deal_id: 67890,
      recording_url: "https://api.twilio.com/2010-04-01/Recordings/RE1234567890abcdef",
      call: { duration: 187, direction: "inbound" },
    };
    const job = extractTranscriptionJob(payload);
    expect(job).not.toBeNull();
    expect(job.callId).toBe("C123");
    expect(job.recordingUrl).toContain("twilio.com");
    expect(job.durationSeconds).toBe(187);
    expect(job.direction).toBe("inbound");
    expect(job.leadKey).toBe("12345:67890");
  });

  it("rejects calls under 30s (VM / hangup floor)", () => {
    const payload = {
      call_id: "C2",
      recording_url: "https://a/b",
      call: { duration: 15 },
    };
    expect(extractTranscriptionJob(payload)).toBeNull();
  });

  it("rejects missing recording_url", () => {
    const payload = { call_id: "C3", call: { duration: 120 } };
    expect(extractTranscriptionJob(payload)).toBeNull();
  });

  it("tolerates field-name variants (camelCase + nested call object)", () => {
    const payload = {
      callId: "C4",
      recordingUrl: "https://a/b",
      duration: 60,
      direction: "outbound",
    };
    const job = extractTranscriptionJob(payload);
    expect(job).not.toBeNull();
    expect(job.callId).toBe("C4");
    expect(job.direction).toBe("outbound");
  });

  it("returns leadKey=null when personId or dealId missing", () => {
    const payload = {
      call_id: "C5",
      recording_url: "https://a/b",
      call: { duration: 60 },
    };
    const job = extractTranscriptionJob(payload);
    expect(job.leadKey).toBeNull();
  });

  it("classifies direction as unknown when not stated", () => {
    const payload = {
      call_id: "C6",
      recording_url: "https://a/b",
      call: { duration: 60 },
    };
    expect(extractTranscriptionJob(payload).direction).toBe("unknown");
  });
});
