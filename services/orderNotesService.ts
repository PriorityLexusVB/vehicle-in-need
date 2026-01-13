import {
  addDoc,
  doc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "./firebase";
import type { OrderNote, OrderNoteRole } from "../types";

export function subscribeToOrderNotes(
  orderId: string,
  onNotes: (notes: OrderNote[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const notesQuery = query(
    collection(db, "orders", orderId, "notes"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  return onSnapshot(
    notesQuery,
    (snapshot) => {
      const notes: OrderNote[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<OrderNote, "id">;
        return {
          ...data,
          id: docSnap.id,
        };
      });
      onNotes(notes);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function addOrderNote(input: {
  orderId: string;
  text: string;
  createdByUid: string;
  createdByName: string;
  createdByRole: OrderNoteRole;
  createdByEmail?: string | null;
}): Promise<string> {
  const { orderId, createdByEmail, ...rest } = input;

  const payload: Record<string, unknown> = {
    ...rest,
    createdAt: serverTimestamp(),
  };

  if (typeof createdByEmail === "string" && createdByEmail.length > 0) {
    payload.createdByEmail = createdByEmail;
  }

  const docRef = await addDoc(
    collection(db, "orders", orderId, "notes"),
    payload
  );

  // Best-effort denormalized preview fields on the parent order document.
  // This avoids attaching a Firestore listener per card just to show a summary line.
  try {
    await updateDoc(doc(db, "orders", orderId), {
      latestNoteText: input.text,
      latestNoteAt: serverTimestamp(),
      latestNoteByUid: input.createdByUid,
      latestNoteByName: input.createdByName,
    });
  } catch (error) {
    // Non-fatal: the note is still created; the preview just won't update.
    console.warn("Failed to update latest note preview fields on order", error);
  }

  return docRef.id;
}
