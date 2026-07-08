import { describe, expect, it } from "vitest";
import {
  classifyPowertrain,
  isElectrified,
  isEV,
  isHybrid,
  isPlugIn,
  POWERTRAINS,
} from "../powertrain";

describe("classifyPowertrain", () => {
  it("classifies gas vehicles", () => {
    expect(classifyPowertrain({ engine: "Gas", type: "SUV", code: "RX350" })).toBe(
      "Gas",
    );
  });

  it("classifies plain hybrids", () => {
    expect(
      classifyPowertrain({ engine: "Hybrid", type: "SUV Hybrid", code: "RX350H" }),
    ).toBe("Hybrid");
  });

  it("classifies PHEV (type marker) as Plug-in Hybrid, not Hybrid", () => {
    expect(
      classifyPowertrain({ engine: "Hybrid", type: "PHEV SUV", code: "RX450H+" }),
    ).toBe("Plug-in Hybrid");
    expect(
      classifyPowertrain({
        engine: "Hybrid",
        type: "Three-Row PHEV SUV",
        code: "TX550H+",
      }),
    ).toBe("Plug-in Hybrid");
  });

  it("classifies '+' code suffix as Plug-in Hybrid even without a PHEV type", () => {
    expect(
      classifyPowertrain({ engine: "Hybrid", type: "SUV", code: "RX450H+" }),
    ).toBe("Plug-in Hybrid");
  });

  it("classifies EV by engine", () => {
    expect(classifyPowertrain({ engine: "EV", type: "EV SUV", code: "RZ450E" })).toBe(
      "EV",
    );
  });

  it("classifies EV by type token when engine is blank", () => {
    expect(classifyPowertrain({ type: "EV Sedan AWD", code: "ES500E" })).toBe("EV");
  });

  it("does not treat 'ev' inside another word as EV", () => {
    expect(classifyPowertrain({ engine: "Gas", type: "Seven-Seat SUV" })).toBe("Gas");
  });

  it("defaults unknown input to Gas", () => {
    expect(classifyPowertrain({})).toBe("Gas");
    expect(classifyPowertrain({ engine: null, type: null, code: null })).toBe("Gas");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(classifyPowertrain({ engine: "  hybrid ", type: " phev suv " })).toBe(
      "Plug-in Hybrid",
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

  it("isHybrid excludes plug-in hybrids", () => {
    expect(isHybrid(hybrid)).toBe(true);
    expect(isHybrid(phev)).toBe(false);
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
  it("lists all four buckets in display order", () => {
    expect(POWERTRAINS).toEqual(["Gas", "Hybrid", "Plug-in Hybrid", "EV"]);
  });
});
