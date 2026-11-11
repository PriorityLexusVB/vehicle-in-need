import { describe, expect, it } from "vitest";

const { safeEqual } = require("../src/lib/safeEqual.cjs");

describe("safeEqual (constant-time shared-key compare)", () => {
  it("accepts an identical key", () => {
    expect(safeEqual("abc123-secret", "abc123-secret")).toBe(true);
  });

  it("rejects a different key of the same length", () => {
    expect(safeEqual("abc123-secreT", "abc123-secret")).toBe(false);
  });

  it("rejects keys of different length without throwing", () => {
    expect(safeEqual("short", "a-much-longer-expected-key")).toBe(false);
    expect(safeEqual("a-much-longer-expected-key", "short")).toBe(false);
  });

  it("rejects empty, missing and non-string values", () => {
    expect(safeEqual("", "key")).toBe(false);
    expect(safeEqual("key", "")).toBe(false);
    expect(safeEqual(undefined as unknown as string, "key")).toBe(false);
    expect(safeEqual("key", null as unknown as string)).toBe(false);
    expect(safeEqual(123 as unknown as string, "123")).toBe(false);
  });
});
