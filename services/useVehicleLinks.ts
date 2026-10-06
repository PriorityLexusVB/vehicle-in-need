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
 */

import { useMemo, useSyncExternalStore } from "react";
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

const emptyLinks = new Map<string, VehicleLinkDoc>();
const pendingState: UseVehicleLinksResult = {
  linksByVehicleId: emptyLinks, loading: true, error: null,
};
const disabledState: UseVehicleLinksResult = {
  linksByVehicleId: emptyLinks, loading: false, error: null,
};

function createVehicleLinksStore(enabled: boolean) {
  let state = enabled ? pendingState : disabledState;
  const listeners = new Set<() => void>();
  let stop: (() => void) | undefined;

  const publish = (next: UseVehicleLinksResult) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (enabled && listeners.size === 1) {
      // A new listener must never reuse claims from a previous auth session.
      publish(pendingState);
      let active = true;
      const unsubscribe = onSnapshot(
        collection(db, VEHICLE_LINKS_COLLECTION),
        { includeMetadataChanges: true },
        (snap: QuerySnapshot<DocumentData>) => {
          if (!active) return;
          const map = new Map<string, VehicleLinkDoc>();
          for (const docSnap of snap.docs) {
            map.set(docSnap.id, docSnap.data() as VehicleLinkDoc);
          }
          // Cache-backed claims may be shown elsewhere, but cannot certify the
          // manager's unassigned count until this listener hears the server.
          publish({
            linksByVehicleId: map,
            loading: snap.metadata.fromCache,
            error: null,
          });
        },
        (err) => {
          if (!active) return;
          console.error("[useVehicleLinks] Subscription error:", err);
          publish({ linksByVehicleId: state.linksByVehicleId, loading: false, error: err });
        },
      );
      stop = () => {
        active = false;
        unsubscribe();
      };
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stop?.();
        stop = undefined;
        state = enabled ? pendingState : disabledState;
      }
    };
  };

  return { subscribe, getSnapshot: () => state };
}

/**
 * Subscribe to all vehicle_links documents.
 * Returns a stable Map reference that updates reactively.
 * Unsubscribes automatically when the component unmounts.
 */
export function useVehicleLinks(enabled = true): UseVehicleLinksResult {
  const store = useMemo(() => createVehicleLinksStore(enabled), [enabled]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
