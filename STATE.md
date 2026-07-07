# STATE — vehicle-in-need (Pre-Order & Dealer Exchange Tracker)

> Per-repo memory file. The repo's single source of truth for "where is this project."
> Rewrite to current truth each working session — do NOT append session logs.

**Last updated:** 2026-07-07 - **By:** WORK PC / Codex - **HEAD:** auth hash-route login fix on main

---

## What this is

Internal vehicle order tracker for Priority Lexus Virginia Beach — tracks factory pre-orders, dealer exchanges, and allocation snapshots, with manager controls and role-based user management.

## Stack (frozen)

React 19 + Vite 7 + Tailwind 4 frontend · Firebase backend (Firestore, Cloud Functions, Auth) · Express server (`server/index.cjs`) containerized via Docker, deployed to Cloud Run · Node 22. Firebase project: `vehicles-in-need`.

## Current state — is it live?

- **AUTH HASH-ROUTE LOGIN FIXED (2026-07-07).** Starting Google sign-in from the dashboard hash URL (`/#/`) broke Firebase Auth because the SDK uses `location.href` as the auth redirect URL and Firebase rejects fragments (`INVALID_CONTINUE_URI: fragment not allowed`). `Login.tsx` now strips the hash before Firebase popup/redirect auth starts, stores the pending hash in sessionStorage, and restores it after popup/redirect completion so deep links still work after login. Verified with focused auth tests (`21/21`) and `npm run build` exit 0. Live pre-patch app was healthy at `46e553f`.
- 🟢 **DEPLOY FIXED + LIVE (2026-06-05).** K3 (`386d003`) + K8 (`3ec2ea1`) are deployed on Cloud Run: `https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/` (HTTP 200; served bundle `index-Dmute-Ae.js` contains the K3 OrderPreviewDrawer). The 6-day deploy outage is resolved. **Root cause was a 3-link auth/IAM chain, all now fixed:**
  1. WIF pool/provider deleted ~5/30 → primary auth dead (still dead; SA-key path is the live one).
  2. SA-key fallback referenced a non-existent secret `GCP_SA_KEY` → FIXED `0a96803` (now `${{ secrets.GCP_SA_KEY || secrets.GCP_CREDENTIALS }}`).
  3. `GCP_CREDENTIALS` secret now holds a valid `cloud-build-deployer` key (Rob created 2026-06-05, Claude set + vaulted at `env-vault/gcp-cloud-build-deployer-vehicle-in-need.md.enc`).
  4. `cloud-build-deployer` lacked actAs on the **default build SA** `842946218691-compute@developer.gserviceaccount.com` (the SA `gcloud builds submit` runs the build as). Rob granted `roles/iam.serviceAccountUser` 2026-06-05 → push + deploy work (the compute-default SA already holds AR Writer + Cloud Run deploy perms). (A transient mis-step pinned the build to `pre-order-dealer-exchange-860`, which lacked AR Writer — reverted `9201899`.)
  5. Post-deploy "Verify image in Artifact Registry" + "Inspect image" workflow steps made `continue-on-error` (`49a3b45`) — they needed AR read/pull perms the deployer SA lacks and were red-marking successful deploys; the real deploy is verified upstream by Wait-for-build-completion.
- **Deploy is now self-sufficient: `git push origin main` → auto-builds + deploys.** Full runbook (two-SA model, restore-from-vault procedure) → `~/OneDrive/claude-sync/memory/reference_vehicle_in_need_deploy_auth.md`.
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
- **K4 — URL-driven filters → CLOSED 2026-06-05 (DOCUMENTED SCOPE BOUNDARY, no build; Codex-confirmed).** Decision: V-i-N intentionally does NOT serialize live filter state into the URL. It already has two deliberate mechanisms — (1) per-user PERSISTENT filter prefs via localStorage (`STORAGE_KEYS` + `persistSetting`, AllocationBoard.tsx:60-66/759-776), and (2) one-shot FOCUS deep-links (`?model`/`?view`/`?scrollTo`/`?dxModel`, consumed-and-cleared on load). Arbitrary "share my exact filtered view via URL" is out of scope: filters already persist, focus-sharing already covered, and live URL sync would create 3 competing sources of truth for a handful of internal managers with no demonstrated workflow. Codex (`codex-20260605-130828.md`) verdict = DOCUMENT, not build. Boundary documented in code at AllocationBoard.tsx (the URL-state comment block above the deep-link useEffect). **All K-items now resolved (K8 ✅ / K3 ✅ / K4 ✅-documented); K1/K7/K10 Rob-blocked.**
- **K3 — side panel preview → DONE (`386d003`, 2026-06-05).** New `components/OrderPreviewDrawer.tsx` (controlled vaul `direction="right"` Drawer, read-only) + `AllocationBoard.tsx` wiring (previewOrderId state + stale-id cleanup useEffect + 3 link→button swaps + drawer mount). Replaced the 3 "View ↗" new-tab links (strategy view Color-Match / Similar-Color / model-only sub-sections). Codex adversarial = SHIP (2 polishes applied). NOT added to log-view (:2152) or DealLog — strategy-view-only by design; revisit if Rob wants those rows to preview too.
- **K1 Firebase App Check / K7 Sheets sync / K10 PWA icons (192/512) → Rob-blocked** (auth perimeter / credential / asset-gen).

