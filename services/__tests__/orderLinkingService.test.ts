import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  deleteField: vi.fn(() => "__deleteField__"),
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({
    path: `${collection}/${id}`,
  })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "__serverTimestamp__"),
}));

vi.mock("firebase/firestore", () => firestoreMocks);
vi.mock("../firebase", () => ({ db: {} }));

import {
  deleteOrderAndReleaseVehicle,
  linkVehicleToOrder,
  releaseVehicleAndUpdateOrderStatus,
  unlinkVehicleFromOrder,
} from "../orderLinkingService";
import { OrderStatus } from "../../types";

function snapshot(data: Record<string, unknown>, exists = true) {
  return {
    exists: () => exists,
    data: () => data,
  };
}

describe("orderLinkingService", () => {
  beforeEach(() => {
    firestoreMocks.deleteField.mockClear();
    firestoreMocks.doc.mockClear();
    firestoreMocks.runTransaction.mockReset();
    firestoreMocks.serverTimestamp.mockClear();
  });

  it("unlinks with all transaction reads before writes", async () => {
    const operations: string[] = [];

    firestoreMocks.runTransaction.mockImplementation(async (_db: unknown, callback: (transaction: unknown) => Promise<void>) => {
      let wrote = false;
      const transaction = {
        get: vi.fn(async (ref: { path: string }) => {
          operations.push(`get:${ref.path}`);
          expect(wrote).toBe(false);
          if (ref.path === "orders/order-1") {
            return snapshot({ allocatedVehicleId: "vehicle-1" });
          }
          return snapshot({ orderId: "order-1" });
        }),
        update: vi.fn((ref: { path: string }) => {
          wrote = true;
          operations.push(`update:${ref.path}`);
        }),
        delete: vi.fn((ref: { path: string }) => {
          wrote = true;
          operations.push(`delete:${ref.path}`);
        }),
      };

      await callback(transaction);
    });

    await unlinkVehicleFromOrder("order-1");

    expect(operations).toEqual([
      "get:orders/order-1",
      "get:vehicle_links/vehicle-1",
      "update:orders/order-1",
      "delete:vehicle_links/vehicle-1",
    ]);
  });

  it("atomically releases a linked vehicle and updates secured status", async () => {
    const operations: string[] = [];
    const updatePayloads: Record<string, unknown>[] = [];

    firestoreMocks.runTransaction.mockImplementation(async (_db: unknown, callback: (transaction: unknown) => Promise<void>) => {
      let wrote = false;
      const transaction = {
        get: vi.fn(async (ref: { path: string }) => {
          operations.push(`get:${ref.path}`);
          expect(wrote).toBe(false);
          if (ref.path === "orders/order-1") {
            return snapshot({ allocatedVehicleId: "vehicle-1" });
          }
          return snapshot({ orderId: "order-1" });
        }),
        update: vi.fn((ref: { path: string }, payload: Record<string, unknown>) => {
          wrote = true;
          operations.push(`update:${ref.path}`);
          updatePayloads.push(payload);
        }),
        delete: vi.fn((ref: { path: string }) => {
          wrote = true;
          operations.push(`delete:${ref.path}`);
        }),
      };

      await callback(transaction);
    });

    await releaseVehicleAndUpdateOrderStatus("order-1", OrderStatus.Delivered);

    expect(operations).toEqual([
      "get:orders/order-1",
      "get:vehicle_links/vehicle-1",
      "update:orders/order-1",
      "delete:vehicle_links/vehicle-1",
    ]);
    expect(updatePayloads[0]).toMatchObject({
      status: OrderStatus.Delivered,
      allocatedVehicleId: "__deleteField__",
      allocatedVehicleInfo: "__deleteField__",
      linkedAt: "__deleteField__",
      linkedByUid: "__deleteField__",
    });
  });

  it("atomically releases a linked vehicle and deletes the order", async () => {
    const operations: string[] = [];

    firestoreMocks.runTransaction.mockImplementation(async (_db: unknown, callback: (transaction: unknown) => Promise<void>) => {
      let wrote = false;
      const transaction = {
        get: vi.fn(async (ref: { path: string }) => {
          operations.push(`get:${ref.path}`);
          expect(wrote).toBe(false);
          if (ref.path === "orders/order-1") {
            return snapshot({ allocatedVehicleId: "vehicle-1" });
          }
          return snapshot({ orderId: "order-1" });
        }),
        delete: vi.fn((ref: { path: string }) => {
          wrote = true;
          operations.push(`delete:${ref.path}`);
        }),
      };

      await callback(transaction);
    });

    await deleteOrderAndReleaseVehicle("order-1");

    expect(operations).toEqual([
      "get:orders/order-1",
      "get:vehicle_links/vehicle-1",
      "delete:vehicle_links/vehicle-1",
      "delete:orders/order-1",
    ]);
  });

  it("blocks linking a vehicle that already points to another order without writing", async () => {
    const write = vi.fn();

    firestoreMocks.runTransaction.mockImplementation(async (_db: unknown, callback: (transaction: unknown) => Promise<void>) => {
      const transaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === "vehicle_links/vehicle-1") {
            return snapshot({ orderId: "other-order" });
          }
          return snapshot({ allocatedVehicleId: undefined });
        }),
        set: write,
        update: write,
      };

      await callback(transaction);
    });

    await expect(
      linkVehicleToOrder("order-1", "vehicle-1", "RX350", "manager-1"),
    ).rejects.toThrow("Vehicle already linked to another order");

    expect(write).not.toHaveBeenCalled();
  });
});
