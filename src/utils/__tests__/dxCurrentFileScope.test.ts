import { describe, expect, it } from "vitest";
import { CURRENT_DX_SOURCE, type DxTrade } from "../dxSheetParser";
import { currentFileDxTrades } from "../dxCurrentFileScope";
import { beginDxRefresh, completeDxRefresh, createDxFeedState, failDxRefresh, resetDxFeed } from "../dxFeedState";

function row(id: string, date: string, overrides: Partial<DxTrade> = {}): DxTrade {
  return { id, date, sourceYear: 2026, sourceWorkbookId: CURRENT_DX_SOURCE.workbookId,
    sourceDataKind: "FULL_ROW", ...overrides } as DxTrade;
}

describe("accepted DX file scope", () => {
  it("includes both file endpoints and excludes old years, pre-start, future and foreign sources", () => {
    const rows = [row("start", "2026-01-02"), row("end", "2026-10-05"),
      row("old-2024", "2024-10-05", { sourceYear: 2024 }),
      row("old-2025", "2025-10-05", { sourceYear: 2025 }),
      row("before", "2026-01-01"), row("after", "2026-10-06"),
      row("seed", "2026-01-02", { sourceDataKind: "SANITIZED_HISTORY" }),
      row("foreign", "2026-01-02", { sourceWorkbookId: "other" }), row("bad", "not-a-date"), row("impossible", "2026-02-30")];
    expect(currentFileDxTrades(rows).map((trade) => trade.id)).toEqual(["start", "end"]);
  });

  it("preserves only accepted last-good rows on warm refresh failure; cold failure and reset show no history", () => {
    const initial = createDxFeedState();
    const current = completeDxRefresh(initial, currentFileDxTrades([
      row("current", "2026-09-20"), row("old", "2025-09-20", { sourceYear: 2025 }),
    ]), new Date());
    const failed = failDxRefresh(beginDxRefresh(current, new Date()), "Timeout", new Date());
    expect(failed.status).toBe("stale");
    expect(failed.trades.map((trade) => trade.id)).toEqual(["current"]);
    expect(failed.historicalTrades).toEqual([]);
    expect(failDxRefresh(initial, "Timeout", new Date()).trades).toEqual([]);
    expect(resetDxFeed().trades).toEqual([]);
  });
});
