#!/usr/bin/env node
/**
 * Set custom claims (manager: true) for a user via Firebase Admin SDK.
 * 
 * This script sets the `manager` custom claim on a Firebase Auth user,
 * enabling them to perform manager operations that are gated by Firestore
 * security rules. Unlike the `isManager` field in Firestore, custom claims
 * are embedded in the user's ID token and verified directly by security rules.
 * 
 * Usage:
 *   # Dry run (no changes)
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node tools/set-manager-custom-claims.mjs --email manager@example.com --dry-run
 * 
 *   # Apply changes
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node tools/set-manager-custom-claims.mjs --email manager@example.com --apply
 * 
 *   # Using Application Default Credentials (ADC)
 *   gcloud auth application-default login
 *   node tools/set-manager-custom-claims.mjs --project vehicles-in-need --email manager@example.com --apply
 * 
 * Authentication:
 *   - Requires GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to
 *     a service account JSON key file, OR
 *   - Use Application Default Credentials via `gcloud auth application-default login`
 * 
 * Service Account Requirements:
 *   - Firebase Admin SDK Admin (roles/firebase.sdkAdminServiceAgent) OR
 *   - Firebase Authentication Admin (roles/firebaseauth.admin)
 * 
 * After Setting Custom Claims:
 *   The user must refresh their ID token to see the new claims. This happens
 *   automatically when the token expires (~1 hour), or can be forced by:
 *   1. Having the user sign out and sign back in, OR
 *   2. Calling `await user.getIdToken(true)` in client code
 * 
 * References:
 *   - Failing job: b7bbf4ce81bc133cf79910dea610113b18695186
 *   - MD060 fixed in PR #134
 */

import process from "node:process";
import admin from "firebase-admin";

// --- Argument parsing ---
function parseArgs(argv) {
  const args = {
    email: null,
    project: null,
    apply: false,
    dryRun: true,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--email":
        args.email = argv[++i]?.toLowerCase().trim();
        break;
      case "--project":
        args.project = argv[++i];
        break;
      case "--apply":
        args.apply = true;
        args.dryRun = false;
        break;
      case "--dry-run":
        args.dryRun = true;
        args.apply = false;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        if (!arg.startsWith("-")) {
          // Allow positional email argument
          if (!args.email) {
            args.email = arg.toLowerCase().trim();
          }
        }
    }
  }

  return args;
}

function printUsage() {
  console.log(`
Usage: node tools/set-manager-custom-claims.mjs [options] [email]

Options:
  --email <email>    Email address of the user to grant manager role
  --project <id>     Firebase project ID (optional if using service account)
  --apply            Apply changes (default is dry-run)
  --dry-run          Show what would be done without making changes
  --help, -h         Show this help message

Examples:
  # Dry run (safe, no changes made)
  node tools/set-manager-custom-claims.mjs --email manager@example.com

  # Apply changes
  node tools/set-manager-custom-claims.mjs --email manager@example.com --apply

  # With explicit project ID
  node tools/set-manager-custom-claims.mjs --project vehicles-in-need --email user@example.com --apply

Environment:
  GOOGLE_APPLICATION_CREDENTIALS   Path to service account JSON key file
                                   (or use 'gcloud auth application-default login')

After running with --apply:
  The user must sign out and sign back in (or call getIdToken(true)) 
  to receive the updated custom claims in their ID token.
`);
}

// --- Main execution ---
async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.email) {
    console.error("❌ Error: Email address is required\n");
    printUsage();
    process.exit(2);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(args.email)) {
    console.error(`❌ Error: Invalid email format: ${args.email}`);
    process.exit(2);
  }

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Set Manager Custom Claims                                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Check for credentials
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("ℹ️  No GOOGLE_APPLICATION_CREDENTIALS set.");
    console.log("   Using Application Default Credentials (ADC).\n");
  }

  // Initialize Firebase Admin SDK
  console.log("🔧 Initializing Firebase Admin SDK...");
  try {
    const initOptions = {
      credential: admin.credential.applicationDefault(),
    };
    if (args.project) {
      initOptions.projectId = args.project;
    }

    if (admin.apps.length === 0) {
      admin.initializeApp(initOptions);
    }
    console.log(`✅ Connected to project: ${admin.app().options.projectId || "(auto-detected)"}\n`);
  } catch (err) {
    console.error("❌ Failed to initialize Firebase Admin SDK");
    console.error(`   ${err.message || String(err)}`);
    console.error("\n💡 Tips:");
    console.error("   - Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file");
    console.error("   - Or run: gcloud auth application-default login");
    process.exit(1);
  }

  const auth = admin.auth();
  const email = args.email;

  console.log(`📧 Target user: ${email}`);
  console.log(`📋 Mode: ${args.dryRun ? "DRY-RUN (no changes)" : "APPLY (making changes)"}\n`);

  try {
    // Look up user by email
    console.log("🔍 Looking up user in Firebase Auth...");
    const userRecord = await auth.getUserByEmail(email);
    console.log(`✅ Found user: ${userRecord.uid}`);
    console.log(`   Display name: ${userRecord.displayName || "(not set)"}`);
    console.log(`   Email verified: ${userRecord.emailVerified}`);

    // Check current claims
    const currentClaims = userRecord.customClaims || {};
    console.log(`\n📋 Current custom claims: ${JSON.stringify(currentClaims)}`);

    const hasManagerClaim = currentClaims.isManager === true;

    if (hasManagerClaim) {
      console.log("\n✅ User already has isManager: true custom claim.");
      console.log("   No changes needed.\n");
      process.exit(0);
    }

    // Prepare new claims (merge with existing)
    const newClaims = { ...currentClaims, isManager: true };
    console.log(`\n📋 New custom claims: ${JSON.stringify(newClaims)}`);

    if (args.dryRun) {
      console.log("\n🔍 DRY-RUN: Would set custom claims:");
      console.log(`   User: ${email} (${userRecord.uid})`);
      console.log(`   Claims: ${JSON.stringify(newClaims)}`);
      console.log("\n💡 Run with --apply to make changes.\n");
      process.exit(0);
    }

    // Apply the custom claims
    console.log("\n⏳ Setting custom claims...");
    await auth.setCustomUserClaims(userRecord.uid, newClaims);
    console.log("✅ Custom claims set successfully!\n");

    // Verify the change
    const updatedUser = await auth.getUser(userRecord.uid);
    console.log(`📋 Verified claims: ${JSON.stringify(updatedUser.customClaims)}\n`);

    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  ⚠️  IMPORTANT: User must refresh their token              ║");
    console.log("╠════════════════════════════════════════════════════════════╣");
    console.log("║  The user needs to:                                        ║");
    console.log("║    1. Sign out of the application                          ║");
    console.log("║    2. Sign back in                                         ║");
    console.log("║                                                            ║");
    console.log("║  OR in client code:                                        ║");
    console.log("║    await user.getIdToken(true);                            ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log("✅ Done!\n");

  } catch (err) {
    if (err.code === "auth/user-not-found") {
      console.error(`\n❌ Error: User not found: ${email}`);
      console.error("   The user must have logged in at least once.\n");
      process.exit(1);
    }

    console.error(`\n❌ Error: ${err.message || String(err)}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
