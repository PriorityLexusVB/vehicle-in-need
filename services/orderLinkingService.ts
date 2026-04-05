/**
 * Order-to-Vehicle Linking Service
 *
 * Persists the association between a customer pre-order and an allocation vehicle.
 * Manager-only action enforced by Firestore rules.
 *
 * Uses Firestore transactions to prevent race conditions
 * (two managers linking the same vehicle simultaneously).
 */

import {
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const ORDERS_COLLECTION = "orders";

/**
 * Link an allocation vehicle to a customer order.
 * Stores the vehicle ID and a human-readable summary on the order.
 *
 * @param orderId - Firestore document ID of the order
 * @param vehicleId - Unique identifier for the allocation vehicle (e.g. "RX350-6X4-001")
 * @param vehicleInfo - Human-readable summary (e.g. "RX 350 - Eminent White Pearl - May 2026")
 * @param managerUid - UID of the manager performing the action
 */
export async function linkVehicleToOrder(
  orderId: string,
  vehicleId: string,
  vehicleInfo: string,
  managerUid: string,
): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);

  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error("Order not found");
    }

    const currentData = orderSnap.data();

    // Check if this order already has a different vehicle linked
    if (currentData.allocatedVehicleId && currentData.allocatedVehicleId !== vehicleId) {
      throw new Error(
        `Order already linked to vehicle: ${currentData.allocatedVehicleInfo || currentData.allocatedVehicleId}`,
      );
    }

    transaction.update(orderRef, {
      allocatedVehicleId: vehicleId,
      allocatedVehicleInfo: vehicleInfo,
      linkedAt: serverTimestamp(),
      linkedByUid: managerUid,
    });
  });
}

/**
 * Remove the vehicle link from an order.
 * Manager-only action.
 */
export async function unlinkVehicleFromOrder(orderId: string): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);

  await updateDoc(orderRef, {
    allocatedVehicleId: null,
    allocatedVehicleInfo: null,
    linkedAt: null,
    linkedByUid: null,
  });
}

/**
 * Build a human-readable vehicle summary string for display.
 */
export function buildVehicleInfo(vehicle: {
  model?: string;
  code?: string;
  color?: string;
  interiorColor?: string;
  arrival?: string;
  grade?: string;
}): string {
  const parts = [
    vehicle.model || vehicle.code || "Unknown",
    vehicle.color,
    vehicle.grade,
    vehicle.arrival ? `Arriving ${vehicle.arrival}` : null,
  ].filter(Boolean);
  return parts.join(" — ");
}
