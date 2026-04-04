import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { Order, OrderStatus } from "../types";
import { isActiveStatus } from "../constants";

const ACTIVE_STATUSES = [
  OrderStatus.FactoryOrder,
  OrderStatus.DealerExchange,
  OrderStatus.Locate,
];

/**
 * Subscribe to all orders with an active status as defined by `isActiveStatus()`.
 *
 * Tries server-side filtering first (requires composite index: status + createdAt).
 * If the index isn't deployed yet, automatically falls back to client-side filtering.
 * Once the index is live, the optimized query kicks in with no code change needed.
 */
export function subscribeActiveOrders(
  callback: (orders: Order[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const ordersRef = collection(db, "orders");

  // Optimized query — requires composite index (status + createdAt desc)
  const optimizedQuery = query(
    ordersRef,
    where("status", "in", ACTIVE_STATUSES),
    orderBy("createdAt", "desc"),
  );

  // Fallback query — no index required, filters client-side
  const fallbackQuery = query(ordersRef, orderBy("createdAt", "desc"));

  let usingFallback = false;
  let unsubscribe: (() => void) | null = null;

  function handleSnapshot(snapshot: import("firebase/firestore").QuerySnapshot) {
    const orders = snapshot.docs.map(
      (doc) => ({ ...doc.data(), id: doc.id }) as Order,
    );
    callback(usingFallback ? orders.filter((o) => isActiveStatus(o.status)) : orders);
  }

  // Try the optimized query first
  unsubscribe = onSnapshot(
    optimizedQuery,
    handleSnapshot,
    (error) => {
      // Index not ready — fall back to client-side filtering
      if (error.code === "failed-precondition" || error.message?.includes("index")) {
        console.warn("Active orders index not deployed yet, using client-side filtering.");
        usingFallback = true;
        unsubscribe = onSnapshot(fallbackQuery, handleSnapshot, (fallbackError) => {
          console.error("Failed to subscribe to orders:", fallbackError);
          onError?.(fallbackError);
        });
        return;
      }
      console.error("Failed to subscribe to orders:", error);
      onError?.(error);
    },
  );

  return () => unsubscribe?.();
}
