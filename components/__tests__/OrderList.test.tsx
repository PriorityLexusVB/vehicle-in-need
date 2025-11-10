import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderList from "../OrderList";
import { Order, OrderStatus } from "../../types";

describe("OrderList", () => {
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
      status: OrderStatus.Locate,
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
      />
    );

    // Should show active orders by default (not delivered)
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
      />
    );

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "John Doe");

    // Should only show John Doe's order
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.queryByText("Bob Johnson")).not.toBeInTheDocument();
  });

  it("switches between active and delivered tabs", async () => {
    const user = userEvent.setup();
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
      />
    );

    // Default is active tab
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();

    // Click delivered tab
    const deliveredButton = screen.getByRole("button", {
      name: /delivered history/i,
    });
    await user.click(deliveredButton);

    // Should now show delivered order
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
      />
    );

    // Click the "Locate" filter button (no select in current UI); disambiguate if multiple role="button" matches by taking the first pill
    const locateFilterBtn = screen.getAllByRole("button", { name: /locate/i })[0];
    await user.click(locateFilterBtn);

    // Should only show orders with Locate status
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
      />
    );

  // Dynamic active order count using current UI label 'Active Orders <count>'
    const activeCount = mockOrders.filter(
      (o) => o.status !== OrderStatus.Delivered
    ).length;
    const activeTabRegex = new RegExp(
      `^Active\\s*Orders\\s*${activeCount}$`,
      "i"
    );
    expect(
      screen.getByRole("button", { name: activeTabRegex })
    ).toBeInTheDocument();
  });

  it("displays order count in delivered tab", () => {
    render(
      <OrderList
        orders={mockOrders}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
      />
    );

  // Dynamic delivered order count using current UI label 'Delivered History <count>'
    const deliveredCount = mockOrders.filter(
      (o) => o.status === OrderStatus.Delivered
    ).length;
    const deliveredTabRegex = new RegExp(
      `^Delivered\\s*History\\s*${deliveredCount}$`,
      "i"
    );
    expect(
      screen.getByRole("button", { name: deliveredTabRegex })
    ).toBeInTheDocument();
  });

  it("shows empty state when no orders exist", () => {
    render(
      <OrderList
        orders={[]}
        onUpdateStatus={mockOnUpdateStatus}
        onDeleteOrder={mockOnDeleteOrder}
      />
    );

    expect(screen.getByText(/no orders found/i)).toBeInTheDocument();
  });
});
