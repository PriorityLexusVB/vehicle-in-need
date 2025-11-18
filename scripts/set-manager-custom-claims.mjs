#!/usr/bin/env node
/**
 * Set custom claims (isManager: true) for manager users.
 * This script sets BOTH Firestore isManager field AND Auth custom claims.
 *
 * Usage examples:
 *   # Dry run (no changes)
 *   node scripts/set-manager-custom-claims.mjs --project vehicle-in-need --dry-run --emails manager@priorityautomotive.com
 *
 *   # Apply changes
 *   node scripts/set-manager-custom-claims.mjs --project vehicle-in-need --apply --emails manager1@priorityautomotive.com,manager2@priorityautomotive.com
 *
 *   # Sync all existing managers from Firestore
 *   node scripts/set-manager-custom-claims.mjs --project vehicle-in-need --apply --sync-from-firestore
 *
 * Auth:
 * - Requires Application Default Credentials (ADC): `gcloud auth application-default login`
 * - Or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON key path
 * - Service account needs roles:
 *   - Firebase Admin (for setting custom claims)
 *   - Cloud Datastore User (for reading Firestore)
 *
 * Security:
 * - Only emails with @priorityautomotive.com domain are allowed
 * - Default is dry-run mode (--apply required for actual changes)
 * - Shows what would change before applying
 */

import process from "node:process";
import admin from "firebase-admin";

// --- Args parsing ---
function parseArgs(argv) {
  const out = {
    project: undefined,
    emails: [],
    apply: false,
    dryRun: true,
    syncFromFirestore: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--project") {
      out.project = argv[++i];
    } else if (arg === "--emails") {
      const list = argv[++i] || "";
      out.emails.push(
        ...list
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      );
    } else if (arg === "--apply") {
      out.apply = true;
      out.dryRun = false;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
      out.apply = false;
    } else if (arg === "--sync-from-firestore") {
      out.syncFromFirestore = true;
    }
  }

  out.emails = [...new Set(out.emails)];
  return out;
}

const args = parseArgs(process.argv);

// --- Validation ---
if (!args.project) {
  console.error("❌ Error: Missing --project <project-id>");
  console.error("\nUsage:");
  console.error("  node scripts/set-manager-custom-claims.mjs --project vehicle-in-need --dry-run --emails manager@example.com");
  process.exit(2);
}

if (!args.syncFromFirestore && args.emails.length === 0) {
  console.error("❌ Error: No emails provided.");
  console.error("\nUsage:");
  console.error("  --emails a@priorityautomotive.com,b@priorityautomotive.com");
  console.error("  OR");
  console.error("  --sync-from-firestore (to sync all managers from Firestore)");
  process.exit(2);
}

// --- Initialize Firebase Admin SDK ---
console.log("\n🔧 Initializing Firebase Admin SDK...");
try {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: args.project,
    });
  }
  console.log(`✅ Connected to project: ${args.project}`);
} catch (err) {
  console.error("❌ Failed to initialize Firebase Admin SDK");
  console.error(err.message || String(err));
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();
const USERS_COLLECTION = "users";

// --- Helper functions ---
async function getManagerEmailsFromFirestore() {
  console.log("\n📋 Fetching managers from Firestore...");
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("isManager", "==", true)
    .get();

  const emails = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.email) {
      emails.push(data.email.toLowerCase());
    }
  });

  console.log(`   Found ${emails.length} manager(s) in Firestore`);
  return emails;
}

