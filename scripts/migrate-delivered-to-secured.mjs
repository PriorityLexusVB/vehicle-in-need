#!/usr/bin/env node
/**
 * Optional Database Migration Script: Migrate 'Delivered' and 'Received' status to 'Secured'
 * 
 * ⚠️  DRY-RUN ONLY by default - This script will NOT modify the database unless you explicitly
 *     provide the --apply flag.
 * 
 * This script is provided for repository owners who want to migrate legacy status values
 * ('Received', 'Delivered') to the new 'Secured' status in Firestore.
 * 
 * IMPORTANT NOTES:
 * - The UI already handles legacy statuses correctly via normalizeStatusForUI()
 * - Running this migration is OPTIONAL - the app works perfectly without it
 * - This script should only be run by repository owners with proper access
 * - Always test with --dry-run first (default behavior)
 * - Back up your data before running with --apply
 * 
 * Usage:
 *   node scripts/migrate-delivered-to-secured.mjs --project <project-id> [--dry-run|--apply]
 * 
 * Options:
 *   --project <project-id>  Firebase project ID (required)
 *   --dry-run               Preview changes without modifying database (default)
 *   --apply                 Actually apply the migration to the database
 * 
 * Examples:
 *   # Preview what would be migrated (dry-run, default)
 *   node scripts/migrate-delivered-to-secured.mjs --project vehicles-in-need
 * 
 *   # Apply the migration (CAUTION: modifies database)
 *   node scripts/migrate-delivered-to-secured.mjs --project vehicles-in-need --apply
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';

// Status values to migrate
const LEGACY_STATUSES = ['Received', 'Delivered'];
const NEW_STATUS = 'Secured';

// Parse command line arguments
function parseCliArgs() {
  try {
    const { values } = parseArgs({
      options: {
        project: { type: 'string' },
        'dry-run': { type: 'boolean', default: true },
        apply: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
    });
    return values;
  } catch (error) {
    console.error('Error parsing arguments:', error.message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Usage: node scripts/migrate-delivered-to-secured.mjs --project <project-id> [--dry-run|--apply]

Options:
  --project <project-id>  Firebase project ID (required)
  --dry-run               Preview changes without modifying database (default)
  --apply                 Actually apply the migration to the database
  -h, --help              Show this help message

Examples:
  # Preview what would be migrated (dry-run, default)
  node scripts/migrate-delivered-to-secured.mjs --project vehicles-in-need

  # Apply the migration (CAUTION: modifies database)
  node scripts/migrate-delivered-to-secured.mjs --project vehicles-in-need --apply
`);
}

async function main() {
  const args = parseCliArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.project) {
    console.error('Error: --project is required');
    printUsage();
    process.exit(1);
  }

  const isDryRun = !args.apply;
  const projectId = args.project;

  console.log('='.repeat(70));
  console.log('Migration: Delivered/Received -> Secured Status');
  console.log('='.repeat(70));
  console.log(`Project: ${projectId}`);
  console.log(`Mode: ${isDryRun ? '🔍 DRY-RUN (no changes will be made)' : '⚠️  APPLY (database will be modified)'}`);
  console.log('='.repeat(70));
  console.log('');

  if (!isDryRun) {
    console.log('⚠️  WARNING: This will modify the database!');
    console.log('Press Ctrl+C within 5 seconds to cancel...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('');
  }

  // Initialize Firebase Admin
  try {
    initializeApp({
      credential: applicationDefault(),
      projectId: projectId,
    });
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error.message);
    console.error('Make sure you have run: gcloud auth application-default login');
    process.exit(1);
  }

  const db = getFirestore();

  // Find orders with legacy statuses
  console.log('🔍 Searching for orders with legacy statuses...');
  console.log(`   Looking for: ${LEGACY_STATUSES.join(', ')}`);
  console.log('');

  const ordersRef = db.collection('orders');
  const snapshot = await ordersRef.get();

  const ordersToMigrate = [];
  const statusCounts = {
    Received: 0,
    Delivered: 0,
    Secured: 0,
    Other: 0,
  };

  snapshot.forEach(doc => {
    const data = doc.data();
    const status = data.status;

    if (status === 'Received') {
      statusCounts.Received++;
      ordersToMigrate.push({ id: doc.id, currentStatus: status, customerName: data.customerName });
    } else if (status === 'Delivered') {
      statusCounts.Delivered++;
      ordersToMigrate.push({ id: doc.id, currentStatus: status, customerName: data.customerName });
    } else if (status === 'Secured') {
      statusCounts.Secured++;
    } else {
      statusCounts.Other++;
    }
  });

  // Print summary
  console.log('📊 Current Status Distribution:');
  console.log(`   - Received:  ${statusCounts.Received} orders`);
  console.log(`   - Delivered: ${statusCounts.Delivered} orders`);
  console.log(`   - Secured:   ${statusCounts.Secured} orders (already migrated)`);
  console.log(`   - Other:     ${statusCounts.Other} orders (active statuses)`);
  console.log('');

  if (ordersToMigrate.length === 0) {
    console.log('✅ No orders need migration! All legacy statuses have already been migrated.');
    process.exit(0);
  }

  console.log(`📋 Orders to migrate: ${ordersToMigrate.length}`);
  console.log('');

  // List orders to be migrated
  console.log('Orders that will be updated:');
  console.log('-'.repeat(70));
  for (const order of ordersToMigrate) {
    console.log(`  ${order.id} | ${order.currentStatus.padEnd(10)} -> ${NEW_STATUS} | ${order.customerName || 'N/A'}`);
  }
  console.log('-'.repeat(70));
  console.log('');

  if (isDryRun) {
    console.log('🔍 DRY-RUN complete. No changes were made.');
    console.log('');
    console.log('To apply this migration, run with --apply flag:');
    console.log(`  node scripts/migrate-delivered-to-secured.mjs --project ${projectId} --apply`);
    process.exit(0);
  }

  // Apply migration
  console.log('🚀 Applying migration...');
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  // Use batched writes for efficiency
  const BATCH_SIZE = 500;
  let batch = db.batch();
  let batchCount = 0;

  for (const order of ordersToMigrate) {
    const orderRef = ordersRef.doc(order.id);
    batch.update(orderRef, {
      status: NEW_STATUS,
      migratedAt: FieldValue.serverTimestamp(),
      previousStatus: order.currentStatus,
    });
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      try {
        await batch.commit();
        successCount += batchCount;
        console.log(`   ✓ Committed batch of ${batchCount} orders (total: ${successCount})`);
        batch = db.batch();
        batchCount = 0;
      } catch (error) {
        console.error(`   ✗ Error committing batch:`, error.message);
        errorCount += batchCount;
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  // Commit remaining orders
  if (batchCount > 0) {
    try {
      await batch.commit();
      successCount += batchCount;
      console.log(`   ✓ Committed final batch of ${batchCount} orders (total: ${successCount})`);
    } catch (error) {
      console.error(`   ✗ Error committing final batch:`, error.message);
      errorCount += batchCount;
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('Migration Complete!');
  console.log('='.repeat(70));
  console.log(`   ✓ Successfully migrated: ${successCount} orders`);
  if (errorCount > 0) {
    console.log(`   ✗ Failed to migrate: ${errorCount} orders`);
  }
  console.log('');

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
