import { describe, it, expect, beforeAll, vi } from "vitest";
import dxPartnersSource from "../DxPartners.tsx?raw";
import matchPreviewModalSource from "../MatchPreviewModal.tsx?raw";
import zeroManagerWarningSource from "../ZeroManagerWarning.tsx?raw";
import orderListSource from "../OrderList.tsx?raw";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "../Header";
import OrderPreviewDrawer from "../OrderPreviewDrawer";
import { AppUser, Order, OrderStatus } from "../../types";

// Pins the DESIGN.md questions resolved on 2026-09-17 (see DESIGN.md
// "Interaction Law", "Documented palette drift", "Override Register").

beforeAll(() => {
  // vaul reads matchMedia; jsdom does not implement it.
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }
});

// Exact class token, so "text-stone-500" is not satisfied by "hover:text-stone-500".
const hasToken = (className: string, token: string) =>
  className.split(/\s+/).includes(token);

const user: AppUser = {
  uid: "u1",
  email: "user@priorityautomotive.com",
  displayName: "Regular User",
  isManager: false,
};

const order = (status: OrderStatus): Order =>
  ({
    id: "order-1",
    customerName: "Test Customer",
    year: "2026",
    model: "RX 350",
    status,
    date: "2026-09-01",
    salesperson: "Alice",
  }) as Order;

describe("V-i-N DESIGN.md resolved questions", () => {
  it("header hamburger and Sign Out meet the 44px house target", () => {
    render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Header user={user} totalOrders={1} onLogout={() => {}} currentPath={"/"} />
      </MemoryRouter>
    );
    const menu = screen.getByTestId("mobile-menu-button").className;
    expect(hasToken(menu, "h-11") && hasToken(menu, "w-11")).toBe(true);
    const signOut = screen.getByRole("button", { name: "Sign Out" }).className;
    expect(hasToken(signOut, "min-h-11") && hasToken(signOut, "min-w-11")).toBe(true);
  });

  // The drawer only ever receives Factory Order or Locate orders (AllocationBoard
  // filters activeOrders with isAllocationLinkable), so these are the reachable states.
  it("drawer Factory Order uses the shared StatusBadge brand tone, not the old indigo pill", () => {
    render(<OrderPreviewDrawer order={order(OrderStatus.FactoryOrder)} onClose={() => {}} />);
    const badge = within(screen.getByRole("dialog")).getByText(OrderStatus.FactoryOrder);
    expect(badge.className).not.toContain("indigo");
    expect(hasToken(badge.className, "rounded-full")).toBe(true);
    expect(hasToken(badge.className, "text-stone-700")).toBe(true);
  });

  it("drawer Locate uses the warning tone, matching OrderCard (was neutral gray)", () => {
    render(<OrderPreviewDrawer order={order(OrderStatus.Locate)} onClose={() => {}} />);
    const badge = within(screen.getByRole("dialog")).getByText(OrderStatus.Locate);
    expect(hasToken(badge.className, "text-amber-800")).toBe(true);
  });

  it("drawer close button is a 44px target with a >=3:1 glyph color", () => {
    render(<OrderPreviewDrawer order={order(OrderStatus.FactoryOrder)} onClose={() => {}} />);
    const close = screen.getByRole("button", { name: "Close order preview" }).className;
    expect(hasToken(close, "h-11") && hasToken(close, "w-11")).toBe(true);
    expect(hasToken(close, "text-stone-500")).toBe(true);
    expect(hasToken(close, "text-stone-400")).toBe(false);
  });

  it("the other icon-only close/dismiss buttons carry the same 44px + readable-glyph classes", () => {
    const closeClass =
      'className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"';
    expect(dxPartnersSource).toContain(
      'className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-platinum"',
    );
    expect(dxPartnersSource).not.toContain("text-stone-500 transition-colors hover:bg-stone-100");
    expect(matchPreviewModalSource).toContain(closeClass);
    const warning = zeroManagerWarningSource;
    expect(warning).toContain("inline-flex h-11 w-11 items-center justify-center rounded-md bg-yellow-50 text-yellow-700");
    expect(warning).not.toContain("text-yellow-500");
    const list = orderListSource;
    expect(list).toContain("flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-stone-500");
    expect(list).toContain("pr-11");
  });
});
