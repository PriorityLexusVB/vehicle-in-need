import { describe, expect, it } from "vitest";
import type { AllocationSnapshot, AllocationVehicle } from "../allocationTypes";
import {
  buildLatestModelNumberTotals,
  fourDigitModelNumber,
} from "../allocationModelNumberTotals";

function vehicle(id: string, sourceCode: string, quantity = 1): AllocationVehicle {
  return {
    id, sourceCode, quantity, code: "RX350", model: "RX350",
    color: "CAVIAR", interiorColor: "BLACK", bos: "N", arrival: "",
    grade: "", engine: "", msrp: 0, category: "", type: "",
    rank: "", profit: 0, totalValue: 0,
  };
}

function snapshot(vehicles: AllocationVehicle[]): AllocationSnapshot {
  return {
    id: "latest", isLatest: true, reportDate: "2026-10-06",
    publishedAt: {} as AllocationSnapshot["publishedAt"],
    publishedByUid: "manager", publishedByEmail: "manager@example.test",
    itemCount: vehicles.length, summary: { units: vehicles.length, value: 0, hybridMix: 0 },
    vehicles,
  };
}

describe("latest allocation by exact model number", () => {
  it("counts only matching sourceCode and subtracts vehicle_links claims", () => {
    const source = snapshot([
      vehicle("a", "9704"),
      vehicle("b", "9704A"),
      vehicle("d", "9704"),
      vehicle("c", "9702"),
    ]);
    const result = buildLatestModelNumberTotals(source, new Set(["b", "stale-id"]));
    expect(result?.reportDate).toBe("2026-10-06");
    expect(result?.byModelNumber.get("9704")).toEqual({
      modelNumber: "9704", totalSlots: 3, unassignedSlots: 2,
    });
    expect(result?.byModelNumber.get("9702")?.totalSlots).toBe(1);
  });

  it("does not infer a number from model name or color", () => {
    expect(fourDigitModelNumber("9704A")).toBe("9704");
    expect(fourDigitModelNumber("RX350")).toBeNull();
    expect(fourDigitModelNumber("97045")).toBeNull();
    expect(buildLatestModelNumberTotals(
      snapshot([vehicle("a", "")]), new Set(),
    )).toBeNull();
  });

  it("fails closed for stale, undated, empty, or malformed snapshots", () => {
    const current = snapshot([vehicle("a", "9704")]);
    expect(buildLatestModelNumberTotals({ ...current, isLatest: false }, new Set())).toBeNull();
    expect(buildLatestModelNumberTotals({ ...current, reportDate: null }, new Set())).toBeNull();
    expect(buildLatestModelNumberTotals({ ...current, publishedAt: undefined }, new Set())).toBeNull();
    expect(buildLatestModelNumberTotals(snapshot([]), new Set())).toBeNull();
    expect(buildLatestModelNumberTotals(snapshot([vehicle("a", "9704", 0)]), new Set())).toBeNull();
    expect(buildLatestModelNumberTotals(snapshot([vehicle("a", "9704", 2)]), new Set())).toBeNull();
    expect(buildLatestModelNumberTotals(snapshot([vehicle("a", "9704"), vehicle("a", "9704")]), new Set())).toBeNull();
  });
});
