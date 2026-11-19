#!/usr/bin/env node
/**
 * Deploy drift monitor: is merged APP CODE actually live in production?
 *
 * Why this exists: PR #287 (Dealer Exchange fixes) was merged on 2026-11-06 but
 * production kept serving the 2026-10-09 build for days and nobody was alerted.
 * `check-production-version.cjs` is manual and compares to main HEAD, so a docs-only
 * commit would false-alarm. This script only asks one question: is the LAST commit
 * that changed app code reflected in what production runs (same app-code content as main)?
 *
 * Exit codes: 0 = OK, 1 = DRIFT, 2 = cannot verify, 3 = PENDING (inside the grace window).
 * PENDING has its own code because exit 0 closes the open drift issue, and a pending
 * commit does not mean production caught up.
 *
 * Usage: node scripts/check-deploy-drift.cjs [--url <base>] [--grace-hours 6]
 * Read-only: one public GET of /api/status plus local git commands. No credentials.
 */
"use strict";

const https = require("https");
const { execFileSync } = require("child_process");

const DEFAULT_URL = "https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app";

// Keep in sync with the push.paths list in .github/workflows/build-and-deploy.yml,
// minus the workflow file itself (editing CI must not raise a "code is not live" alarm).
const APP_PATHS = [
  "src",
  "server",
  "components",
  "services",
  "public",
  "App.tsx",
  "index.tsx",
  "index.html",
  "types.ts",
  "constants.ts",
  "vite.config.ts",
  "tsconfig.json",
  "tailwind.config.js",
  "postcss.config.js",
  "Dockerfile",
  "cloudbuild.yaml",
  "package.json",
  "package-lock.json",
];

/**
 * Pure decision function (unit tested).
 * @param {{liveResolved: boolean, treeMatchesMain: boolean, appCommitIsInLive: boolean, appCommitAgeHours: number, graceHours: number}} s
 * @returns {{state: "OK"|"PENDING"|"DRIFT"|"UNKNOWN", exitCode: number, reason: string}}
 */
function evaluateDrift(s) {
  if (!s.liveResolved) {
    return {
      state: "UNKNOWN",
      exitCode: 2,
      reason: "Production reported a version this repository cannot resolve to a commit.",
    };
  }
  // Same app-code content as main: live, even if the commit ids differ (squash merge, revert).
  if (s.treeMatchesMain) {
    return { state: "OK", exitCode: 0, reason: "Production runs the same app code as main." };
  }
  // Different content AND production already contains the latest app commit: production
  // is ahead of / off main (manual or branch deploy). Cannot call that drift.
  if (s.appCommitIsInLive) {
    return {
      state: "UNKNOWN",
      exitCode: 2,
      reason: "Production runs app code that differs from main but already contains main's latest app commit (ahead of main or a branch deploy).",
    };
  }
  if (s.appCommitAgeHours < s.graceHours) {
    return {
      state: "PENDING",
      exitCode: 3,
      reason: `Latest app-code commit is ${s.appCommitAgeHours.toFixed(1)}h old, inside the ${s.graceHours}h deploy grace window.`,
    };
  }
  return {
    state: "DRIFT",
    exitCode: 1,
    reason: `Main's app code changed ${s.appCommitAgeHours.toFixed(1)}h ago and production is still running different (older) app code.`,
  };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fetchStatus(baseUrl) {
  return new Promise((resolve, reject) => {
    const target = `${baseUrl.replace(/\/$/, "")}/api/status`;
    const lib = target.startsWith("http://") ? require("http") : https; // http only for local tests
    const req = lib.get(target, { timeout: 20000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Non-JSON /api/status response (HTTP ${res.statusCode})`));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("Timed out reading /api/status")));
    req.on("error", reject);
  });
}

function parseArgs(argv) {
  const out = { url: DEFAULT_URL, graceHours: 6 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url") out.url = argv[++i];
    else if (argv[i] === "--grace-hours") out.graceHours = Number(argv[++i]);
  }
  if (!Number.isFinite(out.graceHours) || out.graceHours < 0) out.graceHours = 6;
  return out;
}

async function main() {
  const { url, graceHours } = parseArgs(process.argv.slice(2));

  let status;
  try {
    status = await fetchStatus(url);
  } catch (e) {
    console.log(`UNKNOWN: could not read ${url}/api/status: ${e.message}`);
    process.exit(2);
  }
  const liveVersion = String(status.version || "");
  console.log(`Production status: ${status.status}, reports version: ${liveVersion}`);

  const lastApp = git(["log", "-1", "--format=%H %ct", "--", ...APP_PATHS]).split(" ");
  const appCommit = lastApp[0];
  const appCommitAgeHours = (Date.now() / 1000 - Number(lastApp[1])) / 3600;
  const appSubject = git(["log", "-1", "--format=%h %s", appCommit]);
  console.log(`Latest merged app-code commit: ${appSubject} (${appCommitAgeHours.toFixed(1)}h ago)`);

  let liveResolved = false;
  let treeMatchesMain = false;
  let appCommitIsInLive = false;
  // Only a bare commit hash counts. A word like "unknown" or "dev" must never resolve
  // through a branch or tag name that happens to exist in the repository.
  const looksLikeSha = /^[0-9a-f]{7,40}$/i.test(liveVersion);
  if (looksLikeSha) {
    let liveCommit = "";
    try {
      liveCommit = git(["rev-parse", "--verify", `${liveVersion}^{commit}`]);
      liveResolved = true;
    } catch (e) {
      liveResolved = false;
    }
    if (liveResolved) {
      // A real git failure is rethrown so the crash handler reports it as UNKNOWN (exit 2).
      try {
        git(["diff", "--quiet", liveCommit, "HEAD", "--", ...APP_PATHS]);
        treeMatchesMain = true; // exit 0 = identical app-code content
      } catch (e) {
        if (e.status !== 1) throw e; // only exit 1 means "differs"
        treeMatchesMain = false;
      }
      try {
        git(["merge-base", "--is-ancestor", appCommit, liveCommit]);
        appCommitIsInLive = true;
      } catch (e) {
        if (e.status !== 1) throw e; // only exit 1 means "not an ancestor"
        appCommitIsInLive = false;
      }
    }
  }

  const result = evaluateDrift({ liveResolved, treeMatchesMain, appCommitIsInLive, appCommitAgeHours, graceHours });
  console.log(`${result.state}: ${result.reason}`);
  if (result.state === "DRIFT") {
    console.log(
      "Next step: find the owner of the production release. Do not merge unrelated app changes until this is resolved or the cause is understood.",
    );
  }
  process.exit(result.exitCode);
}

module.exports = { evaluateDrift, APP_PATHS };

if (require.main === module) {
  // A crash must read as "cannot verify" (exit 2), never as DRIFT (exit 1).
  main().catch((e) => {
    console.log(`UNKNOWN: drift check crashed: ${e && e.message ? e.message : e}`);
    process.exit(2);
  });
}