async function processManager(email) {
  // Validate domain
  if (!email.endsWith("@priorityautomotive.com")) {
    return {
      email,
      success: false,
      action: "skipped",
      reason: "Invalid domain (only @priorityautomotive.com allowed)",
    };
  }

  try {
    // Get user from Firebase Auth
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;

    // Check current custom claims
    const currentClaims = userRecord.customClaims || {};
    const hasManagerClaim = currentClaims.isManager === true;

    // Check Firestore document
    const docRef = db.collection(USERS_COLLECTION).doc(uid);
    const docSnap = await docRef.get();
    const docData = docSnap.exists ? docSnap.data() : null;
    const hasManagerInFirestore = docData?.isManager === true;

    const changes = [];
    let needsUpdate = false;

    // Determine what needs to be updated
    if (!hasManagerClaim) {
      changes.push("Set custom claim isManager: true");
      needsUpdate = true;
    }

    if (!hasManagerInFirestore) {
      changes.push("Set Firestore isManager: true");
      needsUpdate = true;
    }

    if (!needsUpdate) {
      return {
        email,
        uid,
        success: true,
        action: "no-change",
        reason: "Already has custom claim and Firestore field",
      };
    }

    if (args.dryRun) {
      return {
        email,
        uid,
        success: true,
        action: "would-update",
        changes: changes.join(", "),
      };
    }

    // Apply changes
    const updates = [];

    if (!hasManagerClaim) {
      await auth.setCustomUserClaims(uid, { ...currentClaims, isManager: true });
      updates.push("custom claim set");
    }

    if (!hasManagerInFirestore) {
      await docRef.set(
        {
          uid,
          email: email.toLowerCase(),
          displayName: userRecord.displayName || null,
          isManager: true,
        },
        { merge: true }
      );
      updates.push("Firestore field set");
    }

    return {
      email,
      uid,
      success: true,
      action: "updated",
      changes: updates.join(", "),
    };
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      return {
        email,
        success: false,
        action: "failed",
        reason: "User not found in Firebase Auth",
      };
    }

    return {
      email,
      success: false,
      action: "error",
      reason: err.message || String(err),
    };
  }
}

// --- Main execution ---
(async () => {
  console.log("\n=== Set Manager Custom Claims ===");
  console.log(`Project: ${args.project}`);
  console.log(`Mode: ${args.dryRun ? "DRY-RUN (no changes)" : "APPLY (making changes)"}`);

  // Get list of emails to process
  let emailsToProcess = args.emails;
  if (args.syncFromFirestore) {
    const firestoreEmails = await getManagerEmailsFromFirestore();
    emailsToProcess = [...new Set([...emailsToProcess, ...firestoreEmails])];
  }

  if (emailsToProcess.length === 0) {
    console.log("\n⚠️  No managers found to process");
    process.exit(0);
  }

  console.log(`\nProcessing ${emailsToProcess.length} email(s)...`);

  // Process each manager
  const results = [];
  for (const email of emailsToProcess) {
    const result = await processManager(email);
    results.push(result);
  }

  // Display results
  console.log("\n📊 Results:");
  console.log("─".repeat(80));

  for (const result of results) {
    const status = result.success ? "✅" : "❌";
    const uidStr = result.uid ? ` (${result.uid.substring(0, 8)}...)` : "";
    
    if (result.action === "no-change") {
      console.log(`${status} ${result.email}${uidStr}: Already configured`);
    } else if (result.action === "would-update") {
      console.log(`${status} ${result.email}${uidStr}: Would update - ${result.changes}`);
    } else if (result.action === "updated") {
      console.log(`${status} ${result.email}${uidStr}: Updated - ${result.changes}`);
    } else if (result.action === "skipped") {
      console.log(`⏭️  ${result.email}: Skipped - ${result.reason}`);
    } else if (result.action === "failed" || result.action === "error") {
      console.log(`${status} ${result.email}: ${result.reason}`);
    }
  }

  // Summary
  const summary = results.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});

  console.log("\n📈 Summary:");
  console.log("─".repeat(80));
  for (const [action, count] of Object.entries(summary)) {
    console.log(`  ${action}: ${count}`);
  }

  const successCount = results.filter((r) => r.success && r.action !== "no-change").length;
  const failCount = results.filter((r) => !r.success).length;

  if (args.dryRun && successCount > 0) {
    console.log(`\n💡 Run with --apply to make ${successCount} change(s)`);
  } else if (!args.dryRun && successCount > 0) {
    console.log(`\n✅ Successfully updated ${successCount} manager(s)`);
    console.log("\n⚠️  IMPORTANT: Users must refresh their auth token to see changes:");
    console.log("   - Sign out and sign back in, OR");
    console.log("   - In client code: await user.getIdToken(true)");
  }

  if (failCount > 0) {
    console.log(`\n❌ ${failCount} operation(s) failed`);
    process.exit(1);
  }

  console.log("\n✅ Done!");
})();
