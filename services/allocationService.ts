import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  AllocationSnapshot,
  AllocationVehicle,
  PublishAllocationPayload,
} from "../src/utils/allocationTypes";

const ALLOCATION_SNAPSHOTS_COLLECTION = "allocationSnapshots";

function mapSnapshot(docId: string, data: Record<string, unknown>): AllocationSnapshot {
  const vehiclesRaw = (data.vehicles as AllocationSnapshot["vehicles"]) ?? [];
  const vehicles: AllocationVehicle[] = vehiclesRaw.map((vehicle) => ({
    ...vehicle,
    interiorColor: vehicle.interiorColor ?? "TBD",
    bos: vehicle.bos ?? "TBD",
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
  const currentLatestQuery = query(snapshotsRef, where("isLatest", "==", true));
  const currentLatest = await getDocs(currentLatestQuery);

  const batch = writeBatch(db);

  currentLatest.docs.forEach((snapshotDoc) => {
    batch.update(doc(db, ALLOCATION_SNAPSHOTS_COLLECTION, snapshotDoc.id), {
      isLatest: false,
    });
  });

  const newSnapshotRef = doc(snapshotsRef);
  batch.set(newSnapshotRef, {
    reportDate: payload.reportDate,
    publishedAt: serverTimestamp(),
    publishedByUid,
    publishedByEmail,
    itemCount: payload.itemCount,
    summary: payload.summary,
    vehicles: payload.vehicles,
    isLatest: true,
  });

  await batch.commit();
}
