import { describe, expect, it } from "vitest";
import {
  buildModelSlotTotals,
  getVehicleModelKey,
} from "../allocationModelTotals";

describe("getVehicleModelKey", () => {
  it("prefers the model name", () => {
    expect(getVehicleModelKey({ model: "RX 350h", code: "RX350H" })).toBe(
      "RX 350h",
    );
  });

  it("falls back to a descriptive code", () => {
    expect(getVehicleModelKey({ code: "RX350" })).toBe("RX350");
  });

  it("ignores a bare 4-digit(+letter) code and returns 'Not listed'", () => {
    expect(getVehicleModelKey({ code: "9504" })).toBe("Not listed");
    expect(getVehicleModelKey({ code: "9508A" })).toBe("Not listed");
    expect(getVehicleModelKey({})).toBe("Not listed");
  });

  it("treats placeholder words as empty so the key matches getDisplayModel", () => {
    // getDisplayModel/getDisplayValue reject these — getVehicleModelKey must too,
    // or the pill would group under a bucket the card is not displayed as.
    expect(getVehicleModelKey({ model: "unknown", code: "RX350" })).toBe("RX350");
    expect(getVehicleModelKey({ model: "N/A", code: "RX350" })).toBe("RX350");
    expect(getVehicleModelKey({ model: "TBD", code: "9504" })).toBe("Not listed");
    expect(getVehicleModelKey({ model: "na" })).toBe("Not listed");
  });
});

describe("buildModelSlotTotals", () => {
  it("returns empty array for no vehicles", () => {
    expect(buildModelSlotTotals([])).toEqual([]);
  });

  it("counts slots per model and computes available = total - linked", () => {
    const vehicles = [
      { id: "a", model: "RX 350h", quantity: 1 },
      { id: "b", model: "RX 350h", quantity: 1 },
      { id: "c", model: "NX 350", quantity: 1 },
    ];
    expect(buildModelSlotTotals(vehicles, new Set(["a"]))).toEqual([
      { model: "RX 350h", totalSlots: 2, linkedSlots: 1, availableSlots: 1 },
      { model: "NX 350", totalSlots: 1, linkedSlots: 0, availableSlots: 1 },
    ]);
  });

  it("accepts an array of linked ids as well as a Set", () => {
    const vehicles = [{ id: "a", model: "RX 350h", quantity: 1 }];
    expect(buildModelSlotTotals(vehicles, ["a"])[0]).toEqual({
      model: "RX 350h",
      totalSlots: 1,
      linkedSlots: 1,
      availableSlots: 0,
    });
  });

  it("treats legacy quantity>1 rows as multiple slots", () => {
    const vehicles = [{ id: "legacy", model: "RX 350h", quantity: 3 }];
    expect(buildModelSlotTotals(vehicles, ["legacy"])[0]).toEqual({
      model: "RX 350h",
      totalSlots: 3,
      linkedSlots: 3,
      availableSlots: 0,
    });
  });

  it("defaults missing/invalid quantity to 1 slot", () => {
    const vehicles = [
      { id: "a", model: "RX 350h", quantity: null },
      { id: "b", model: "RX 350h", quantity: 0 },
      { id: "c", model: "RX 350h" },
    ];
    expect(buildModelSlotTotals(vehicles)[0]).toEqual({
      model: "RX 350h",
      totalSlots: 3,
      linkedSlots: 0,
      availableSlots: 3,
    });
  });

  it("buckets by display model key (4-digit code → 'Not listed')", () => {
    const vehicles = [
      { id: "a", code: "RX350", quantity: 1 },
      { id: "b", code: "9504", quantity: 1 },
    ];
    const keys = buildModelSlotTotals(vehicles)
      .map((t) => t.model)
      .sort();
    expect(keys).toEqual(["Not listed", "RX350"]);
  });

  it("sorts by totalSlots desc then model name asc", () => {
    const vehicles = [
      { id: "1", model: "NX 350", quantity: 1 },
      { id: "2", model: "RX 350h", quantity: 1 },
      { id: "3", model: "TX 500h", quantity: 2 },
    ];
    expect(buildModelSlotTotals(vehicles).map((t) => t.model)).toEqual([
      "TX 500h",
      "NX 350",
      "RX 350h",
    ]);
  });

  it("ignores unmatched linked ids", () => {
    const vehicles = [{ id: "a", model: "RX 350h", quantity: 1 }];
    expect(buildModelSlotTotals(vehicles, ["does-not-exist"])[0]).toMatchObject({
      linkedSlots: 0,
      availableSlots: 1,
    });
  });
});
