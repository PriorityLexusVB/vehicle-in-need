import { describe, it, expect } from "vitest";
import { OrderStatus } from "../types";
import { isAllocationLinkable } from "../constants";

describe("isAllocationLinkable", () => {
  it("allows active factory-allocation orders (Factory Order, Locate)", () => {
    expect(isAllocationLinkable(OrderStatus.FactoryOrder)).toBe(true);
    expect(isAllocationLinkable(OrderStatus.Locate)).toBe(true);
  });

  it("excludes Dealer Exchange (DX cars come from a dealer trade, not allocation)", () => {
    expect(isAllocationLinkable(OrderStatus.DealerExchange)).toBe(false);
  });

  it("excludes secured statuses", () => {
    expect(isAllocationLinkable(OrderStatus.Received)).toBe(false);
    expect(isAllocationLinkable(OrderStatus.Delivered)).toBe(false);
    expect(isAllocationLinkable(OrderStatus.Secured)).toBe(false);
  });
});
