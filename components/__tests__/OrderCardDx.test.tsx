import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { OrderMatchSummary } from "../../src/utils/orderMatchSummary";
import { OrderStatus, type Order } from "../../types";
import OrderCard from "../OrderCard";

vi.mock("../OrderNotes", () => ({ default: () => null }));
vi.mock("../../services/orderLinkingService", () => ({
  linkVehicleToOrder: vi.fn(),
  unlinkVehicleFromOrder: vi.fn(),
}));

const baseOrder: Order = {
  id: "dx-order",
  salesperson: "Alex",
  manager: "Manager",
  date: "2026-08-29",
  customerName: "DX Customer",
  dealNumber: "D-1",
  stockNumber: "",
  vin: "",
  year: "2026",
  model: "TX350",
  modelNumber: "9353",
  exteriorColor1: "White",
  interiorColor1: "Black",
  msrp: 0,
  depositAmount: 0,
  status: OrderStatus.DealerExchange,
  options: "",
  notes: "",
};

const dxHistory: OrderMatchSummary = {
  exactCount: 0,
  partialCount: 0,
  modelOnlyCount: 0,
  dxExactCount: 1,
  dxPartialCount: 1,
  dxModelOnlyCount: 2,
  matchedAllocModels: new Set(),
};

function renderCard(order = baseOrder, matchSummary = dxHistory) {
  return render(
    <MemoryRouter>
      <OrderCard
        order={order}
        matchSummary={matchSummary}
        onUpdateStatus={vi.fn()}
        onUpdateOrderDetails={vi.fn().mockResolvedValue(true)}
        onDeleteOrder={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("OrderCard completed DX context", () => {
  it("shows completed OURS history for an active Dealer Exchange order", async () => {
    const user = userEvent.setup();
    renderCard();

    const badge = screen.getByRole("button", { name: /Preview allocation matches and completed DX history/i });
    expect(badge).toHaveTextContent("DX history: 4");
    await user.click(badge);

    expect(screen.getByText("Completed DX history")).toBeInTheDocument();
    expect(screen.getByText(/Prior completed OURS rows/)).toBeInTheDocument();
    expect(screen.getByText("1 same color")).toBeInTheDocument();
    expect(screen.getByText("1 related color")).toBeInTheDocument();
    expect(screen.getByText("2 model history")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review completed DX history" })).toHaveAttribute(
      "href",
      "/dealer-exchange?scrollTo=dx-pipeline&dxModel=TX350",
    );
  });

  it("does not present historical DX context on a secured order", () => {
    renderCard({ ...baseOrder, status: OrderStatus.Secured });
    expect(screen.queryByText(/DX history:/)).not.toBeInTheDocument();
  });

  it("keeps DX history in manager details without a collapsed arrow chip", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OrderCard
          order={baseOrder}
          matchSummary={dxHistory}
          currentUser={{ uid: "manager", email: "manager@example.test", displayName: "Manager", isManager: true }}
          onUpdateStatus={vi.fn()}
          onUpdateOrderDetails={vi.fn().mockResolvedValue(true)}
          onDeleteOrder={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /Preview allocation matches and completed DX history/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Toggle order details" }));
    await user.click(screen.getByRole("button", { name: "Review allocation matches and DX history" }));
    expect(screen.getByText("Completed DX history")).toBeInTheDocument();
  });
});
