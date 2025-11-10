#!/usr/bin/env node
/**
 * Auth Impersonation Script for Firebase Emulator
 *
 * Creates a custom token for testing role-based UX in the Firebase Emulator.
 * 
 * Usage:
 *   node scripts/auth-impersonate.mjs --email ron.jordan@priorityautomotive.com --non-manager
 *   node scripts/auth-impersonate.mjs --email test@priorityautomotive.com --manager
 *
 * Requirements:
 * - Firebase emulator running (firebase emulators:start)
 * - FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST env vars set
 * - Firebase Admin SDK with emulator configuration
 *
 * Safety:
 * - Only works with Firebase Emulator (checks for emulator environment)
 * - Does NOT work with production Firebase
 * - Generates a custom token that can be used with signInWithCustomToken()
 */

import process from "node:process";
import admin from "firebase-admin";

// --- Args parsing ---
function parseArgs(argv) {
  const out = { 
    email: undefined, 
    isManager: false,
    project: 'demo-vehicle-in-need' // Default emulator project
  };
  
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") {
      out.email = argv[++i];
      continue;
    }
    if (a === "--manager") {
      out.isManager = true;
      continue;
    }
    if (a === "--non-manager") {
      out.isManager = false;
      continue;
    }
    if (a === "--project") {
      out.project = argv[++i];
      continue;
    }
  }
  return out;
}

const args = parseArgs(process.argv);

// Validate inputs
if (!args.email) {
  console.error("❌ Missing --email parameter");
  console.error("\nUsage:");
  console.error("  node scripts/auth-impersonate.mjs --email user@priorityautomotive.com [--manager|--non-manager] [--project PROJECT_ID]");
  process.exit(2);
}

if (!args.email.endsWith("@priorityautomotive.com")) {
  console.error("❌ Email must end with @priorityautomotive.com");
  process.exit(2);
}

// Check if running in emulator environment
const isEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!isEmulator) {
  console.error("❌ This script only works with Firebase Emulator");
  console.error("\nPlease set emulator environment variables:");
  console.error("  export FIRESTORE_EMULATOR_HOST='localhost:8080'");
  console.error("  export FIREBASE_AUTH_EMULATOR_HOST='localhost:9099'");
  console.error("\nOr start the emulator first:");
  console.error("  firebase emulators:start");
  process.exit(1);
}

console.log("\n=== Firebase Auth Impersonation (Emulator Only) ===");
console.log("Email      :", args.email);
console.log("Role       :", args.isManager ? "Manager" : "Non-Manager");
console.log("Project    :", args.project);
console.log("Environment: Emulator");

// Initialize Admin SDK for emulator
try {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: args.project,
    });
  }
} catch (err) {
  console.error("❌ Failed to initialize Firebase Admin SDK");
  console.error(String(err?.message || err));
  process.exit(1);
}

const auth = admin.auth();
const db = admin.firestore();
const USERS_COLLECTION = "users";

async function createOrUpdateUser() {
  try {
    let user;
    
    // Try to get existing user
    try {
      user = await auth.getUserByEmail(args.email);
      console.log(`\n✓ Found existing Auth user: ${user.uid}`);
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        // Create new user in Auth
        user = await auth.createUser({
          email: args.email,
          emailVerified: true,
          displayName: args.email.split('@')[0],
        });
        console.log(`\n✓ Created new Auth user: ${user.uid}`);
      } else {
        throw err;
      }
    }

    // Create or update Firestore user document
    const userDocRef = db.collection(USERS_COLLECTION).doc(user.uid);
    const userDoc = {
      uid: user.uid,
      email: args.email,
      displayName: user.displayName || args.email.split('@')[0],
      isManager: args.isManager,
    };

    await userDocRef.set(userDoc, { merge: true });
    console.log(`✓ Updated Firestore user document with isManager=${args.isManager}`);

    // Generate custom token
    const customToken = await auth.createCustomToken(user.uid, {
      isManager: args.isManager,
    });

    console.log("\n=== Custom Token Generated ===");
    console.log("\nToken (copy this):");
    console.log(customToken);
    console.log("\n=== Usage Instructions ===");
    console.log("\n1. In your browser console (with app running against emulator):");
    console.log("   import { getAuth, signInWithCustomToken } from 'firebase/auth';");
    console.log("   const auth = getAuth();");
    console.log(`   await signInWithCustomToken(auth, '${customToken.substring(0, 50)}...');`);
    console.log("\n2. Or copy the full token and use it in your test code");
    console.log("\n3. The user will be signed in with the specified role");
    console.log(`   Email: ${args.email}`);
    console.log(`   Role: ${args.isManager ? 'Manager' : 'Non-Manager'}`);

    return { uid: user.uid, token: customToken };
  } catch (err) {
    console.error("\n❌ Error:", err?.message || err);
    throw err;
  }
}

// Run the script
(async () => {
  try {
    await createOrUpdateUser();
    console.log("\n✅ Success! User ready for impersonation in emulator.\n");
  } catch (err) {
    console.error("\n❌ Failed to create impersonation token\n");
    process.exit(1);
  }
})();
