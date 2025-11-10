#!/usr/bin/env node
/**
 * Backfill Order Owners Migration Script
 *
 * Adds createdByUid and createdByEmail fields to legacy orders that don't have them.
 * 
 * Usage:
 *   # Dry run (default, no writes)
 *   node scripts/migrations/backfill-order-owners.mjs --project vehicles-in-need --dry-run
 *   
 *   # Apply changes (writes to Firestore)
 *   node scripts/migrations/backfill-order-owners.mjs --project vehicles-in-need --apply
 *
 *   # With emulator
 *   export FIRESTORE_EMULATOR_HOST='localhost:8080'
 *   node scripts/migrations/backfill-order-owners.mjs --project demo-project --dry-run
 *
 * Strategy:
 * - Orders without createdByUid are considered legacy
 * - Attempts to match order.salesperson to user.displayName or user.email
 * - If no match found, marks order as needing manual review
 * - Always dry-run first to review changes
 *
 * Safety:
 * - Default is dry-run (no writes)
 * - Pass --apply to actually write changes
 * - Works with both production and emulator
 * - Logs all decisions for audit trail
 */

import process from "node:process";
import admin from "firebase-admin";

// --- Args parsing ---
function parseArgs(argv) {
  const out = { 
    project: undefined, 
    apply: false, 
    dryRun: true 
  };
  
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") {
      out.project = argv[++i];
      continue;
    }
    if (a === "--apply") {
      out.apply = true;
      out.dryRun = false;
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      out.apply = false;
      continue;
    }
  }
  return out;
}

const args = parseArgs(process.argv);

if (!args.project) {
  console.error("❌ Missing --project <id>");
  console.error("\nUsage:");
  console.error("  node scripts/migrations/backfill-order-owners.mjs --project PROJECT_ID [--dry-run|--apply]");
  process.exit(2);
}

console.log("\n=== Backfill Order Owners Migration ===");
console.log("Project   :", args.project);
console.log("Mode      :", args.dryRun ? "DRY-RUN (no writes)" : "APPLY (writes enabled)");
console.log("Environment:", process.env.FIRESTORE_EMULATOR_HOST ? "Emulator" : "Production");

if (!args.dryRun) {
  console.log("\n⚠️  WARNING: --apply mode will write to Firestore!");
  console.log("Press Ctrl+C now to cancel, or wait 3 seconds to continue...\n");
  await new Promise(resolve => setTimeout(resolve, 3000));
}

// Initialize Admin SDK
try {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: process.env.FIRESTORE_EMULATOR_HOST 
        ? undefined 
        : admin.credential.applicationDefault(),
      projectId: args.project,
    });
  }
} catch (err) {
  console.error("❌ Failed to initialize Firebase Admin SDK");
  console.error(String(err?.message || err));
  process.exit(1);
}

const db = admin.firestore();
const USERS_COLLECTION = "users";
const ORDERS_COLLECTION = "orders";

async function getAllUsers() {
  const snapshot = await db.collection(USERS_COLLECTION).get();
  return snapshot.docs.map(doc => ({
    uid: doc.id,
    ...doc.data()
  }));
}

async function getLegacyOrders() {
  // Orders without createdByUid are considered legacy
  const snapshot = await db.collection(ORDERS_COLLECTION).get();
  return snapshot.docs
    .filter(doc => !doc.data().createdByUid)
    .map(doc => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data()
    }));
}

function findMatchingUser(order, users) {
  // Try to match by salesperson name
  const salesperson = (order.salesperson || "").toLowerCase().trim();
  
  if (!salesperson) {
    return null;
  }

  // Try exact match on displayName
  let match = users.find(u => 
    (u.displayName || "").toLowerCase().trim() === salesperson
  );
  
  if (match) {
    return { user: match, confidence: "high", matchType: "displayName-exact" };
  }

  // Try partial match on displayName
  match = users.find(u => 
    (u.displayName || "").toLowerCase().includes(salesperson) ||
    salesperson.includes((u.displayName || "").toLowerCase())
  );
  
  if (match) {
    return { user: match, confidence: "medium", matchType: "displayName-partial" };
  }

  // Try match on email prefix (before @)
  const emailPrefix = salesperson.replace(/\s+/g, '.').toLowerCase();
  match = users.find(u => 
    (u.email || "").toLowerCase().startsWith(emailPrefix + "@")
  );
  
  if (match) {
    return { user: match, confidence: "medium", matchType: "email-prefix" };
  }

  return null;
}

async function migrateOrders() {
  console.log("\n📊 Fetching data...");
  const users = await getAllUsers();
  const legacyOrders = await getLegacyOrders();

  console.log(`Found ${users.length} users`);
  console.log(`Found ${legacyOrders.length} legacy orders without owner info`);

  if (legacyOrders.length === 0) {
    console.log("\n✅ No legacy orders to migrate. All orders have owner info!");
    return;
  }

  console.log("\n🔍 Analyzing matches...\n");

  const results = {
    matched: [],
    unmatched: [],
    updated: 0,
  };

  for (const order of legacyOrders) {
    const match = findMatchingUser(order, users);
    
    if (match) {
      const update = {
        orderId: order.id,
        salesperson: order.salesperson,
        matchedUser: match.user.email,
        matchedUid: match.user.uid,
        confidence: match.confidence,
        matchType: match.matchType,
      };
      
      results.matched.push(update);

      if (!args.dryRun) {
        try {
          await order.ref.update({
            createdByUid: match.user.uid,
            createdByEmail: match.user.email,
          });
          results.updated++;
          console.log(`✓ Updated order ${order.id}: ${order.salesperson} → ${match.user.email} (${match.confidence})`);
        } catch (err) {
          console.error(`✗ Failed to update order ${order.id}:`, err?.message);
        }
      } else {
        console.log(`  Would update order ${order.id}: ${order.salesperson} → ${match.user.email} (${match.confidence}, ${match.matchType})`);
      }
    } else {
      results.unmatched.push({
        orderId: order.id,
        salesperson: order.salesperson,
        customerName: order.customerName,
      });
      console.log(`⚠  No match for order ${order.id}: salesperson="${order.salesperson}"`);
    }
  }

  // Print summary
  console.log("\n=== Migration Summary ===");
  console.log(`Total legacy orders: ${legacyOrders.length}`);
  console.log(`Matched orders: ${results.matched.length}`);
  console.log(`Unmatched orders: ${results.unmatched.length}`);
  
  if (!args.dryRun) {
    console.log(`Successfully updated: ${results.updated}`);
  } else {
    console.log(`\n💡 Run with --apply to write these changes to Firestore`);
  }

  if (results.unmatched.length > 0) {
    console.log("\n⚠️  Orders requiring manual review:");
    results.unmatched.forEach(order => {
      console.log(`  - Order ${order.orderId}: salesperson="${order.salesperson}", customer="${order.customerName}"`);
    });
    console.log("\nThese orders will need manual assignment in Firestore or the UI.");
  }

  // Confidence breakdown
  if (results.matched.length > 0) {
    const highConfidence = results.matched.filter(m => m.confidence === "high").length;
    const mediumConfidence = results.matched.filter(m => m.confidence === "medium").length;
    console.log("\n📊 Match confidence:");
    console.log(`  High confidence: ${highConfidence}`);
    console.log(`  Medium confidence: ${mediumConfidence}`);
  }
}

// Run the migration
(async () => {
  try {
    await migrateOrders();
    console.log("\n✅ Migration complete!\n");
  } catch (err) {
    console.error("\n❌ Migration failed:", err?.message || err);
    process.exit(1);
  }
})();
