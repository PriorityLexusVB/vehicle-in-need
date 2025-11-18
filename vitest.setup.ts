import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Ensure server-side AI initialization is disabled during tests to avoid outbound calls
process.env.DISABLE_VERTEX_AI = "true";

// Skip CSS validation in server tests
process.env.NODE_ENV = "test";
