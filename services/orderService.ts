import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { Order } from "../types";
import { isActiveStatus } from "../constants";

/**
 * Subscribe to all active orders (Factory Order, Dealer Exchange).
 * Returns an unsubscribe function.
 */
export function subscribeActiveOrders(
  callback: (orders: Order[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const ordersQuery = query(
    collection(db, "orders"),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      const orders = snapshot.docs
        .map((doc) => ({ ...doc.data(), id: doc.id }) as Order)
        .filter((order) => isActiveStatus(order.status));
      callback(orders);
    },
    (error) => {
      console.error("Failed to subscribe to orders:", error);
      onError?.(error);
    },
  );
}
