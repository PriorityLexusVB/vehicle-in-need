import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderList from "../OrderList";
import { Order, OrderStatus, AppUser } from "../../types";

describe("OrderList", () => {
  const mockManagerUser: AppUser = {
    uid: "manager-123",
    email: "manager@priorityautomotive.com",
    displayName: "Manager User",
    isManager: true,
  };

  const mockOrders: Order[] = [
    {
      id: "1",
      customerName: "John Doe",
      year: "2024",
      model: "Lexus RX 350",
      status: OrderStatus.FactoryOrder,
      date: "2024-01-15",
      salesperson: "Alice",
      createdAt: new Date(),
      dealNumber: "DEAL-001",
      stockNumber: "STOCK-001",
    },
    {
      id: "2",
      customerName: "Jane Smith",
      year: "2024",
      model: "Lexus ES 350",
      status: OrderStatus.Delivered,
      date: "2024-01-10",
      salesperson: "Bob",
      createdAt: new Date(),
      dealNumber: "DEAL-002",
      stockNumber: "STOCK-002",
    },
    {
      id: "3",
      customerName: "Bob Johnson",
      year: "2024",
      model: "Lexus NX 350",
      status: OrderStatus.DealerExchange,
      date: "2024-01-20",
      salesperson: "Charlie",
      createdAt: new Date(),
      dealNumber: "DEAL-003",
      stockNumber: "STOCK-003",
    },
  ] as Order[];

  const mockOnUpdateStatus = vi.fn();
  const mockOnDeleteOrder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders list of orders", () => {
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />
    );

    // Should show active orders by default (not secured)
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Bob Johnson")).toBeInTheDocument();
  });

  it("filters orders by search query", async () => {
    const user = userEvent.setup();
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />
    );

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "John Doe");

    // Should only show John Doe's order
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.queryByText("Bob Johnson")).not.toBeInTheDocument();
  });

  it("switches between active and secured tabs", async () => {
    const user = userEvent.setup();
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />
    );

    // Default is active tab
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();

    // Click secured history tab (renamed from "delivered history")
    const securedButton = screen.getByRole("button", {
      name: /secured history/i,
    });
    await user.click(securedButton);

    // Should now show secured order (legacy Delivered status)
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
  });

  it("filters orders by status", async () => {
    const user = userEvent.setup();
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />
    );

    // Click the "Dealer Exchange" filter button (Locate removed from UI)
    const dealerExchangeFilterBtn = screen.getAllByRole("button", { name: /dealer exchange/i })[0];
    await user.click(dealerExchangeFilterBtn);

    // Should only show orders with Dealer Exchange status
    expect(screen.getByText("Bob Johnson")).toBeInTheDocument();
    expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
  });

  it("shows message when no orders match filters", async () => {
    const user = userEvent.setup();
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />
    );

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "NonexistentCustomer");

    expect(screen.getByText(/no orders found/i)).toBeInTheDocument();
  });

  it("displays order count in active tab", () => {
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />
    );

    // Dynamic active order count using current UI label 'Active Orders <count>'
    const activeCount = mockOrders.filter(
      (o) => o.status !== OrderStatus.Delivered && o.status !== OrderStatus.Received
    ).length;
    const activeTabRegex = new RegExp(
      `^Active\\s*Orders\\s*${activeCount}$`,
      "i"
    );
    expect(
      screen.getByRole("button", { name: activeTabRegex })
    ).toBeInTheDocument();
  });

  it("displays order count in secured tab", () => {
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />
    );

    // Dynamic secured order count using current UI label 'Secured History <count>'
    // Secured includes legacy Received and Delivered statuses
    const securedCount = mockOrders.filter(
      (o) => o.status === OrderStatus.Delivered || o.status === OrderStatus.Received
    ).length;
    const securedTabRegex = new RegExp(
      `^Secured\\s*History\\s*${securedCount}$`,
      "i"
    );
    expect(
      screen.getByRole("button", { name: securedTabRegex })
    ).toBeInTheDocument();
  });

  it("shows empty state when no orders exist", () => {
    render(
      <OrderList
        orders={[]}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />
    );

    expect(screen.getByText(/no orders found/i)).toBeInTheDocument();
  });

  it("only shows Factory Order and Dealer Exchange filter buttons (Locate removed)", () => {
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
        currentUser={mockManagerUser}
      />
    );

    // Get all filter buttons (they are in the filter area with specific styling)
    const allActiveBtn = screen.getByRole("button", { name: /all active/i });
    expect(allActiveBtn).toBeInTheDocument();
    
    // Factory Order and Dealer Exchange filter buttons should exist
    const factoryOrderBtns = screen.getAllByRole("button", { name: /factory order/i });
    expect(factoryOrderBtns.length).toBeGreaterThan(0);
    
    const dealerExchangeBtns = screen.getAllByRole("button", { name: /dealer exchange/i });
    expect(dealerExchangeBtns.length).toBeGreaterThan(0);

    // Should NOT have any Locate button - neither filter nor any other kind
    expect(screen.queryByRole("button", { name: /^locate$/i })).not.toBeInTheDocument();
  });
});
