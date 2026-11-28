import { describe, it, expect } from "vitest";
import { carStatusOf, daysSinceOrder, hasUnconfirmedLink, summarizeCarStatus } from "../carStatus";
import { OrderStatus, type Order } from "../../../types";

const NOW = new Date(2026, 10, 28, 12, 0, 0); // Nov 28 2026, local
const order = (over: Partial<Order>): Order =>
  ({ id: "x", status: OrderStatus.FactoryOrder, date: "2026-11-20", ...over }) as Order;

describe("carStatusOf", () => {
  it("linked allocated car = got", () => {
    expect(carStatusOf(order({ allocatedVehicleId: "v1" }))).toBe("got");
    expect(carStatusOf(order({ allocatedVehicleId: "v1" }), new Set(["v1"]))).toBe("got");
  });
  it("a link the board does not confirm is not counted as got", () => {
    const stale = order({ allocatedVehicleId: "gone" });
    expect(carStatusOf(stale, new Set(["v1"]))).toBe("waiting");
    expect(hasUnconfirmedLink(stale, new Set(["v1"]))).toBe(true);
    // Unknown link set (loading/error): trust the order, flag nothing.
    expect(carStatusOf(stale, null)).toBe("got");
    expect(hasUnconfirmedLink(stale, null)).toBe(false);
  });
  it("Dealer Exchange status = exchange, even with no exchange details recorded", () => {
    expect(carStatusOf(order({ status: OrderStatus.DealerExchange }))).toBe("exchange");
    expect(carStatusOf(order({ status: OrderStatus.DealerExchange, dxDealerName: "BAYSIDE" }))).toBe("exchange");
  });
  it("an orphan link on a Dealer Exchange order falls back to exchange", () => {
    expect(carStatusOf(order({ status: OrderStatus.DealerExchange, allocatedVehicleId: "gone" }), new Set())).toBe("exchange");
  });
  it("nothing yet = waiting", () => {
    expect(carStatusOf(order({}))).toBe("waiting");
    expect(carStatusOf(order({ status: OrderStatus.Locate }))).toBe("waiting");
  });
  it("secured statuses are secured even when a car was linked", () => {
    expect(carStatusOf(order({ status: OrderStatus.Secured, allocatedVehicleId: "v1" }))).toBe("secured");
    expect(hasUnconfirmedLink(order({ status: OrderStatus.Delivered, allocatedVehicleId: "gone" }), new Set())).toBe(false);
  });
});

describe("daysSinceOrder", () => {
  it("counts whole local days and rejects bad or future dates", () => {
    expect(daysSinceOrder("2026-11-28", NOW)).toBe(0);
    expect(daysSinceOrder("2026-10-29", NOW)).toBe(30);
    expect(daysSinceOrder("2026-12-01", NOW)).toBeNull();
    expect(daysSinceOrder("11/20/2026", NOW)).toBeNull();
    expect(daysSinceOrder(undefined, NOW)).toBeNull();
  });
});

describe("summarizeCarStatus", () => {
  it("splits active orders into got / exchange / waiting and counts long waits", () => {
    const s = summarizeCarStatus(
      [
        order({ allocatedVehicleId: "v1" }),
        order({ allocatedVehicleId: "stale", date: "2026-09-01" }), // orphan link: waiting, long
        order({ status: OrderStatus.DealerExchange }),
        order({ date: "2026-11-25" }),
        order({ date: "2026-10-29" }), // exactly 30 days: long wait
        order({ status: OrderStatus.DealerExchange, date: "2026-09-01" }), // exchange, not a long wait
        order({ status: OrderStatus.Delivered, date: "2026-09-01" }), // secured: excluded
      ],
      new Set(["v1"]),
      NOW,
    );
    expect(s).toEqual({ active: 6, got: 1, exchange: 2, waiting: 3, waitingLong: 2 });
    expect(s.got + s.exchange + s.waiting).toBe(s.active);
  });
});
