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
  DocumentData,
  DocumentReference,
  doc,
  runTransaction,
  serverTimestamp,
  deleteField,
  Transaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { OrderStatus } from "../types";

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

async function readOrderLinkState(
  transaction: Transaction,
  orderRef: DocumentReference<DocumentData>,
) {
  const orderSnap = await transaction.get(orderRef);
  if (!orderSnap.exists()) {
    throw new Error("Order not found");
  }

  const currentData = orderSnap.data();
  const vehicleId: string | undefined = currentData.allocatedVehicleId;
  const allocatedVehicleInfo: string | undefined = currentData.allocatedVehicleInfo;
  const vehicleLinkRef = vehicleId ? doc(db, VEHICLE_LINKS_COLLECTION, vehicleId) : null;
  const vehicleLinkSnap = vehicleLinkRef ? await transaction.get(vehicleLinkRef) : null;

  return { vehicleId, allocatedVehicleInfo, vehicleLinkRef, vehicleLinkSnap };
}

function deleteMatchingVehicleLink(
  transaction: Transaction,
  vehicleId: string | undefined,
  vehicleLinkRef: DocumentReference<DocumentData> | null,
  vehicleLinkSnap: Awaited<ReturnType<Transaction["get"]>> | null,
  orderId: string,
) {
  if (!vehicleLinkRef || !vehicleLinkSnap?.exists()) {
    return;
  }

  const linkData = vehicleLinkSnap.data() as VehicleLinkDoc;
  if (linkData.orderId === orderId) {
    transaction.delete(vehicleLinkRef);
    return;
  }

  console.warn(
    `[orderLinkingService] release link skipped: vehicle_links/${vehicleId} ` +
    `points to order ${linkData.orderId}, not ${orderId}`,
  );
}

function clearedVehicleLinkFields() {
  return {
    allocatedVehicleId: deleteField(),
    allocatedVehicleInfo: deleteField(),
    linkedAt: deleteField(),
    linkedByUid: deleteField(),
  };
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
    const { vehicleId, vehicleLinkRef, vehicleLinkSnap } =
      await readOrderLinkState(transaction, orderRef);

    // Step 2: Null the order's link fields
    transaction.update(orderRef, clearedVehicleLinkFields());

    // Step 3: Clean up vehicle_links doc only if it still points to this order
    deleteMatchingVehicleLink(transaction, vehicleId, vehicleLinkRef, vehicleLinkSnap, orderId);
  });

  console.info(
    `[orderLinkingService] Unlinked order ${orderId}`,
  );
}

/**
 * Atomically release any linked allocation vehicle and update the order status.
 *
 * Use this when moving an order to a secured/closed status so the vehicle is
 * released only if the status update commits too.
 */
export async function releaseVehicleAndUpdateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);

  await runTransaction(db, async (transaction) => {
    const { vehicleId, allocatedVehicleInfo, vehicleLinkRef, vehicleLinkSnap } =
      await readOrderLinkState(transaction, orderRef);

    transaction.update(orderRef, {
      status,
      ...clearedVehicleLinkFields(),
      // Preserve which car fulfilled the deal (history) even though the live
      // allocation slot is freed. Always set-or-clear so re-securing an order
      // reflects its CURRENT linked car (or none) — never stale history.
      securedVehicleInfo: allocatedVehicleInfo ?? deleteField(),
    });
    deleteMatchingVehicleLink(transaction, vehicleId, vehicleLinkRef, vehicleLinkSnap, orderId);
  });

  console.info(
    `[orderLinkingService] Released vehicle link and updated order ${orderId} to ${status}`,
  );
}

/**
 * Atomically release any linked allocation vehicle and delete the order.
 */
export async function deleteOrderAndReleaseVehicle(orderId: string): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);

  await runTransaction(db, async (transaction) => {
    const { vehicleId, vehicleLinkRef, vehicleLinkSnap } =
      await readOrderLinkState(transaction, orderRef);

    deleteMatchingVehicleLink(transaction, vehicleId, vehicleLinkRef, vehicleLinkSnap, orderId);
    transaction.delete(orderRef);
  });

  console.info(
    `[orderLinkingService] Deleted order ${orderId} and released vehicle link`,
  );
}
