import type { Order } from "../../types";
import { OrderStatus } from "../../types";
import { isSecuredStatus } from "../../constants";

/**
 * "Did we get the car?" — the one question the manager Dashboard answers first
 * (Rob, 2026-11-27/28). Each active order is in exactly one state:
 *  - got:      a specific allocated car is linked to the order AND the board's
 *              vehicle_links set confirms that link (when that set is known)
 *  - exchange: the car is being sourced by dealer exchange (status Dealer
 *              Exchange, or exchange details recorded on the order)
 *  - waiting:  neither yet
 * Secured/delivered orders are "secured" and are not counted as open.
 *
 * `confirmedLinkIds` is the vehicle_links-backed set the Allocation Board uses.
 * Pass it only once links have loaded without error; when omitted, the order's
 * own allocatedVehicleId is trusted (stale/orphan links cannot be detected).
 */
export type CarStatus = "got" | "exchange" | "waiting" | "secured";

export const LONG_WAIT_DAYS = 30;

type CarStatusFields = Pick<Order, "status" | "allocatedVehicleId" | "dxDealerName" | "dxExpectedArrival">;

export function carStatusOf(order: CarStatusFields, confirmedLinkIds?: ReadonlySet<string> | null): CarStatus {
  if (isSecuredStatus(order.status)) return "secured";
  if (order.allocatedVehicleId && (!confirmedLinkIds || confirmedLinkIds.has(order.allocatedVehicleId))) return "got";
  if (order.status === OrderStatus.DealerExchange || order.dxDealerName || order.dxExpectedArrival) return "exchange";
  return "waiting";
}

/** True when the order names a linked car that the board does not recognize (stale/orphan link). */
export function hasUnconfirmedLink(order: CarStatusFields, confirmedLinkIds?: ReadonlySet<string> | null): boolean {
  return Boolean(
    !isSecuredStatus(order.status) &&
      order.allocatedVehicleId &&
      confirmedLinkIds &&
      !confirmedLinkIds.has(order.allocatedVehicleId),
  );
}

/** Whole days since an order date stored as YYYY-MM-DD (local). Null when unparseable or in the future. */
export function daysSinceOrder(date: string | undefined, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  if (!m) return null;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

export function isLongWait(order: Pick<Order, "date">, now: Date = new Date()): boolean {
  const days = daysSinceOrder(order.date, now);
  return days !== null && days >= LONG_WAIT_DAYS;
}

export interface CarStatusSummary {
  active: number;
  got: number;
  exchange: number;
  waiting: number;
  /** Waiting (no confirmed car, no exchange) for LONG_WAIT_DAYS or more. Subset of `waiting`. */
  waitingLong: number;
}

export function summarizeCarStatus(
  orders: Order[],
  confirmedLinkIds?: ReadonlySet<string> | null,
  now: Date = new Date(),
): CarStatusSummary {
  const s: CarStatusSummary = { active: 0, got: 0, exchange: 0, waiting: 0, waitingLong: 0 };
  for (const order of orders) {
    const status = carStatusOf(order, confirmedLinkIds);
    if (status === "secured") continue;
    s.active++;
    s[status]++;
    if (status === "waiting" && isLongWait(order, now)) s.waitingLong++;
  }
  return s;
}
