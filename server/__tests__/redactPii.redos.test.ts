/**
 * The CVV, DOB, driver's-license and routing patterns in redactPii.cjs were
 * rewritten so two "\s*" never sit next to each other (CodeQL
 * js/polynomial-redos). These tests prove two things:
 *   1. They match exactly what the previous patterns matched (same positions,
 *      same captured groups) on a large set of generated transcript-like text.
 *   2. A long run of spaces after a label no longer takes quadratic time.
 */

import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { redactPii, _testing } = require("../src/lib/redactPii.cjs");

// The patterns as they were before this change, kept here only as the
// reference for the equivalence check.
const PREVIOUS = {
  CVV_RE: /\bcvv\s*(?:is|:|=|number)?\s*(\d{3,4})\b/gi,
  DOB_RE: /\b(dob|date\s*of\s*birth|born|birthday(?:\s*is)?)\s*[:=-]?\s*((?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:\d{2}|\d{4}))\b/gi,
  DL_RE: /\b(driver'?s?\s*licen[sc]e|dl\s*#|dl\s*number|license\s*(?:number|#))\s*[:=-]?\s*([A-Z0-9-]{6,16})\b/gi,
  ROUTING_RE: /\b(routing|aba)\s*(?:number|#)?\s*[:=-]?\s*(\d{9})\b/gi,
} as const;

type Name = keyof typeof PREVIOUS;

const TOKENS = [
  "cvv", "CVV", "Cvv", "is", "number", "Number", "#", ":", "=", "-", " - ", "--",
  " ", "  ", "   ", "\t", "\n",
  "1", "12", "123", "1234", "12345", "123456789", "1234567890", "021000021",
  "dob", "DOB", "born", "birthday", "birthday is", "date of birth", "dateofbirth",
  "01/02/1990", "1/2/90", "12/31/1999", "13/40/2000", "07/04/76",
  "license", "licence", "driver's license", "drivers license", "driverslicense",
  "dl #", "dl number", "license number", "license #",
  "AB-1234", "X1234567", "ABCDEF123456", "A1", "ZZ-99-ZZ-99",
  "routing", "aba", "ABA", "x", "y", ".", ",",
];

// Small deterministic generator so failures are reproducible.
function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function sampleText(rand: () => number): string {
  const n = 1 + Math.floor(rand() * 12);
  let out = "";
  for (let i = 0; i < n; i++) {
    out += TOKENS[Math.floor(rand() * TOKENS.length)];
    if (rand() < 0.5) out += " ";
  }
  return out;
}

function allMatches(re: RegExp, text: string) {
  return Array.from(text.matchAll(new RegExp(re.source, re.flags))).map((m) => ({
    index: m.index,
    groups: Array.from(m),
  }));
}

describe("redactPii patterns — same matches as before the ReDoS rewrite", () => {
  const names = Object.keys(PREVIOUS) as Name[];

  it("exposes the four rewritten patterns", () => {
    for (const name of names) {
      expect(_testing[name]).toBeInstanceOf(RegExp);
      expect(_testing[name].flags).toBe(PREVIOUS[name].flags);
      expect(_testing[name].source).not.toBe(PREVIOUS[name].source);
    }
  });

  it.each(names)("%s matches identically on 20,000 generated strings", (name) => {
    const rand = makeRandom(0x5eed + name.length);
    let compared = 0;
    let withMatch = 0;
    for (let i = 0; i < 20000; i++) {
      const text = sampleText(rand);
      const before = allMatches(PREVIOUS[name], text);
      const after = allMatches(_testing[name], text);
      expect(after, JSON.stringify(text)).toEqual(before);
      compared++;
      if (before.length > 0) withMatch++;
    }
    expect(compared).toBe(20000);
    // Positive control: the generator must actually produce matches, or the
    // equality above would prove nothing.
    expect(withMatch).toBeGreaterThan(50);
  });

  it.each([
    ["CVV_RE", "cvv is 123", ["cvv is 123", "123"]],
    ["CVV_RE", "CVV: 4567", ["CVV: 4567", "4567"]],
    ["CVV_RE", "cvv number  321", ["cvv number  321", "321"]],
    ["DOB_RE", "dob - 01/02/1990", ["dob - 01/02/1990", "dob", "01/02/1990"]],
    ["DOB_RE", "birthday is 7/4/76", ["birthday is 7/4/76", "birthday is", "7/4/76"]],
    ["DL_RE", "driver's license: AB-1234", ["driver's license: AB-1234", "driver's license", "AB-1234"]],
    ["DL_RE", "license # X1234567", ["license # X1234567", "license #", "X1234567"]],
    ["ROUTING_RE", "routing number: 021000021", ["routing number: 021000021", "routing", "021000021"]],
    ["ROUTING_RE", "aba 021000021", ["aba 021000021", "aba", "021000021"]],
  ] as const)("%s still matches %j", (name, text, groups) => {
    const m = new RegExp(_testing[name].source, _testing[name].flags).exec(text);
    expect(m && Array.from(m)).toEqual(groups);
  });
});

describe("redactPii patterns — linear time on long runs of spaces", () => {
  const spaces = " ".repeat(50000);
  const inputs = [
    `cvv${spaces}x`,
    `cvv is${spaces}x`,
    `dob${spaces}x`,
    `birthday${spaces}x`,
    `license${spaces}x`,
    `routing${spaces}x`,
    `routing number${spaces}x`,
  ];

  it.each(inputs.map((t) => [t.slice(0, 16).trimEnd(), t]))(
    "redactPii finishes quickly on %j followed by 50,000 spaces",
    (_label, text) => {
      const started = performance.now();
      const r = redactPii(text);
      const elapsed = performance.now() - started;
      expect(r.redacted).toBe(text);
      // The previous patterns needed on the order of a billion steps here.
      expect(elapsed).toBeLessThan(500);
    },
  );
});
