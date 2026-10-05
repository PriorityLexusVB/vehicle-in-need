import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DxDirection, DxTrade } from "../../src/utils/dxSheetParser";
import { CURRENT_DX_SOURCE, getDxDirectionMeaning } from "../../src/utils/dxSheetParser";
import DxPartners from "../DxPartners";

function trade(
  id: string,
  date: string,
  direction: DxDirection,
  overrides: Partial<DxTrade> = {},
): DxTrade {
  return {
    id,
    date,
    year: date.slice(0, 4),
    modelNumber: "9353",
    description: "TX350",
    colorCode: "0089",
    color: "WIND CHILL PEARL",
    vinIncoming: "",
    tradingDealer: "RICHMOND",
    dealerCode: "64507",
    stockNumber: "",
    dxFee: "",
    direction,
    directionMeaning: getDxDirectionMeaning(direction),
    completed: true,
    salesConsultant: "",
    outgoingStock: "",
    vinOutgoing: "",
    outgoingModelNumber: "",
    isSwap: false,
    sourceYear: Number(date.slice(0, 4)),
    sourceWorkbookId: CURRENT_DX_SOURCE.workbookId,
    sourceWorkbookTitle: "DX workbook",
    sourceTabName: "DX",
    sourceGid: "0",
    sourceRowNumber: Number(id.replace(/\D/g, "")) || 2,
    sourceRowUrl: `https://example.test/${id}`,
    sourceFingerprint: id.padEnd(16, "0").slice(0, 16),
    sourceSchema: "CURRENT_2026",
    sourceDataKind: "FULL_ROW",
    issues: [],
    ...overrides,
  };
}

const trades = [
  trade("trade-1", "2026-08-01", "OURS", { tradingDealer: "SHEEHY LEXUS OF RICHMOND", outgoingModelNumber: "9840" }),
  trade("trade-2", "2026-09-01", "THEIRS", { dealerCode: "65407", outgoingModelNumber: "9353" }),
  trade("trade-3", "2026-01-02", "OURS"),
];

describe("DxPartners", () => {
  it("merges known aliases and shows factual spreadsheet-only relationship math", () => {
    render(<DxPartners trades={trades} />);

    const desktopTable = screen.getByRole("table");
    expect(within(desktopTable).getByRole("columnheader", { name: "Vehicles received" })).toBeInTheDocument();
    expect(within(desktopTable).getByRole("columnheader", { name: "Vehicles sent" })).toBeInTheDocument();
    expect(within(desktopTable).getByRole("columnheader", { name: "Requested by" })).toBeInTheDocument();
    const dealerRow = within(desktopTable).getByRole("button", { name: "RICHMOND" }).closest("tr");
    expect(dealerRow).not.toBeNull();
    expect(within(dealerRow!).getByText(/2 source names merged/)).toBeInTheDocument();
    expect(dealerRow).toHaveTextContent("2");
    expect(dealerRow).toHaveTextContent("1");
    expect(dealerRow).toHaveTextContent("3");
    expect(dealerRow).toHaveTextContent("We owe 1");
    expect(dealerRow).toHaveTextContent("Us 2 · Them 1");
  });

  it("excludes older records and removes historical range controls", () => {
    render(<DxPartners trades={[...trades, trade("old", "2025-09-01", "OURS")]} />);
    expect(screen.queryByRole("button", { name: "All time" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recent 12 months" })).not.toBeInTheDocument();
    expect(screen.getByText(/Jan 2–Oct 5, 2026/)).toBeInTheDocument();
    const row = within(screen.getByRole("table")).getByRole("button", { name: "RICHMOND" }).closest("tr");
    expect(row).toHaveTextContent("Us 2 · Them 1");
    expect(within(screen.getByRole("table")).getByRole("columnheader", { name: "Ledger records" })).toBeInTheDocument();
  });

  it("opens source-addressable dealer history from the partner row", () => {
    render(<DxPartners trades={trades} />);

    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "RICHMOND" }));

    const drawer = screen.getByTestId("dx-dealer-history-drawer");
    expect(within(drawer).getByText("Vehicle movement records")).toBeInTheDocument();
    expect(within(drawer).getAllByTestId("dx-history-event")).toHaveLength(3);
    expect(within(drawer).getAllByRole("link", { name: /Source:/ })).toHaveLength(3);
    expect(within(drawer).getAllByText(/Requested by us/i).length).toBeGreaterThan(0);
    expect(within(drawer).getAllByText(/Requested by them/i).length).toBeGreaterThan(0);
    expect(within(drawer).getByText(/Who requested it: us 2 · them 1/i)).toBeInTheDocument();
  });
});
