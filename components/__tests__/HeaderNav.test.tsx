import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

function renderHeader(user: AppUser) {
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
        currentPath={"/"}
      />
    </MemoryRouter>
  );
}

describe("Header navigation", () => {
  it("hides manager navigation for non-managers", () => {
    renderHeader(baseUser);
    expect(screen.queryByTestId("manager-nav")).toBeNull();
    expect(screen.queryByTestId("admin-settings-link")).toBeNull();
    expect(
      screen.getByRole("heading", { name: /vehicle order tracker/i })
    ).toBeInTheDocument();
  });

  it("shows manager navigation and active orders count for managers", () => {
    renderHeader(managerUser);
    // nav wrapper
    expect(screen.getByTestId("manager-nav")).toBeInTheDocument();
    // dashboard link
    expect(screen.getByTestId("dashboard-nav-link")).toBeInTheDocument();
    // admin link (nav pill)
    expect(screen.getByTestId("admin-nav-link")).toBeInTheDocument();
    // header admin quick link
    expect(screen.getByTestId("admin-settings-link")).toBeInTheDocument();
    // active orders count
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/active orders/i)).toBeInTheDocument();
  });
});
