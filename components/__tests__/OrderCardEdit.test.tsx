import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderCard from "../OrderCard";
import { AppUser, Order, OrderStatus } from "../../types";

vi.mock("../OrderNotes", () => ({
  default: () => null,
}));

const linkMocks = vi.hoisted(() => ({
  linkVehicleToOrder: vi.fn(),
  unlinkVehicleFromOrder: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/orderLinkingService", () => linkMocks);

describe("OrderCard manager edit", () => {
  const mockManagerUser: AppUser = {
    uid: "manager-123",
    email: "manager@priorityautomotive.com",
    displayName: "Manager User",
    isManager: true,
  };

  const baseOrder: Order = {
    id: "order-1",
    salesperson: "Alice",
    manager: "Bob",
    date: "2024-01-15",
    customerName: "John Doe",
    dealNumber: "DEAL-001",
    stockNumber: "STOCK-001",
    vin: "VIN12345",
    year: "2024",
    model: "Lexus RX 350",
    modelNumber: "350H",
    exteriorColor1: "ABC",
    interiorColor1: "XYZ",
    msrp: 50000,
    depositAmount: 1000,
    status: OrderStatus.FactoryOrder,
    options: "Test options",
    notes: "Test notes",
  };

  const mockOnUpdateStatus = vi.fn();
  const mockOnDeleteOrder = vi.fn();
  const mockOnUpdateOrderDetails = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a two-step confirm to unlink a vehicle", async () => {
    const user = userEvent.setup();
    const linkedOrder: Order = {
      ...baseOrder,
      allocatedVehicleId: "RX350-001",
      allocatedVehicleInfo: "RX 350 - Eminent White",
    };

    render(
      <OrderCard
        order={linkedOrder}
        onUpdateStatus={mockOnUpdateStatus}
        onUpdateOrderDetails={mockOnUpdateOrderDetails}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />,
    );

    // Expand the card so the linked-vehicle block (with Unlink) is visible.
    await user.click(
      screen.getByRole("button", { name: /toggle order details/i }),
    );

    // First click reveals a confirm step; it does NOT unlink immediately.
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    expect(linkMocks.unlinkVehicleFromOrder).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();

    // Collapsing the card disarms the confirm (no stale "Confirm" on reopen).
    const toggle = () =>
      user.click(screen.getByRole("button", { name: /toggle order details/i }));
    await toggle(); // collapse
    await toggle(); // reopen
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.getByRole("button", { name: "Unlink" })).toBeInTheDocument();

    // Cancel aborts without unlinking.
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Unlink" })).toBeInTheDocument();
    expect(linkMocks.unlinkVehicleFromOrder).not.toHaveBeenCalled();

    // Confirm actually unlinks.
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(linkMocks.unlinkVehicleFromOrder).toHaveBeenCalled();
    });
  });

  it("shows Edit for managers on active orders and saves updates", async () => {
    const user = userEvent.setup();

    render(
      <OrderCard
        order={baseOrder}
        onUpdateStatus={mockOnUpdateStatus}
        onUpdateOrderDetails={mockOnUpdateOrderDetails}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />,
    );

    // Expand
    await user.click(
      screen.getByRole("button", { name: /toggle order details/i }),
    );

    // Enter edit mode
    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    // Change a couple fields
    const customerName = screen.getByLabelText(/customer name\*/i);
    await user.clear(customerName);
    await user.type(customerName, "Jane Doe");

    const msrp = screen.getByLabelText(/^msrp\*/i);
    await user.clear(msrp);
    await user.type(msrp, "60000");

    const deposit = screen.getByLabelText(/deposit amount\*/i);
    await user.clear(deposit);
    await user.type(deposit, "1200");

    // Save
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockOnUpdateOrderDetails).toHaveBeenCalledTimes(1);
    });

    expect(mockOnUpdateOrderDetails).toHaveBeenCalledWith(
      baseOrder.id,
      expect.objectContaining({
        customerName: "Jane Doe",
        msrp: 60000,
        depositAmount: 1200,
      }),
    );

    // Form should close on success
    await waitFor(() => {
      expect(
        screen.queryByLabelText(/edit order details/i),
      ).not.toBeInTheDocument();
    });
  });

  it("does not show Edit for secured orders", async () => {
    const user = userEvent.setup();

    render(
      <OrderCard
        order={{ ...baseOrder, status: OrderStatus.Delivered }}
        onUpdateStatus={mockOnUpdateStatus}
        onUpdateOrderDetails={mockOnUpdateOrderDetails}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /toggle order details/i }),
    );

    expect(
      screen.queryByRole("button", { name: /^edit$/i }),
    ).not.toBeInTheDocument();
  });
});
