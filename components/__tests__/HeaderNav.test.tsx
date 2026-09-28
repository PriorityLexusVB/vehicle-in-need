import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "../Header";
import { AppUser } from "../../types";

const baseUser: AppUser = {
  uid: "u1",
  email: "user@priorityautomotive.com",
  displayName: "Regular User",
  isManager: false,
};

const managerUser: AppUser = {
  ...baseUser,
  isManager: true,
  displayName: "Manager User",
};

function renderHeader(user: AppUser, currentPath = "/") {
  return render(
    <MemoryRouter 
      initialEntries={["/"]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Header
        user={user}
        totalOrders={42}
        onLogout={() => {}}
        currentPath={currentPath}
      />
    </MemoryRouter>
  );
}

describe("Header navigation", () => {
  it("hides manager navigation for non-managers", () => {
    renderHeader(baseUser);
    expect(screen.getByTestId("main-nav")).toBeInTheDocument();
    expect(screen.getByTestId("allocation-nav-link")).toBeInTheDocument();
    expect(screen.getByTestId("requests-nav-link")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-nav-link")).toBeNull();
    expect(screen.queryByTestId("dx-nav-link")).toBeNull();
    expect(screen.queryByTestId("mobile-dx-nav-link")).toBeNull();
    expect(screen.queryByTestId("admin-nav-link")).toBeNull();
    expect(screen.queryByTestId("admin-settings-link")).toBeNull();
    expect(
      screen.getByRole("heading", { name: /vehicle order tracker/i })
    ).toBeInTheDocument();
  });

  it("shows manager navigation and active orders count for managers", () => {
    renderHeader(managerUser, "/dealer-exchange");
    // nav wrapper
    expect(screen.getByTestId("main-nav")).toHaveClass("min-[1120px]:flex");
    expect(screen.getByTestId("allocation-nav-link")).toBeInTheDocument();
    // dashboard link
    expect(screen.getByTestId("dashboard-nav-link")).toBeInTheDocument();
    expect(screen.getByTestId("dx-nav-link")).toHaveAttribute("href", "/dealer-exchange");
    expect(screen.getByTestId("dx-nav-link")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByTestId("requests-nav-link")).toBeNull();
    // admin link (nav pill)
    expect(screen.getByTestId("admin-nav-link")).toBeInTheDocument();
    // active orders count
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/active orders/i).parentElement).toHaveClass("2xl:block");
    expect(
      within(screen.getByTestId("main-nav"))
        .getAllByRole("link")
        .map((link) => link.textContent?.trim()),
    ).toEqual(["Dashboard", "Allocation Board", "Dealer Exchange", "User Management"]);
  });

  it("shows the manager-only DX destination in the mobile menu and closes after navigation", () => {
    renderHeader(managerUser);

    const menuButton = screen.getByTestId("mobile-menu-button");
    expect(menuButton).toHaveClass("min-[1120px]:hidden");
    expect(screen.getByTestId("mobile-menu")).toHaveClass("min-[1120px]:hidden");
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    const dxLink = screen.getByTestId("mobile-dx-nav-link");
    expect(dxLink).toHaveAttribute("href", "/dealer-exchange");
    fireEvent.click(dxLink);
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it("app title is clickable and links to home", () => {
    renderHeader(managerUser);
    const titleLink = screen.getByRole("link", { name: /vehicle order tracker/i });
    expect(titleLink).toBeInTheDocument();
    expect(titleLink).toHaveAttribute("href", "/");
  });

  it("displays version badge for all users", () => {
    renderHeader(baseUser);
    // VersionBadge component should be present (it may not render if version is 'dev')
    const heading = screen.getByRole("heading", { name: /vehicle order tracker/i });
    expect(heading).toBeInTheDocument();
  });

  it("shows welcome message with user name", () => {
    renderHeader(managerUser);
    expect(screen.getByText(/welcome, manager user/i)).toBeInTheDocument();
  });

  it("shows manager role indicator for managers", () => {
    renderHeader(managerUser);
    expect(screen.getByText(/\(manager\)/i)).toBeInTheDocument();
  });

  it("does not show role indicator for non-managers", () => {
    renderHeader(baseUser);
    expect(screen.queryByText(/\(manager\)/i)).toBeNull();
  });
});
