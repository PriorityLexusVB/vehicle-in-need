import { describe, expect, it } from "vitest";
import { Order, OrderStatus } from "../../../types";
import type { DxTrade } from "../dxSheetParser";
import { computeOrderMatchSummaries } from "../orderMatchSummary";

function order(): Order {
  return {
    id: "order-1",
    status: OrderStatus.DealerExchange,
    model: "TX350",
    modelNumber: "9353",
    exteriorColor1: "CAVIAR",
  } as Order;
}

function trade(id: string, direction: DxTrade["direction"]): DxTrade {
  return {
    id,
    date: "2026-08-01",
    year: "2026",
    modelNumber: "9353",
    description: "TX350",
    colorCode: "223",
    color: "CAVIAR",
    direction,
  } as DxTrade;
}

describe("DX order history matching", () => {
  it("counts only OURS rows because those dealers completed exchanges that helped us", () => {
    const summaries = computeOrderMatchSummaries(
      [order()],
      [],
      [trade("ours", "OURS"), trade("theirs", "THEIRS"), trade("unknown", "")],
    );

    const summary = summaries.get("order-1");
    expect(summary?.dxExactCount).toBe(1);
    expect(summary?.dxPartialCount).toBe(0);
    expect(summary?.dxModelOnlyCount).toBe(0);
  });

  it("keeps DX history available for Dealer Exchange orders while allocation matching stays excluded", () => {
    const summaries = computeOrderMatchSummaries([order()], [], [trade("ours", "OURS")]);

    expect(summaries.get("order-1")?.dxExactCount).toBe(1);
  });
});
