import { describe, expect, it } from "vitest";
import type { DxTrade } from "../dxSheetParser";
import { DX_MONTH_OPTIONS, filterDxMonth, formatDxMovementDifference, summarizeDxFees } from "../dxDisplay";

describe("DX period and factual display helpers", () => {
  it("describes recorded movement without claiming an obligation", () => {
    expect(formatDxMovementDifference(34)).toBe("34 more received");
    expect(formatDxMovementDifference(-2)).toBe("2 more sent");
    expect(formatDxMovementDifference(0)).toBe("Equal counts");
  });

  it("keeps October, November and the all-year reset separate without mutating source rows", () => {
    const rows = [{ date: "2026-10-01" }, { date: "2026-10-31" }, { date: "2026-11-01" }] as DxTrade[];
    expect(filterDxMonth(rows, "2026-10")).toEqual(rows.slice(0, 2));
    expect(filterDxMonth(rows, "2026-11")).toEqual(rows.slice(2));
    expect(filterDxMonth(rows, "2026-12")).toEqual([]);
    expect(filterDxMonth(rows, "")).toEqual(rows);
    expect(rows).toHaveLength(3);
    expect(DX_MONTH_OPTIONS).toHaveLength(12);
    expect(DX_MONTH_OPTIONS[9]).toEqual({ value: "2026-10", label: "October 2026" });
  });

  it("distinguishes blank, zero, numeric and malformed fees and sums cents", () => {
    const rows = ["", "  ", "0", "0.10", "0.20", "-2.50", "unknown", "Infinity"]
      .map((dxFee) => ({ dxFee })) as DxTrade[];
    expect(summarizeDxFees(rows)).toEqual({ total: -2.2, entered: 4, missing: 2, invalid: 2 });
    expect(summarizeDxFees([])).toEqual({ total: 0, entered: 0, missing: 0, invalid: 0 });
  });
});
