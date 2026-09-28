import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DxDirection, DxTrade } from "../../src/utils/dxSheetParser";
import { getDxDirectionMeaning } from "../../src/utils/dxSheetParser";
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
    sourceWorkbookId: "workbook",
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
  trade("trade-1", "2026-08-01", "OURS", { tradingDealer: "SHEEHY LEXUS OF RICHMOND" }),
  trade("trade-2", "2025-09-01", "THEIRS", { dealerCode: "65407" }),
  trade("trade-3", "2024-01-01", "OURS"),
];

describe("DxPartners", () => {
  it("merges known aliases and shows factual all-time relationship math", () => {
    render(<DxPartners trades={trades} />);

    const desktopTable = screen.getByRole("table");
    expect(within(desktopTable).getByRole("columnheader", { name: "Received" })).toBeInTheDocument();
    expect(within(desktopTable).getByRole("columnheader", { name: "Sent" })).toBeInTheDocument();
    const dealerRow = within(desktopTable).getByRole("button", { name: "RICHMOND" }).closest("tr");
    expect(dealerRow).not.toBeNull();
    expect(within(dealerRow!).getByText(/2 source names merged/)).toBeInTheDocument();
    expect(dealerRow).toHaveTextContent("2");
    expect(dealerRow).toHaveTextContent("1");
    expect(dealerRow).toHaveTextContent("3");
    expect(dealerRow).toHaveTextContent("Send 1 to even");
  });

  it("switches the table to the inclusive recent 12-month view", () => {
    render(<DxPartners trades={trades} />);

    fireEvent.click(screen.getByRole("button", { name: "Recent 12 months" }));

    const dealerRow = within(screen.getByRole("table"))
      .getByRole("button", { name: "RICHMOND" })
      .closest("tr");
    expect(dealerRow).not.toBeNull();
    expect(dealerRow).toHaveTextContent("1");
    expect(dealerRow).toHaveTextContent("2");
    expect(dealerRow).toHaveTextContent("Even");
  });

  it("opens source-addressable dealer history from the partner row", () => {
    render(<DxPartners trades={trades} />);

    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "RICHMOND" }));

    const drawer = screen.getByTestId("dx-dealer-history-drawer");
    expect(within(drawer).getByText("Completed vehicle history")).toBeInTheDocument();
    expect(within(drawer).getAllByTestId("dx-history-event")).toHaveLength(3);
    expect(within(drawer).getAllByRole("link", { name: /Source:/ })).toHaveLength(3);
    expect(within(drawer).getAllByText(/^Received$/i).length).toBeGreaterThan(0);
    expect(within(drawer).getAllByText(/^Sent$/i).length).toBeGreaterThan(0);
  });
});
