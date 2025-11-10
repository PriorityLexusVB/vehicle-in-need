import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import ProtectedRoute from "../ProtectedRoute";
import { AppUser } from "../../types";

// Minimal stand-ins for pages
function AdminPage() {
  return <div>Admin Panel</div>;
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

function renderRoutes(user: AppUser | null) {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <ProtectedRoute user={user}>
              <AdminPage />
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
});
