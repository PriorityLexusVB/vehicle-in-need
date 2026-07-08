import { describe, expect, it } from "vitest";
import { computeModelTotals } from "../modelTotals";

describe("computeModelTotals", () => {
  it("returns empty array for no vehicles", () => {
    expect(computeModelTotals([])).toEqual([]);
  });

  it("counts units per model and computes open = quantity - linked", () => {
    const vehicles = [
      { id: "a", model: "RX 350", quantity: 1 },
      { id: "b", model: "RX 350", quantity: 1 },
      { id: "c", model: "NX 350", quantity: 1 },
    ];
    const totals = computeModelTotals(vehicles, new Set(["a"]));

    expect(totals).toEqual([
      { model: "RX 350", quantity: 2, linked: 1, open: 1 },
      { model: "NX 350", quantity: 1, linked: 0, open: 1 },
    ]);
  });

  it("accepts an array of linked ids as well as a Set", () => {
    const vehicles = [{ id: "a", model: "RX 350", quantity: 1 }];
    expect(computeModelTotals(vehicles, ["a"])[0]).toEqual({
      model: "RX 350",
      quantity: 1,
      linked: 1,
      open: 0,
    });
  });

  it("treats legacy quantity>1 rows as multiple units", () => {
    const vehicles = [{ id: "legacy", model: "RX 350", quantity: 3 }];
    // The whole legacy record is linked, so all 3 units count as linked.
    expect(computeModelTotals(vehicles, ["legacy"])[0]).toEqual({
      model: "RX 350",
      quantity: 3,
      linked: 3,
      open: 0,
    });
  });

  it("defaults missing/invalid quantity to 1 unit", () => {
    const vehicles = [
      { id: "a", model: "RX 350", quantity: null },
      { id: "b", model: "RX 350", quantity: 0 },
      { id: "c", model: "RX 350" },
    ];
    expect(computeModelTotals(vehicles)[0]).toEqual({
      model: "RX 350",
      quantity: 3,
      linked: 0,
      open: 3,
    });
  });

  it("falls back to code, then 'Unknown', for the model key", () => {
    const vehicles = [
      { id: "a", code: "RX350", quantity: 1 },
      { id: "b", quantity: 1 },
    ];
    const totals = computeModelTotals(vehicles);
    const keys = totals.map((t) => t.model).sort();
    expect(keys).toEqual(["RX350", "Unknown"]);
  });

  it("sorts by quantity desc then model name asc", () => {
    const vehicles = [
      { id: "1", model: "NX 350", quantity: 1 },
      { id: "2", model: "RX 350", quantity: 1 },
      { id: "3", model: "TX 500h", quantity: 2 },
    ];
    expect(computeModelTotals(vehicles).map((t) => t.model)).toEqual([
      "TX 500h",
      "NX 350",
      "RX 350",
    ]);
  });

  it("ignores unmatched linked ids", () => {
    const vehicles = [{ id: "a", model: "RX 350", quantity: 1 }];
    expect(computeModelTotals(vehicles, ["does-not-exist"])[0]).toMatchObject({
      linked: 0,
      open: 1,
    });
  });
});
