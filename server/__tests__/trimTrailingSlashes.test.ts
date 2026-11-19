import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { trimTrailingSlashes } = require("../src/lib/trimTrailingSlashes.cjs");

describe("trimTrailingSlashes", () => {
  it.each([
    ["https://example.run.app", "https://example.run.app"],
    ["https://example.run.app/", "https://example.run.app"],
    ["https://example.run.app///", "https://example.run.app"],
    ["https://example.run.app/path/", "https://example.run.app/path"],
    ["/", ""],
    ["", ""],
    ["a//b", "a//b"],
  ])("%j -> %j", (input, expected) => {
    expect(trimTrailingSlashes(input)).toBe(expected);
  });

  it("matches the regex it replaces on generated strings", () => {
    const alphabet = ["/", "/", "a", ".", ":", "h"];
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let i = 0; i < 5000; i++) {
      let s = "";
      const n = Math.floor(rand() * 10);
      for (let j = 0; j < n; j++) s += alphabet[Math.floor(rand() * alphabet.length)];
      expect(trimTrailingSlashes(s)).toBe(s.replace(/\/+$/, ""));
    }
  });

  it("is fast on a long run of slashes that is not at the end", () => {
    const text = `${"/".repeat(100000)}x`;
    const started = performance.now();
    expect(trimTrailingSlashes(text)).toBe(text);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
