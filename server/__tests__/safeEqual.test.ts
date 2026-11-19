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

  it("does not treat padding bytes as part of the key", () => {
    expect(safeEqual("key\0", "key")).toBe(false);
    expect(safeEqual("key", "key\0")).toBe(false);
  });

  it("compares every byte of keys at and beyond the minimum width", () => {
    const atWidth = "k".repeat(512);
    expect(safeEqual(atWidth, atWidth)).toBe(true);
    expect(safeEqual(`${"k".repeat(511)}x`, atWidth)).toBe(false);

    const longer = "k".repeat(600);
    expect(safeEqual(longer, longer)).toBe(true);
    expect(safeEqual(`${"k".repeat(599)}x`, longer)).toBe(false);
    expect(safeEqual(atWidth, longer)).toBe(false);
  });

  it("measures length in bytes for non-ASCII keys", () => {
    expect(safeEqual("clé-secrète", "clé-secrète")).toBe(true);
    expect(safeEqual("clé-secrète", "cle-secrete")).toBe(false);
  });

  it("rejects empty, missing and non-string values", () => {
    expect(safeEqual("", "key")).toBe(false);
    expect(safeEqual("key", "")).toBe(false);
    expect(safeEqual(undefined as unknown as string, "key")).toBe(false);
    expect(safeEqual("key", null as unknown as string)).toBe(false);
    expect(safeEqual(123 as unknown as string, "123")).toBe(false);
  });
});
