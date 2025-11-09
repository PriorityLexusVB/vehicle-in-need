#!/usr/bin/env node
/**
 * Seed manager roles for specified emails using Firebase Admin SDK.
 *
 * Usage examples:
 *   node scripts/seed-manager.mjs --project vehicles-in-need --dry-run --emails a@priorityautomotive.com,b@priorityautomotive.com
 *   node scripts/seed-manager.mjs --project vehicles-in-need --apply --emails a@priorityautomotive.com
 *
 * Auth:
 * - Prefer Application Default Credentials (ADC): `gcloud auth application-default login`
 * - Or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON key path.
 *
 * Safety:
 * - Default is dry-run. Pass --apply to write changes.
 * - Exits non-zero if no users were matched so CI can catch misconfigurations.
 */

import process from "node:process";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

// --- Simple args parsing ---
function parseArgs(argv) {
  const out = { project: undefined, emails: [], apply: false, dryRun: true };
  let passthrough = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      passthrough = true;
      continue;
    }
    if (!passthrough) {
      if (a === "--project") {
        out.project = argv[++i];
        continue;
      }
      if (a === "--emails") {
        const list = argv[++i] || "";
        out.emails.push(
          ...list
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)
        );
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
    } else {
      a.split(",").forEach((part) => {
        const e = part.trim().toLowerCase();
        if (e) out.emails.push(e);
      });
    }
  }
  out.emails = [...new Set(out.emails)];
  return out;
}

const args = parseArgs(process.argv);

if (!args.project) {
  console.error("Missing --project <id>");
  process.exit(2);
}
if (!Array.isArray(args.emails) || args.emails.length === 0) {
  console.error(
    "No emails provided. Use --emails a@b.com,c@d.com OR npm script with: pnpm run seed:managers:dry-run -- a@b.com b@c.com"
  );
  process.exit(2);
}

console.log("\n=== Seed Managers ===");
console.log("Project: ", args.project);
console.log(
  "Emails : ",
  args.emails.length ? args.emails.join(", ") : "(none supplied)"
);
console.log(
  "Mode   : ",
  args.dryRun ? "DRY-RUN (no writes)" : "APPLY (writes enabled)"
);

// --- Initialize Admin SDK ---
try {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: args.project,
    });
  }
} catch (err) {
  console.error("Failed to initialize Firebase Admin SDK.");
  console.error(String(err?.message || err));
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();
const USERS_COLLECTION = "users";

function toDoc(userRecord) {
  const { uid, email, displayName } = userRecord;
  return {
    uid,
    email: (email || "").toLowerCase(),
    displayName: displayName || null,
    isManager: true,
  };
}

async function seedOne(email) {
  try {
    const user = await auth.getUserByEmail(email);
    const docRef = db.collection(USERS_COLLECTION).doc(user.uid);
    const snap = await docRef.get();
    const proposed = toDoc(user);

    if (!snap.exists) {
      if (args.dryRun) {
        return { email, uid: user.uid, action: "create", changed: true };
      }
      await docRef.set(proposed, { merge: true });
      return { email, uid: user.uid, action: "create", changed: true };
    }

    const current = snap.data();
    const needsChange =
      current?.isManager !== true ||
      current?.email?.toLowerCase() !== proposed.email ||
      current?.uid !== user.uid ||
      (current?.displayName || null) !== proposed.displayName;

    if (!needsChange) {
      return { email, uid: user.uid, action: "noop", changed: false };
    }

    if (args.dryRun) {
      return { email, uid: user.uid, action: "update", changed: true };
    }

    await docRef.set(proposed, { merge: true });
    return { email, uid: user.uid, action: "update", changed: true };
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      return { email, uid: null, action: "missing-auth-user", changed: false };
    }
    return {
      email,
      uid: null,
      action: "error",
      error: String(err?.message || err),
      changed: false,
    };
  }
}

(async () => {
  const results = [];
  for (const email of args.emails) {
    // Ensure domain-level safety; this mirrors app restriction
    if (!email.endsWith("@priorityautomotive.com")) {
      results.push({
        email,
        uid: null,
        action: "skipped-invalid-domain",
        changed: false,
      });
      continue;
    }
    const r = await seedOne(email);
    results.push(r);
  }

  const summary = results.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});

  console.log("\nResults:");
  for (const r of results) {
    const extra = r.uid ? ` uid=${r.uid}` : "";
    if (r.error) {
      console.log(`- ${r.email}: ${r.action}${extra} error=${r.error}`);
    } else {
      console.log(`- ${r.email}: ${r.action}${extra}`);
    }
  }

  console.log("\nSummary:");
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k}: ${v}`);
  }

  const changed = results.filter((r) => r.changed).length;
  if (changed === 0) {
    console.log("\nNo changes required.");
  } else {
    console.log(
      `\n${args.dryRun ? "Would change" : "Changed"} ${changed} record(s).`
    );
  }

  if (!results.some((r) => r.uid)) {
    console.error(
      "\nERROR: No matching Auth users found for provided emails. Ensure users have signed in at least once or create them in Firebase Auth."
    );
    process.exit(3);
  }
})();
