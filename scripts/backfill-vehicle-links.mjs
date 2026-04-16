#!/usr/bin/env node
/**
 * Backfill: vehicle_links collection
 *
 * Creates vehicle_links/{vehicleId} documents for any order that has
 * an allocatedVehicleId but no corresponding vehicle_links document yet.
 *
 * Safe to run multiple times — idempotent. Existing vehicle_links docs
 * are never overwritten.
 *
 * Prerequisites:
 *   - Node >= 20
 *   - firebase-admin installed (it's a devDependency in the repo)
 *   - Application Default Credentials configured, OR GOOGLE_APPLICATION_CREDENTIALS
 *     set to a service account key file with Firestore read+write access
 *
 * Run with dry-run first (default), then --apply to write:
 *
 *   node scripts/backfill-vehicle-links.mjs --project vehicles-in-need
 *   node scripts/backfill-vehicle-links.mjs --project vehicles-in-need --apply
 *
 * Options:
 *   --project <projectId>   Firebase project ID (required)
 *   --apply                 Actually write to Firestore (omit for dry-run)
 *
 * What it does:
 *   1. Queries all orders where allocatedVehicleId is not null/missing
 *   2. For each, checks if vehicle_links/{allocatedVehicleId} already exists
 *   3. If not, creates it using the order's linkedAt, linkedByUid, and orderId
 *   4. Reports counts at the end
 *
 * Conflict handling:
 *   If vehicle_links/{vehicleId} already points to a DIFFERENT orderId, the
 *   script logs a warning and skips — it does not overwrite. Resolve conflicts
 *   manually via the UI before running with --apply.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    project: { type: 'string' },
    apply:   { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (!args.project) {
  console.error('Usage: node scripts/backfill-vehicle-links.mjs --project <projectId> [--apply]');
  process.exit(1);
}

const DRY_RUN = !args.apply;

console.log(`\nBackfill: vehicle_links`);
console.log(`  Project : ${args.project}`);
console.log(`  Mode    : ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY (writing to Firestore)'}\n`);

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: args.project,
  });
}

const db = getFirestore();

// ---------------------------------------------------------------------------
// Backfill logic
// ---------------------------------------------------------------------------

async function run() {
  const ordersRef = db.collection('orders');
  const vehicleLinksRef = db.collection('vehicle_links');

  // Query orders that have an allocatedVehicleId field set to a non-null value
  const snap = await ordersRef
    .where('allocatedVehicleId', '!=', null)
    .get();

  console.log(`Found ${snap.size} order(s) with allocatedVehicleId set.\n`);

  let created = 0;
  let skippedAlreadyExists = 0;
  let skippedConflict = 0;
  let skippedMissingData = 0;

  for (const orderDoc of snap.docs) {
    const data = orderDoc.data();
    const vehicleId   = data.allocatedVehicleId;
    const orderId     = orderDoc.id;
    const linkedAt    = data.linkedAt    ?? null; // may be absent on very old records
    const linkedByUid = data.linkedByUid ?? null;

    if (!vehicleId) {
      // Shouldn't happen given the query, but guard anyway
      skippedMissingData++;
      continue;
    }

    const linkRef  = vehicleLinksRef.doc(vehicleId);
    const linkSnap = await linkRef.get();

    if (linkSnap.exists) {
      const existing = linkSnap.data();
      if (existing.orderId === orderId) {
        // Already correct — nothing to do
        console.log(`  SKIP   vehicle_links/${vehicleId} — already points to order ${orderId}`);
        skippedAlreadyExists++;
      } else {
        // Conflict: the vehicle_links doc points to a different order
        console.warn(
          `  CONFLICT vehicle_links/${vehicleId} — doc points to ${existing.orderId}, ` +
          `but order ${orderId} also claims this vehicle. Skipping — resolve manually.`,
        );
        skippedConflict++;
      }
      continue;
    }

    // vehicle_links doc does not exist — create it
    const docData = {
      orderId,
      linkedByUid: linkedByUid ?? 'backfill-unknown',
      // Prefer the order's recorded linkedAt; fall back to server timestamp
      linkedAt: linkedAt ?? FieldValue.serverTimestamp(),
    };

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would create vehicle_links/${vehicleId}:`, JSON.stringify({
        orderId,
        linkedByUid: docData.linkedByUid,
        linkedAt: linkedAt ? linkedAt.toDate?.().toISOString() ?? linkedAt : '<serverTimestamp>',
      }));
    } else {
      await linkRef.set(docData);
      console.log(`  CREATED  vehicle_links/${vehicleId} → order ${orderId}`);
    }
    created++;
  }

  console.log('\n--- Summary ---');
  console.log(`  To create  : ${created}${DRY_RUN ? ' (dry-run, not written)' : ''}`);
  console.log(`  Already OK : ${skippedAlreadyExists}`);
  console.log(`  Conflicts  : ${skippedConflict} (resolve manually)`);
  console.log(`  Bad data   : ${skippedMissingData}`);

  if (DRY_RUN && created > 0) {
    console.log('\nRe-run with --apply to write these documents.');
  }
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
