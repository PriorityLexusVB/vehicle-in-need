# STATE — vehicle-in-need (Pre-Order & Dealer Exchange Tracker)

> Per-repo memory file. The repo's single source of truth for "where is this project."
> Rewrite to current truth each working session — do NOT append session logs.

**Last updated:** 2026-05-17 · **By:** HOME PC / Claude · **HEAD:** `650bd80`

---

## What this is
Internal vehicle order tracker for Priority Lexus Virginia Beach — tracks factory pre-orders, dealer exchanges, and allocation snapshots, with manager controls and role-based user management.

## Stack (frozen)
React 19 + Vite 7 + Tailwind 4 frontend · Firebase backend (Firestore, Cloud Functions, Auth) · Express server (`server/index.cjs`) containerized via Docker, deployed to Cloud Run · Node 22. Firebase project: `vehicles-in-need`.

## Current state — is it live?
- Deployed: yes — Cloud Run `https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/`
- Last shipped: `650bd80` — CSS-in-build verification utility script. Prior substantive ship `32d7e41` (2026-05-05) — pdf-parse v2 constructor fix; email-automation pipeline live end-to-end
- Build/CI: green — `git status` clean, `main` up to date with `origin/main` (HOME pulled up 2026-05-17)

## What works (trustworthy)
- Allocation board live — robust PDF parser, verified end-to-end (Allocation 051, 59 vehicles)
- Email automation pipeline LIVE — Apps Script watcher (5-min trigger) → `processAllocationEmail` Cloud Function (us-central1) → Firestore `allocationSnapshots`
- Vehicle linking: ID-mismatch, orphaned-link, multi-slot qty>1 bugs all fixed
- Role-based access (manager vs user), service worker auto-update, Firestore rules tested

## What is NOT trustworthy yet
- 18 npm vulnerabilities remain — all require breaking dep downgrades (firebase-admin, firebase-tools, vite-plugin-node-polyfills). Do NOT fix without testing.
- Parser is robust but inherits the dealership-wide email lead-parsing fragility pattern (open-loops registry #1) — no canonical tested parser module.
- `~50` legacy root-level `*.md` design/deployment docs (Mar 2026) — likely stale, not pruned.

## Open loops (close or kill before new builds)
- [ ] 18 npm vulnerabilities — decision: accept (breaking-change risk) or schedule a tested upgrade window. Owner: Rob.
- [ ] Stale root-level markdown docs (BRANCH_*, CLOUD_BUILD_*, IMPLEMENTATION_*) — prune or move to `docs/`.
- [ ] No open Dependabot PRs noted in memory — confirm against GitHub.

## Credentials / access needed
- GCP / Cloud Run — deploy via GitHub Actions (`build-and-deploy.yml`, Cloud Build) — have it (CI configured)
- Firebase project `vehicles-in-need` — Firestore, Functions, Auth — have it
- `ALLOCATION_API_KEY` — X-Api-Key for `processAllocationEmail`, secret v4 in GCP Secret Manager — have it
- Apps Script watcher — script ID `1aAe8DVQqFniVa3rLR1B7Aj4nh-5NyVsPeLmL6SJq-D3da8B6QMkP2J90`, Script Properties (CLOUD_FUNCTION_URL + ALLOCATION_API_KEY) set — have it
- Gmail account the watcher polls for Toyota/Lexus allocation PDFs — <unknown — confirm which mailbox>

## Next 3 actions
1. Decide on the 18 npm vulnerabilities (accept vs. schedule upgrade window).
2. Prune the stale root-level `*.md` docs into `docs/` or archive.
3. Confirm GitHub for any open Dependabot PRs before the next build.

## Decisions log (newest first)
- 2026-05-05 — Switched email pipeline from Drive OCR to base64 PDF — Drive OCR hit rate limits.
- 2026-05-05 — Toyota DM qty>1 handled as two identical-spec rows, both slots independently linkable — no Firestore schema change needed.

---
_Update this file at the end of every session that changed the project._
