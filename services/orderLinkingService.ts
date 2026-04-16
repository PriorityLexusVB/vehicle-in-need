/**
 * Order-to-Vehicle Linking Service
 *
 * Persists the association between a customer pre-order and an allocation vehicle.
 * Manager-only action enforced by Firestore rules.
 *
 * Uses Firestore transactions to prevent race conditions.
 *
 * Uniqueness gate: vehicle_links/{vehicleId}
 *   One document per vehicle. Writing it inside the same transaction as the
 *   order update means two concurrent managers racing to link the same vehicle
 *   to different orders will each read the vehicle_links doc, and only the first
 *   writer's transaction will commit — the second will retry and then throw.
 */

import {
  doc,
  runTransaction,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { db } from "./firebase";

const ORDERS_COLLECTION = "orders";
const VEHICLE_LINKS_COLLECTION = "vehicle_links";

/**
 * Typed shape of a vehicle_links/{vehicleId} document.
 * Written atomically alongside the order update.
 */
export interface VehicleLinkDoc {
  orderId: string;       // references orders/{id}
  linkedAt: unknown;     // FieldValue.serverTimestamp() at write time; Timestamp when read
  linkedByUid: string;   // manager UID who created the link
}

/**
 * Link an allocation vehicle to a customer order.
 *
 * Transaction steps (all atomic):
 *  1. Read vehicle_links/{vehicleId} — fail if already linked to a DIFFERENT order
 *  2. Read orders/{orderId} — fail if missing or linked to a DIFFERENT vehicle
 *  3. Write vehicle_links/{vehicleId} with { orderId, linkedAt, linkedByUid }
 *  4. Update orders/{orderId} with link fields
 *
 * Re-linking the same order↔vehicle pair is a no-op that succeeds (idempotent).
 *
 * @param orderId     - Firestore document ID of the order
 * @param vehicleId   - Unique identifier for the allocation vehicle (e.g. "RX350-6X4-001")
 * @param vehicleInfo - Human-readable summary (e.g. "RX 350 - Eminent White Pearl - May 2026")
 * @param managerUid  - UID of the manager performing the action
 */
export async function linkVehicleToOrder(
  orderId: string,
  vehicleId: string,
  vehicleInfo: string,
  managerUid: string,
): Promise<void> {
  const vehicleLinkRef = doc(db, VEHICLE_LINKS_COLLECTION, vehicleId);
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);

  await runTransaction(db, async (transaction) => {
    // Step 1: Vehicle uniqueness gate
    const vehicleLinkSnap = await transaction.get(vehicleLinkRef);
    if (vehicleLinkSnap.exists()) {
      const existing = vehicleLinkSnap.data() as VehicleLinkDoc;
      if (existing.orderId !== orderId) {
        console.error(
          `[orderLinkingService] linkVehicleToOrder blocked: vehicle ${vehicleId} ` +
          `already linked to order ${existing.orderId}, cannot link to ${orderId}`,
        );
        throw new Error("Vehicle already linked to another order");
      }
      // Same order↔vehicle pair — fall through and refresh the doc below
    }

    // Step 2: Order existence + different-vehicle guard (preserves existing semantics)
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error("Order not found");
    }

    const currentData = orderSnap.data();
    if (
      currentData.allocatedVehicleId &&
      currentData.allocatedVehicleId !== vehicleId
    ) {
      console.error(
        `[orderLinkingService] linkVehicleToOrder blocked: order ${orderId} ` +
        `already linked to vehicle ${currentData.allocatedVehicleId}, cannot link to ${vehicleId}`,
      );
      throw new Error(
        `Order already linked to vehicle: ${currentData.allocatedVehicleInfo || currentData.allocatedVehicleId}`,
      );
    }

    // Step 3: Write vehicle_links doc (set, not update — handles both create and refresh)
    transaction.set(vehicleLinkRef, {
      orderId,
      linkedAt: serverTimestamp(),
      linkedByUid: managerUid,
    } satisfies Omit<VehicleLinkDoc, "linkedAt"> & { linkedAt: unknown });

    // Step 4: Update the order
    transaction.update(orderRef, {
      allocatedVehicleId: vehicleId,
      allocatedVehicleInfo: vehicleInfo,
      linkedAt: serverTimestamp(),
      linkedByUid: managerUid,
    });
  });

  console.info(
    `[orderLinkingService] Linked vehicle ${vehicleId} to order ${orderId} by ${managerUid}`,
  );
}

/**
 * Remove the vehicle link from an order.
 *
 * Transaction steps (all atomic):
 *  1. Read orders/{orderId} to get allocatedVehicleId
 *  2. Null the order's link fields
 *  3. Delete vehicle_links/{allocatedVehicleId} if it exists AND its orderId matches
 *     (guards against deleting a link that was re-assigned to a different order
 *      between a UI read and this transaction)
 *
 * Manager-only action.
 */
export async function unlinkVehicleFromOrder(orderId: string): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);

  await runTransaction(db, async (transaction) => {
    // Step 1: Read the order to learn which vehicle is linked
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error("Order not found");
    }

    const currentData = orderSnap.data();
    const vehicleId: string | undefined = currentData.allocatedVehicleId;

    // Step 2: Null the order's link fields
    transaction.update(orderRef, {
      allocatedVehicleId: deleteField(),
      allocatedVehicleInfo: deleteField(),
      linkedAt: deleteField(),
      linkedByUid: deleteField(),
    });

    // Step 3: Clean up vehicle_links doc only if it still points to this order
    if (vehicleId) {
      const vehicleLinkRef = doc(db, VEHICLE_LINKS_COLLECTION, vehicleId);
      const vehicleLinkSnap = await transaction.get(vehicleLinkRef);
      if (vehicleLinkSnap.exists()) {
        const linkData = vehicleLinkSnap.data() as VehicleLinkDoc;
        if (linkData.orderId === orderId) {
          transaction.delete(vehicleLinkRef);
        } else {
          console.warn(
            `[orderLinkingService] unlinkVehicleFromOrder: vehicle_links/${vehicleId} ` +
            `points to order ${linkData.orderId}, not ${orderId} — skipping delete`,
          );
        }
      }
    }
  });

  console.info(
    `[orderLinkingService] Unlinked order ${orderId}`,
  );
}
