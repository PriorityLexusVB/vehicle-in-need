import { describe, it, expect } from "vitest";

// Sanity check that crypto polyfill is available in tests

describe("crypto polyfill", () => {
  it("provides getRandomValues", () => {
    // @ts-expect-error - global crypto exists in jsdom with polyfill
    const c: Crypto = globalThis.crypto as any;
    expect(c).toBeDefined();
    expect(typeof c.getRandomValues).toBe("function");
    const arr = new Uint8Array(4);
    const out = c.getRandomValues(arr);
    expect(out).toBe(arr);
    expect(arr.length).toBe(4);
  });
});
