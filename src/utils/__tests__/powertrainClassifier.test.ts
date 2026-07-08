import { describe, expect, it } from "vitest";
import {
  derivePowertrainBucket,
  isElectrified,
  isEV,
  isHybrid,
  isPlugIn,
  POWERTRAINS,
} from "../powertrainClassifier";

describe("derivePowertrainBucket — Lexus examples from the redesign plan", () => {
  // Plug-in / PHEV: PHEV, plug, plug-in, 450h+, 550h+, h+
  it.each([
    { model: "NX 450h+" },
    { model: "RX 450h+" },
    { model: "TX 550h+" },
    { code: "RX450H+" },
    { code: "TX550H+" },
    { type: "PHEV SUV", engine: "Hybrid", code: "RX450H+" },
    { type: "Three-Row PHEV SUV", engine: "Hybrid" },
    { grade: "Plug-in Luxury" },
  ])("classifies %o as Plug-in Hybrid", (v) => {
    expect(derivePowertrainBucket(v)).toBe("Plug-in Hybrid");
  });

  // Hybrid: hybrid, model names ending in h without +
  it.each([
    { model: "RX 350h" },
    { model: "ES 300h" },
    { model: "NX 350h" },
    { model: "TX 500h" },
    { model: "UX 300h" },
    { code: "RX350H", engine: "Hybrid", type: "SUV Hybrid" },
    { type: "Sedan Hybrid" },
  ])("classifies %o as Hybrid", (v) => {
    expect(derivePowertrainBucket(v)).toBe("Hybrid");
  });

  // EV: EV, BEV, RZ
  it.each([
    { code: "RZ450E", engine: "EV", type: "EV SUV" },
    { model: "RZ 550e" },
    { type: "EV Sedan AWD", code: "ES500E" },
    { engine: "EV" },
    { grade: "BEV Premium" },
  ])("classifies %o as EV", (v) => {
    expect(derivePowertrainBucket(v)).toBe("EV");
  });

  // Gas / Other: everything else
  it.each([
    { model: "RX 350", engine: "Gas", type: "SUV" },
    { code: "LC500", engine: "Gas", type: "Grand Tourer" },
    { model: "IS 350", engine: "Gas" },
  ])("classifies %o as Gas", (v) => {
    expect(derivePowertrainBucket(v)).toBe("Gas");
  });
});

describe("derivePowertrainBucket — precedence & edge cases", () => {
  it("plug-in wins over the plain-hybrid engine field", () => {
    expect(
      derivePowertrainBucket({ engine: "Hybrid", type: "PHEV SUV", code: "RX450H+" }),
    ).toBe("Plug-in Hybrid");
  });

  it("does not treat a plain hybrid ('…h') as plug-in", () => {
    expect(derivePowertrainBucket({ model: "RX 350h" })).toBe("Hybrid");
    expect(isPlugIn({ model: "RX 350h" })).toBe(false);
  });

  it("does not treat 'ev' inside another word as EV", () => {
    expect(derivePowertrainBucket({ type: "Seven-Seat SUV", engine: "Gas" })).toBe(
      "Gas",
    );
  });

  it("does not treat an 'h' word without a leading digit as Hybrid", () => {
    expect(
      derivePowertrainBucket({ grade: "F SPORT Handling", engine: "Gas" }),
    ).toBe("Gas");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(derivePowertrainBucket({ code: "  rx450h+ " })).toBe("Plug-in Hybrid");
    expect(derivePowertrainBucket({ engine: " HYBRID " })).toBe("Hybrid");
  });

  it("defaults empty/unknown input to Gas", () => {
    expect(derivePowertrainBucket({})).toBe("Gas");
    expect(derivePowertrainBucket({ model: null, code: null, engine: null })).toBe(
      "Gas",
    );
  });
});

describe("powertrain predicates", () => {
  const phev = { engine: "Hybrid", type: "PHEV SUV", code: "RX450H+" };
  const hybrid = { engine: "Hybrid", type: "SUV Hybrid", code: "RX350H" };
  const ev = { engine: "EV", type: "EV SUV", code: "RZ450E" };
  const gas = { engine: "Gas", type: "SUV", code: "RX350" };

  it("isPlugIn true only for plug-ins", () => {
    expect(isPlugIn(phev)).toBe(true);
    expect(isPlugIn(hybrid)).toBe(false);
    expect(isPlugIn(gas)).toBe(false);
  });

  it("isHybrid excludes plug-in hybrids (bucket-consistent)", () => {
    expect(isHybrid(hybrid)).toBe(true);
    expect(isHybrid(phev)).toBe(false);
    expect(derivePowertrainBucket(phev)).toBe("Plug-in Hybrid");
  });

  it("isEV true only for EVs", () => {
    expect(isEV(ev)).toBe(true);
    expect(isEV(hybrid)).toBe(false);
  });

  it("isElectrified covers hybrid, plug-in, and EV but not gas", () => {
    expect(isElectrified(hybrid)).toBe(true);
    expect(isElectrified(phev)).toBe(true);
    expect(isElectrified(ev)).toBe(true);
    expect(isElectrified(gas)).toBe(false);
  });
});

describe("POWERTRAINS", () => {
  it("lists all four buckets", () => {
    expect([...POWERTRAINS].sort()).toEqual(
      ["EV", "Gas", "Hybrid", "Plug-in Hybrid"].sort(),
    );
  });
});
