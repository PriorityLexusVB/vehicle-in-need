import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../types";
import {
  beginDxRefresh,
  completeDxRefresh,
  createDxFeedState,
  failDxRefresh,
} from "../../src/utils/dxFeedState";
import { getDxDirectionMeaning, type DxDirection, type DxTrade } from "../../src/utils/dxSheetParser";
import AllocationBoard from "../AllocationBoard";

vi.mock("../../services/allocationService", () => ({
  subscribeLatestAllocationSnapshot: vi.fn(() => () => undefined),
  publishAllocationSnapshot: vi.fn(),
}));
vi.mock("../../services/orderService", () => ({
  subscribeActiveOrders: vi.fn(() => () => undefined),
}));
vi.mock("../../services/orderLinkingService", () => ({
  linkVehicleToOrder: vi.fn(),
  unlinkVehicleFromOrder: vi.fn(),
}));
vi.mock("../../services/useVehicleLinks", () => ({
  useVehicleLinks: vi.fn(() => ({ linksByVehicleId: new Map() })),
}));
vi.mock("../../src/utils/pdfTextExtractor", () => ({
  extractAllocationTextFromPdf: vi.fn(),
}));

const manager: AppUser = {
  uid: "manager-1",
  email: "manager@priorityautomotive.com",
  displayName: "Manager",
  isManager: true,
};

function trade(id: string, date: string, direction: DxDirection, sourceYear = 2026): DxTrade {
  return {
    id,
    date,
    year: String(sourceYear),
    modelNumber: "9353",
    description: "TX350",
    colorCode: "0089",
    color: "WHITE",
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
    sourceYear,
    sourceWorkbookId: "workbook",
    sourceWorkbookTitle: "DX workbook",
    sourceTabName: `${sourceYear} DX`,
    sourceGid: "0",
    sourceRowNumber: 2,
    sourceRowUrl: `https://example.test/${id}`,
    sourceFingerprint: id.padEnd(16, "0").slice(0, 16),
    sourceSchema: sourceYear === 2026 ? "CURRENT_2026" : "LEGACY_2024_2025",
    sourceDataKind: sourceYear === 2026 ? "FULL_ROW" : "SANITIZED_HISTORY",
    issues: [],
  };
}

function renderFeed(
  dxFeed: ReturnType<typeof createDxFeedState>,
  onRefreshDx = vi.fn(),
  initialEntry = "/",
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AllocationBoard
        currentUser={manager}
        sharedSnapshot={null}
        dxFeed={dxFeed}
        onRefreshDx={onRefreshDx}
      />
    </MemoryRouter>,
  );
}

const historical = trade("history", "2025-05-01", "THEIRS", 2025);
const live = trade("live", "2026-08-25", "OURS");
const successAt = new Date("2026-08-29T17:15:00Z");

describe("AllocationBoard DX feed states", () => {
  it("shows CURRENT with separate business-record and browser-fetch timestamps", () => {
    const feed = completeDxRefresh(createDxFeedState([historical]), [live], successAt, [{
      sourceYear: 2026,
      sourceRowNumber: 67,
      sourceRowUrl: "https://example.test/row-67",
      sourceFingerprint: "1234567890abcdef",
      reason: "MISSING_VEHICLE_EVIDENCE",
    }]);
    const onRefresh = vi.fn();
    renderFeed(feed, onRefresh);

    expect(screen.getByTestId("dx-feed-status")).toHaveTextContent("CURRENT");
    expect(screen.getByText(/Latest DX record/)).toHaveTextContent("Aug 25, 2026");
    expect(screen.getByText(/Browser fetched/)).not.toHaveTextContent("Aug 25, 2026");
    expect(screen.getByText("2 completed")).toBeInTheDocument();
    expect(screen.getByTestId("dx-rejected-source-rows")).toHaveTextContent(
      "1 non-transaction source row was excluded from completed metrics",
    );
    expect(screen.getByRole("link", { name: /Source row 67/ })).toHaveAttribute(
      "href",
      "https://example.test/row-67",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh current source" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows SYNCING while retaining the last successful relationship data", () => {
    const current = completeDxRefresh(createDxFeedState([historical]), [live], successAt);
    renderFeed(beginDxRefresh(current, new Date("2026-08-29T17:16:00Z")));

    expect(screen.getByTestId("dx-feed-status")).toHaveTextContent("SYNCING");
    expect(screen.getByText("2 completed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Syncing..." })).toBeDisabled();
  });

  it("shows STALE and preserves rows after a warm source failure", () => {
    const current = completeDxRefresh(createDxFeedState([historical]), [live], successAt);
    renderFeed(failDxRefresh(current, "Timed out", new Date("2026-08-29T17:17:00Z")));

    expect(screen.getByTestId("dx-feed-status")).toHaveTextContent("STALE");
    expect(screen.getByText(/Showing last successful data/)).toBeInTheDocument();
    expect(screen.getByText("2 completed")).toBeInTheDocument();
  });

  it("distinguishes a cold SOURCE ERROR from a valid NO CURRENT DATA response", () => {
    const coldFailure = failDxRefresh(
      createDxFeedState([historical]),
      "Malformed source",
      new Date("2026-08-29T17:17:00Z"),
    );
    const first = renderFeed(coldFailure);
    expect(screen.getByTestId("dx-feed-status")).toHaveTextContent("SOURCE ERROR");
    expect(screen.getByText(/Current 2026 source unavailable/)).toBeInTheDocument();
    expect(screen.getByText("1 completed")).toBeInTheDocument();
    first.unmount();

    renderFeed(completeDxRefresh(createDxFeedState([historical]), [], successAt));
    expect(screen.getByTestId("dx-feed-status")).toHaveTextContent("NO CURRENT DATA");
    expect(screen.getByText(/No current 2026 DX rows were returned/)).toBeInTheDocument();
    expect(screen.getByText("1 completed")).toBeInTheDocument();
  });

  it("opens completed history and keeps the URL DX model highlight for the review CTA", () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const feed = completeDxRefresh(createDxFeedState(), [live], successAt);

    renderFeed(feed, vi.fn(), "/?dxModel=TX350&scrollTo=dx-pipeline");

    expect(screen.getByRole("tab", { name: "Completed exchanges" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("dx-completed-history")).toBeInTheDocument();
    expect(document.querySelector('#dx-pipeline tr[data-dx-highlight="true"]')).not.toBeNull();

    act(() => vi.advanceTimersByTime(800));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
