import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderCard from "../OrderCard";
import StatusBadge from "../StatusBadge";
import { Order, OrderStatus, AppUser } from "../../types";
import { normalizeStatusForUI, isSecuredStatus, isActiveStatus } from "../../constants";

describe("Secured Status Feature", () => {
  const mockManagerUser: AppUser = {
    uid: "manager-123",
    email: "manager@priorityautomotive.com",
    displayName: "Manager User",
    isManager: true,
  };

  const mockNonManagerUser: AppUser = {
    uid: "user-456",
    email: "user@priorityautomotive.com",
    displayName: "Regular User",
    isManager: false,
  };

  const createMockOrder = (overrides: Partial<Order> = {}): Order => ({
    id: "test-order-1",
    customerName: "Test Customer",
    year: "2024",
    model: "Lexus RX 350",
    status: OrderStatus.FactoryOrder,
    date: "2024-01-15",
    salesperson: "Alice",
    manager: "Bob",
    dealNumber: "DEAL-001",
    stockNumber: "STOCK-001",
    modelNumber: "MODEL-001",
    exteriorColor1: "EXT-001",
    interiorColor1: "INT-001",
    msrp: 50000,
    depositAmount: 1000,
    options: "Test options",
    ...overrides,
  } as Order);

  const mockOnUpdateStatus = vi.fn();
  const mockOnDeleteOrder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeStatusForUI", () => {
    it("maps Received status to Secured", () => {
      expect(normalizeStatusForUI(OrderStatus.Received)).toBe(OrderStatus.Secured);
    });

    it("maps Delivered status to Secured", () => {
      expect(normalizeStatusForUI(OrderStatus.Delivered)).toBe(OrderStatus.Secured);
    });

    it("returns Secured status unchanged", () => {
      expect(normalizeStatusForUI(OrderStatus.Secured)).toBe(OrderStatus.Secured);
    });

    it("returns other statuses unchanged", () => {
      expect(normalizeStatusForUI(OrderStatus.FactoryOrder)).toBe(OrderStatus.FactoryOrder);
      expect(normalizeStatusForUI(OrderStatus.Locate)).toBe(OrderStatus.Locate);
      expect(normalizeStatusForUI(OrderStatus.DealerExchange)).toBe(OrderStatus.DealerExchange);
    });
  });

  describe("isSecuredStatus", () => {
    it("returns true for Received status", () => {
      expect(isSecuredStatus(OrderStatus.Received)).toBe(true);
    });

    it("returns true for Delivered status", () => {
      expect(isSecuredStatus(OrderStatus.Delivered)).toBe(true);
    });

    it("returns true for Secured status", () => {
      expect(isSecuredStatus(OrderStatus.Secured)).toBe(true);
    });

    it("returns false for active statuses", () => {
      expect(isSecuredStatus(OrderStatus.FactoryOrder)).toBe(false);
      expect(isSecuredStatus(OrderStatus.Locate)).toBe(false);
      expect(isSecuredStatus(OrderStatus.DealerExchange)).toBe(false);
    });
  });

  describe("isActiveStatus", () => {
    it("returns false for secured statuses", () => {
      expect(isActiveStatus(OrderStatus.Received)).toBe(false);
      expect(isActiveStatus(OrderStatus.Delivered)).toBe(false);
      expect(isActiveStatus(OrderStatus.Secured)).toBe(false);
    });

    it("returns true for active statuses", () => {
      expect(isActiveStatus(OrderStatus.FactoryOrder)).toBe(true);
      expect(isActiveStatus(OrderStatus.Locate)).toBe(true);
      expect(isActiveStatus(OrderStatus.DealerExchange)).toBe(true);
    });
  });

  describe("StatusBadge", () => {
    it("displays Secured for Received status", () => {
      render(<StatusBadge status={OrderStatus.Received} />);
      expect(screen.getByText("Secured")).toBeInTheDocument();
    });

    it("displays Secured for Delivered status", () => {
      render(<StatusBadge status={OrderStatus.Delivered} />);
      expect(screen.getByText("Secured")).toBeInTheDocument();
    });

    it("displays original status for active statuses", () => {
      render(<StatusBadge status={OrderStatus.FactoryOrder} />);
      expect(screen.getByText("Factory Order")).toBeInTheDocument();
    });
  });

  describe("OrderCard Mark Secured Button", () => {
    it("shows Mark Secured button for active orders when user is manager", async () => {
      const user = userEvent.setup();
      const order = createMockOrder({ status: OrderStatus.FactoryOrder });

      render(
        <OrderCard
          order={order}
          onUpdateStatus={mockOnUpdateStatus}
          onDeleteOrder={mockOnDeleteOrder}
          currentUser={mockManagerUser}
        />
      );

      // Expand the card
      const expandButton = screen.getByRole("button", { name: /toggle order details/i });
      await user.click(expandButton);

      // Should show Mark Secured button
      expect(screen.getByRole("button", { name: /mark secured/i })).toBeInTheDocument();
    });

    it("does NOT show Mark Received or Mark Delivered buttons", async () => {
      const user = userEvent.setup();
      const order = createMockOrder({ status: OrderStatus.FactoryOrder });

      render(
        <OrderCard
          order={order}
          onUpdateStatus={mockOnUpdateStatus}
          onDeleteOrder={mockOnDeleteOrder}
          currentUser={mockManagerUser}
        />
      );

      // Expand the card
      const expandButton = screen.getByRole("button", { name: /toggle order details/i });
      await user.click(expandButton);

      // Should NOT show old buttons
      expect(screen.queryByRole("button", { name: /mark as received/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /mark as delivered/i })).not.toBeInTheDocument();
    });

    it("calls onUpdateStatus with Delivered when Mark Secured is clicked", async () => {
      const user = userEvent.setup();
      const order = createMockOrder({ status: OrderStatus.FactoryOrder });

      render(
        <OrderCard
          order={order}
          onUpdateStatus={mockOnUpdateStatus}
          onDeleteOrder={mockOnDeleteOrder}
          currentUser={mockManagerUser}
        />
      );

      // Expand the card
      const expandButton = screen.getByRole("button", { name: /toggle order details/i });
      await user.click(expandButton);

      // Click Mark Secured
      const markSecuredButton = screen.getByRole("button", { name: /mark secured/i });
      await user.click(markSecuredButton);

      // Should call onUpdateStatus with Delivered (the DB value for secured)
      expect(mockOnUpdateStatus).toHaveBeenCalledWith(order.id, OrderStatus.Delivered);
    });

    it("does not show Mark Secured button for secured orders", async () => {
      const user = userEvent.setup();
      const order = createMockOrder({ status: OrderStatus.Delivered });

      render(
        <OrderCard
          order={order}
          onUpdateStatus={mockOnUpdateStatus}
          onDeleteOrder={mockOnDeleteOrder}
          currentUser={mockManagerUser}
        />
      );

      // Expand the card
      const expandButton = screen.getByRole("button", { name: /toggle order details/i });
      await user.click(expandButton);

      // Should NOT show Mark Secured button for already secured orders
      expect(screen.queryByRole("button", { name: /mark secured/i })).not.toBeInTheDocument();
    });

    it("does not show Mark Secured button for non-manager users", async () => {
      const user = userEvent.setup();
      const order = createMockOrder({ status: OrderStatus.FactoryOrder });

      render(
        <OrderCard
          order={order}
          onUpdateStatus={mockOnUpdateStatus}
          onDeleteOrder={mockOnDeleteOrder}
          currentUser={mockNonManagerUser}
        />
      );

      // Expand the card
      const expandButton = screen.getByRole("button", { name: /toggle order details/i });
      await user.click(expandButton);

      // Should NOT show Mark Secured button for non-managers
      expect(screen.queryByRole("button", { name: /mark secured/i })).not.toBeInTheDocument();
    });

    it("shows Order Secured message for secured orders", async () => {
      const user = userEvent.setup();
      const order = createMockOrder({ status: OrderStatus.Delivered });

      render(
        <OrderCard
          order={order}
          onUpdateStatus={mockOnUpdateStatus}
          onDeleteOrder={mockOnDeleteOrder}
          currentUser={mockManagerUser}
        />
      );

      // Expand the card
      const expandButton = screen.getByRole("button", { name: /toggle order details/i });
      await user.click(expandButton);

      // Should show "Order Secured" message
      expect(screen.getByText("Order Secured")).toBeInTheDocument();
    });
  });

  describe("Create to Secured Flow", () => {
    it("active order can be marked secured directly (single step)", async () => {
      const user = userEvent.setup();
      const order = createMockOrder({ status: OrderStatus.Locate });

      render(
        <OrderCard
          order={order}
          onUpdateStatus={mockOnUpdateStatus}
          onDeleteOrder={mockOnDeleteOrder}
          currentUser={mockManagerUser}
        />
      );

      // Expand the card
      const expandButton = screen.getByRole("button", { name: /toggle order details/i });
      await user.click(expandButton);

      // Find and click Mark Secured button
      const markSecuredButton = screen.getByRole("button", { name: /mark secured/i });
      await user.click(markSecuredButton);

      // Verify single-step flow: directly updates to Delivered status
      expect(mockOnUpdateStatus).toHaveBeenCalledTimes(1);
      expect(mockOnUpdateStatus).toHaveBeenCalledWith(order.id, OrderStatus.Delivered);
    });
  });
});