## What is NOT trustworthy yet

- 39 npm/dependabot vulnerabilities reported by GitHub on `main` (2 critical, 15 high, 19 moderate, 3 low — includes `functions/` subdir; up from the 18 noted 2026-05-17). Most require breaking dep changes (firebase-admin, firebase-tools, vite-plugin-node-polyfills). Do NOT fix without a tested upgrade window. Owner: Rob.
- Parser is robust but inherits the dealership-wide email lead-parsing fragility pattern (open-loops registry #1) — no canonical tested parser module.
- `~20` legacy root-level `*.md` design/deployment docs (Mar 2026, BRANCH_*/CLOUD_BUILD_*/IMPLEMENTATION_*) — likely stale, not pruned.

## Open loops (close or kill before new builds)

- [x] ✅ GCP deploy auth — FIXED 2026-06-05 (full chain: SA-key fallback wiring + cloud-build-deployer key vaulted + actAs on compute-default build SA + non-fatal post-checks). K3+K8 live.
- [ ] 39 dependabot vulnerabilities — decision: accept (breaking-change risk) or schedule a tested upgrade window. Owner: Rob.
- [ ] Stale root-level markdown docs (BRANCH_*, CLOUD_BUILD_*, IMPLEMENTATION_*) — prune or move to `docs/`.
- [x] ✅ K4 CLOSED 2026-06-05 — documented scope boundary (Codex-confirmed Path B, no build). All K-items resolved; only Rob-blocked K1/K7/K10 + 39 dependabot CVEs remain.

## Credentials / access needed

- GCP / Cloud Run — deploy via GitHub Actions (`build-and-deploy.yml`, Cloud Build) — have it (CI configured)
- Firebase project `vehicles-in-need` — Firestore, Functions, Auth — have it
- `ALLOCATION_API_KEY` — X-Api-Key for `processAllocationEmail`, secret v4 in GCP Secret Manager — have it
- Apps Script watcher — script ID `1aAe8DVQqFniVa3rLR1B7Aj4nh-5NyVsPeLmL6SJq-D3da8B6QMkP2J90`, Script Properties (CLOUD_FUNCTION_URL + ALLOCATION_API_KEY) set — have it
- Gmail account the watcher polls for Toyota/Lexus allocation PDFs — <unknown — confirm which mailbox>

## Next 3 actions

1. (Rob) Decide the 39 dependabot CVEs — accept (breaking-change risk) vs scheduled upgrade window.
2. (Rob-blocked) K1 Firebase App Check / K7 Sheets sync / K10 PWA icons (192/512).
3. No autonomous V-i-N work remains — K3/K4/K8 all resolved, deploy pipeline fixed.

## Decisions log (newest first)

- 2026-06-05 — K4 CLOSED as DOCUMENTED SCOPE BOUNDARY (no build). Codex-confirmed (`codex-20260605-130828.md`): live filter→URL sync is product creep (filters already localStorage-persist; deep-links cover focus-sharing; 3-sources-of-truth complexity for undemonstrated workflow). Boundary documented in AllocationBoard.tsx URL-state comment block. **V-i-N K-series fully resolved.** Also: deploy pipeline FIXED this session (6-day GCP-auth outage) — see 'Current state'.
- 2026-06-05 — K3 shipped `386d003` (WORK): in-place side-panel order preview (vaul `direction="right"` Drawer) replaced the 3 strategy-board "View ↗" new-tab links. Codex adversarial = SHIP. K-queue now: K4 = last autonomous item; K1/K7/K10 Rob-blocked. Push needed `--reset-author` to `robbrascojr@gmail.com` (WORK PC GH007 email-privacy block per `feedback_cross_pc_git_transfer.md`).
- 2026-06-04 — K8 closed: DX sub-panel skeleton shipped `3ec2ea1`; main board skeleton was already live. K-queue corrected after Rule-18 already-built check (K4 found largely-built, K8 ~done, only K3 genuinely unbuilt).
- 2026-05-05 — Switched email pipeline from Drive OCR to base64 PDF — Drive OCR hit rate limits.
- 2026-05-05 — Toyota DM qty>1 handled as two identical-spec rows, both slots independently linkable — no Firestore schema change needed.

---
*Update this file at the end of every session that changed the project.*
