# STATE — vehicle-in-need (Pre-Order & Dealer Exchange Tracker)

> Per-repo memory file. The repo's single source of truth for "where is this project."
> Rewrite to current truth each working session — do NOT append session logs.

**Last updated:** 2026-06-05 · **By:** WORK PC / Claude · **HEAD:** `386d003`

---

## What this is
Internal vehicle order tracker for Priority Lexus Virginia Beach — tracks factory pre-orders, dealer exchanges, and allocation snapshots, with manager controls and role-based user management.

## Stack (frozen)
React 19 + Vite 7 + Tailwind 4 frontend · Firebase backend (Firestore, Cloud Functions, Auth) · Express server (`server/index.cjs`) containerized via Docker, deployed to Cloud Run · Node 22. Firebase project: `vehicles-in-need`.

## Current state — is it live?
- 🔴 **DEPLOY PIPELINE BROKEN (GCP auth) — `main` HEAD code is NOT live on Cloud Run.** The Cloud Run URL `https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/` still serves the LAST SUCCESSFULLY-DEPLOYED build (pre-2026-05-30), NOT current `main`. Discovered 2026-06-05 (WORK) via `gh run list`: the "Build and Push Container (Cloud Build)" job FAILS on every `push` to `main` at the "Fail on auth failure for push events" step — GCP authentication (Workload Identity Federation OR `GCP_SA_KEY`) is not succeeding. **K8 `3ec2ea1` and K3 `386d003` are committed to repo but NEITHER reached Cloud Run** (HOME's 2026-06-04 "auto-deployed to Cloud Run" claim for K8 was incorrect — that build failed the same way; `pull_request`/dependabot runs only LOOKED green because they SKIP the build on auth-fail instead of hard-failing). **ROB ACTION REQUIRED** (GCP console): re-bind the Workload Identity pool/provider OR rotate `GCP_SA_KEY` GitHub secret + confirm the service account has `roles/cloudbuild.builds.editor` + `roles/run.admin` + Artifact Registry push. Workflow auth steps: `.github/workflows/build-and-deploy.yml:93-145` (validate) + `:170-200` (auth + fail-on-push). Until fixed, code lands in `main` but does NOT go live.
- Last COMMITTED: `386d003` (2026-06-05) — K3 side-panel order preview (vaul `direction="right"` Drawer replaces the 3 "View ↗" new-tab links; in-place full-order detail). Prior: `3ec2ea1` (2026-06-04) K8 skeleton · `32d7e41` (2026-05-05) pdf-parse v2 fix. **Last build actually LIVE on Cloud Run = unknown; ≤ last green push-deploy before ~2026-05-30.**
- Deploy mechanism (INTENDED): `git push origin main` → GitHub Actions (Cloud Build) → Cloud Run. **Currently NON-FUNCTIONAL — see above.** A manual `gcloud run deploy` from a machine with GCP creds is the interim path if Rob wants K3/K8 live before fixing CI.
- Build/CI: `npm run build` green (vite build + CSS-in-build verify). NOTE: bare `npx tsc --noEmit` reports pre-existing errors in TEST files only (`components/__tests__/OrderList.test.tsx` Order-mock typing; `functions/src/__tests__/setManagerRole.test.ts` jest-namespace) — these are excluded from the production vite build and are NOT regressions.

## What works (trustworthy)
- Allocation board live — robust PDF parser, verified end-to-end (Allocation 051, 59 vehicles)
- Email automation pipeline LIVE — Apps Script watcher (5-min trigger) → `processAllocationEmail` Cloud Function (us-central1) → Firestore `allocationSnapshots`
- Vehicle linking: ID-mismatch, orphaned-link, multi-slot qty>1 bugs all fixed
- Role-based access (manager vs user), service worker auto-update, Firestore rules tested
- Loading skeletons: main allocation board (`isLoading`) + DX sub-panel both render accessible animate-pulse skeletons (K8 complete)

## K-series queue — VERIFIED against source 2026-06-04 (was stale; corrected)
The K1-K10 queue in the claude-sync spine was stale. Grep-verified current status:
- **K8 — VIN loading skeletons → DONE.** Main board skeleton was already shipped; DX sub-panel skeleton closed `3ec2ea1`. App-level `<LoadingSpinner />` (App.tsx:936) is the correct app-shell bootstrap phase — intentionally NOT a board skeleton (route unknown at that point).
- **K4 — URL-driven filters → LARGELY ALREADY BUILT.** `AllocationBoard.tsx` already wires `useSearchParams` for `model`/`view`/`scrollTo`/`dxModel` (≈lines 886-918); App.tsx has `highlight`. Remaining is a verify-and-gap-fill task (confirm shareable-state coverage for the in-board filter chips: category/model/rank/bos/search at AllocationBoard.tsx ≈1942), NOT a from-scratch build.
- **K3 — side panel preview → DONE (`386d003`, 2026-06-05).** New `components/OrderPreviewDrawer.tsx` (controlled vaul `direction="right"` Drawer, read-only) + `AllocationBoard.tsx` wiring (previewOrderId state + stale-id cleanup useEffect + 3 link→button swaps + drawer mount). Replaced the 3 "View ↗" new-tab links (strategy view Color-Match / Similar-Color / model-only sub-sections). Codex adversarial = SHIP (2 polishes applied). NOT added to log-view (:2152) or DealLog — strategy-view-only by design; revisit if Rob wants those rows to preview too.
- **K1 Firebase App Check / K7 Sheets sync / K10 PWA icons (192/512) → Rob-blocked** (auth perimeter / credential / asset-gen).

## What is NOT trustworthy yet
- 39 npm/dependabot vulnerabilities reported by GitHub on `main` (2 critical, 15 high, 19 moderate, 3 low — includes `functions/` subdir; up from the 18 noted 2026-05-17). Most require breaking dep changes (firebase-admin, firebase-tools, vite-plugin-node-polyfills). Do NOT fix without a tested upgrade window. Owner: Rob.
- Parser is robust but inherits the dealership-wide email lead-parsing fragility pattern (open-loops registry #1) — no canonical tested parser module.
- `~20` legacy root-level `*.md` design/deployment docs (Mar 2026, BRANCH_*/CLOUD_BUILD_*/IMPLEMENTATION_*) — likely stale, not pruned.

## Open loops (close or kill before new builds)
- [ ] 🔴 **GCP auth broken → Cloud Run deploy non-functional on push-to-main** (discovered 2026-06-05). Both K8 + K3 committed but not live. Owner: Rob (GCP console — WIF re-bind or `GCP_SA_KEY` rotation). See "Current state — is it live?" above. **This blocks ALL future V-i-N deploys — fix before treating any new V-i-N commit as "live."**
- [ ] 39 dependabot vulnerabilities — decision: accept (breaking-change risk) or schedule a tested upgrade window. Owner: Rob.
- [ ] Stale root-level markdown docs (BRANCH_*, CLOUD_BUILD_*, IMPLEMENTATION_*) — prune or move to `docs/`.
- [ ] K4 verify-and-gap-fill: confirm in-board filter chips (category/model/rank/bos/search) persist to URL for shareable state, or document the intentional scope boundary. **← now the only remaining autonomous K-item (K3 shipped `386d003`).**

## Credentials / access needed
- GCP / Cloud Run — deploy via GitHub Actions (`build-and-deploy.yml`, Cloud Build) — have it (CI configured)
- Firebase project `vehicles-in-need` — Firestore, Functions, Auth — have it
- `ALLOCATION_API_KEY` — X-Api-Key for `processAllocationEmail`, secret v4 in GCP Secret Manager — have it
- Apps Script watcher — script ID `1aAe8DVQqFniVa3rLR1B7Aj4nh-5NyVsPeLmL6SJq-D3da8B6QMkP2J90`, Script Properties (CLOUD_FUNCTION_URL + ALLOCATION_API_KEY) set — have it
- Gmail account the watcher polls for Toyota/Lexus allocation PDFs — <unknown — confirm which mailbox>

## Next 3 actions
1. (Rob) Decide on the 39 dependabot vulnerabilities (accept vs. schedule upgrade window).
2. K4 verify-and-gap-fill OR document the filter-chip URL-persistence scope boundary — last autonomous K-item.
3. (Rob-blocked) K1 Firebase App Check / K7 Sheets sync / K10 PWA icons.

## Decisions log (newest first)
- 2026-06-05 — K3 shipped `386d003` (WORK): in-place side-panel order preview (vaul `direction="right"` Drawer) replaced the 3 strategy-board "View ↗" new-tab links. Codex adversarial = SHIP. K-queue now: K4 = last autonomous item; K1/K7/K10 Rob-blocked. Push needed `--reset-author` to `robbrascojr@gmail.com` (WORK PC GH007 email-privacy block per `feedback_cross_pc_git_transfer.md`).
- 2026-06-04 — K8 closed: DX sub-panel skeleton shipped `3ec2ea1`; main board skeleton was already live. K-queue corrected after Rule-18 already-built check (K4 found largely-built, K8 ~done, only K3 genuinely unbuilt).
- 2026-05-05 — Switched email pipeline from Drive OCR to base64 PDF — Drive OCR hit rate limits.
- 2026-05-05 — Toyota DM qty>1 handled as two identical-spec rows, both slots independently linkable — no Firestore schema change needed.

---
_Update this file at the end of every session that changed the project._
