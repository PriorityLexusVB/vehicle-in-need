import { describe, expect, it } from "vitest";
import { exteriorSwatch } from "../colorReference";

describe("exteriorSwatch", () => {
  it("resolves an exact paint name in any case", () => {
    expect(exteriorSwatch("Caviar")).toBe("#0f0f11");
    expect(exteriorSwatch("  eminent   WHITE pearl ")).toBe("#ecebe5");
  });

  it("resolves an OEM code alone or with its name", () => {
    expect(exteriorSwatch("223")).toBe("#0f0f11");
    expect(exteriorSwatch("8X1 ULTRASONIC BLUE 2.0")).toBe("#1d4fa3");
  });

  it("returns nothing for loose aliases, unsure shades, blanks and TBD", () => {
    expect(exteriorSwatch("gray")).toBeUndefined();
    expect(exteriorSwatch("Wind")).toBeUndefined();
    expect(exteriorSwatch("Wavelength")).toBeUndefined();
    expect(exteriorSwatch("")).toBeUndefined();
    expect(exteriorSwatch(undefined)).toBeUndefined();
    expect(exteriorSwatch("TBD")).toBeUndefined();
  });
});
