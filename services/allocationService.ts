import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  AllocationSnapshot,
  AllocationVehicle,
  PublishAllocationPayload,
} from "../src/utils/allocationTypes";

const ALLOCATION_SNAPSHOTS_COLLECTION = "allocationSnapshots";

function normalizeBosValue(value: unknown): "Y" | "N" {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "Y" ? "Y" : "N";
}

function mapSnapshot(docId: string, data: Record<string, unknown>): AllocationSnapshot {
  const vehiclesRaw = (data.vehicles as AllocationSnapshot["vehicles"]) ?? [];
  const vehicles: AllocationVehicle[] = vehiclesRaw.map((vehicle) => ({
    ...vehicle,
    interiorColor: vehicle.interiorColor ?? "TBD",
    bos: normalizeBosValue(vehicle.bos),
  }));

  return {
    id: docId,
    reportDate: (data.reportDate as string | null) ?? null,
    publishedAt: data.publishedAt as AllocationSnapshot["publishedAt"],
    publishedByUid: (data.publishedByUid as string) ?? "",
    publishedByEmail: (data.publishedByEmail as string) ?? "",
    itemCount: Number(data.itemCount ?? 0),
    summary: (data.summary as AllocationSnapshot["summary"]) ?? {
      units: 0,
      value: 0,
      hybridMix: 0,
    },
    vehicles,
    isLatest: Boolean(data.isLatest),
  };
}

export function subscribeLatestAllocationSnapshot(
  callback: (snapshot: AllocationSnapshot | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const latestQuery = query(
    collection(db, ALLOCATION_SNAPSHOTS_COLLECTION),
    where("isLatest", "==", true),
    orderBy("publishedAt", "desc"),
    limit(1),
  );

  return onSnapshot(
    latestQuery,
    (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }

      const docSnapshot = snapshot.docs[0];
      callback(mapSnapshot(docSnapshot.id, docSnapshot.data() as Record<string, unknown>));
    },
    (error) => {
      console.error("Failed to subscribe to allocation snapshot:", error);
      onError?.(error);
    },
  );
}

export async function publishAllocationSnapshot(
  payload: PublishAllocationPayload,
  publishedByUid: string,
  publishedByEmail: string,
): Promise<void> {
  const snapshotsRef = collection(db, ALLOCATION_SNAPSHOTS_COLLECTION);

  await runTransaction(db, async (transaction) => {
    // Read current latest snapshots inside the transaction for atomicity
    const currentLatestQuery = query(snapshotsRef, where("isLatest", "==", true));
    const currentLatest = await getDocs(currentLatestQuery);

    // Mark all existing "latest" snapshots as not-latest
    currentLatest.docs.forEach((snapshotDoc) => {
      transaction.update(doc(db, ALLOCATION_SNAPSHOTS_COLLECTION, snapshotDoc.id), {
        isLatest: false,
      });
    });

    const normalizedVehicles = payload.vehicles.map((vehicle) => ({
      ...vehicle,
      bos: normalizeBosValue(vehicle.bos),
    }));

    // Create the new snapshot as latest
    const newSnapshotRef = doc(snapshotsRef);
    transaction.set(newSnapshotRef, {
      reportDate: payload.reportDate,
      publishedAt: serverTimestamp(),
      publishedByUid,
      publishedByEmail,
      itemCount: payload.itemCount,
      summary: payload.summary,
      vehicles: normalizedVehicles,
      isLatest: true,
      // TTL: auto-delete after 90 days (Firestore TTL policy on this field)
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });
  });
}
