/**
 * useVehicleLinks — React hook
 *
 * Subscribes to the vehicle_links collection and exposes a reverse-lookup
 * Map from vehicleId → VehicleLinkDoc so callers can instantly determine
 * whether any given vehicle is already linked, without re-scanning all orders.
 *
 * This is a read-path optimization. The source of truth for link state is
 * still the orders collection; orderLinkingService.ts keeps both in sync.
 *
 * Usage:
 *   const { linksByVehicleId, loading } = useVehicleLinks();
 *   const link = linksByVehicleId.get(vehicleId); // undefined if not linked
 *
 * TODO: Wire AllocationBoard to use this for O(1) linked-vehicle lookups
 *   instead of the current scan over orderMatchesByVehicle. Deferred because
 *   it would require targeted surgery on AllocationBoard's linkedVehicleIds
 *   and linkedSummary memos. Safe to add incrementally.
 */

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import { VehicleLinkDoc } from "./orderLinkingService";

const VEHICLE_LINKS_COLLECTION = "vehicle_links";

export interface UseVehicleLinksResult {
  /** vehicleId → VehicleLinkDoc for all currently linked vehicles */
  linksByVehicleId: Map<string, VehicleLinkDoc>;
  /** True until the first snapshot is received */
  loading: boolean;
  /** Non-null if the subscription encountered an error */
  error: Error | null;
}

/**
 * Subscribe to all vehicle_links documents.
 * Returns a stable Map reference that updates reactively.
 * Unsubscribes automatically when the component unmounts.
 */
export function useVehicleLinks(): UseVehicleLinksResult {
  const [linksByVehicleId, setLinksByVehicleId] = useState<Map<string, VehicleLinkDoc>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ref = collection(db, VEHICLE_LINKS_COLLECTION);

    const unsubscribe = onSnapshot(
      ref,
      (snap: QuerySnapshot<DocumentData>) => {
        const map = new Map<string, VehicleLinkDoc>();
        for (const docSnap of snap.docs) {
          map.set(docSnap.id, docSnap.data() as VehicleLinkDoc);
        }
        setLinksByVehicleId(map);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[useVehicleLinks] Subscription error:", err);
        setError(err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []); // no deps — collection path is static

  return { linksByVehicleId, loading, error };
}
