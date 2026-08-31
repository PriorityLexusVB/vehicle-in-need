import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import ProtectedRoute from "../ProtectedRoute";
import { AppUser } from "../../types";

// Minimal stand-ins for pages
function AdminPage() {
  return <div>Admin Panel</div>;
}
function DealerExchangePage() {
  return <div>Dealer Exchange Page</div>;
}
function HomePage() {
  return <div>Home Page</div>;
}

const manager: AppUser = {
  uid: "m1",
  email: "m@priorityautomotive.com",
  displayName: "Mgr",
  isManager: true,
};
const nonManager: AppUser = {
  uid: "u1",
  email: "u@priorityautomotive.com",
  displayName: "User",
  isManager: false,
};

function renderRoutes(user: AppUser | null, initialEntry = "/admin") {
  return render(
    <MemoryRouter 
      initialEntries={[initialEntry]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route
          path="/admin"
          element={
            <ProtectedRoute user={user}>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dealer-exchange"
          element={
            <ProtectedRoute user={user}>
              <DealerExchangePage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<HomePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("App routing protection", () => {
  it("allows manager access to /admin", () => {
    renderRoutes(manager);
    expect(screen.getByText("Admin Panel")).toBeInTheDocument();
  });
  it("redirects non-manager from /admin to /", () => {
    renderRoutes(nonManager);
    expect(screen.queryByText("Admin Panel")).toBeNull();
    expect(screen.getByText("Home Page")).toBeInTheDocument();
  });
  it("redirects unauthenticated from /admin to /", () => {
    renderRoutes(null);
    expect(screen.queryByText("Admin Panel")).toBeNull();
    expect(screen.getByText("Home Page")).toBeInTheDocument();
  });
  it("allows managers to enter the Dealer Exchange route", () => {
    renderRoutes(manager, "/dealer-exchange");
    expect(screen.getByText("Dealer Exchange Page")).toBeInTheDocument();
  });
  it("redirects representatives away from the Dealer Exchange route", () => {
    renderRoutes(nonManager, "/dealer-exchange");
    expect(screen.queryByText("Dealer Exchange Page")).toBeNull();
    expect(screen.getByText("Home Page")).toBeInTheDocument();
  });
});
