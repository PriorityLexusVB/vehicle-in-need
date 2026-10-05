import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import DealerExchange from "../DealerExchange";
import { CURRENT_DX_SOURCE, type DxTrade } from "../../src/utils/dxSheetParser";
import { completeDxRefresh, createDxFeedState, failDxRefresh } from "../../src/utils/dxFeedState";

function trade(id: string, date: string, overrides: Partial<DxTrade> = {}): DxTrade {
  return {
    id, date, year: "26", modelNumber: "9353", description: "TX350", colorCode: "", color: "",
    vinIncoming: "", tradingDealer: "NEWPORT NEWS", dealerCode: "64531", stockNumber: "",
    dxFee: "", direction: "OURS", directionMeaning: "REQUESTED_BY_US", completed: true,
    salesConsultant: "", outgoingStock: "", vinOutgoing: "", outgoingModelNumber: "9353", isSwap: true,
    sourceYear: 2026, sourceWorkbookId: CURRENT_DX_SOURCE.workbookId, sourceWorkbookTitle: "2026 DX",
    sourceTabName: "2026 DX", sourceGid: "0", sourceRowNumber: 2,
    sourceRowUrl: "https://example.test/source", sourceFingerprint: id, sourceSchema: "CURRENT_2026",
    sourceDataKind: "FULL_ROW", issues: [], ...overrides,
  };
}

describe("Dealer Exchange file-only display", () => {
  it("uses file-only metrics and history even when given older seed rows", () => {
    const feed = completeDxRefresh(createDxFeedState([
      trade("old", "2025-08-20", { sourceYear: 2025, sourceDataKind: "SANITIZED_HISTORY", tradingDealer: "OLD DEALER" }),
    ]), [trade("current", "2026-10-05")], new Date());
    render(<MemoryRouter><DealerExchange dxFeed={feed} onRefreshDx={() => {}} /></MemoryRouter>);
    expect(screen.queryByText("OLD DEALER")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Ledger records" }));
    expect(screen.getByText(/Jan 2–Oct 5, 2026 · spreadsheet only/)).toBeInTheDocument();
    expect(screen.queryByText(/2025 history/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /2026 row 2/i }).length).toBeGreaterThan(0);
  });

  it("shows no historical records after a failed initial fetch", () => {
    const feed = failDxRefresh(createDxFeedState(), "Source unavailable", new Date());
    render(<MemoryRouter><DealerExchange dxFeed={feed} onRefreshDx={() => {}} /></MemoryRouter>);
    expect(screen.getByText("SOURCE ERROR")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("OLD DEALER")).not.toBeInTheDocument();
  });
});
