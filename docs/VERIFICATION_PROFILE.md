# V-i-N Verification Profile

> The single source of truth for how to verify Vehicle-in-Need. Every verifier
> agent is Sales-Tracker-shaped by default — **inject this profile's context** on
> dispatch so it doesn't assume ST's URL / creds / personas / gamification.
> Built 2026-07-13 (Codex-reviewed: `notes/codex-runs/codex-20260713-183559.md`).

## What V-i-N is (and isn't)

Internal operations tool for Priority Lexus VB — factory pre-orders, dealer
exchanges, allocation snapshots, manager controls. **Not gamified, not
customer-facing.** So the ST/rocket/marketing agents do **not** apply.

- **Stack:** React 19 + Vite 7 + Tailwind 4 · Firebase (Firestore/Auth/Functions) · Express on Cloud Run · Node 22.
- **Two-project split (load-bearing):** app DATA lives in Firebase project **`vehicles-in-need`** (`services/firebase.ts` projectId, `.firebaserc`). Cloud Run / Artifact Registry INFRA lives in **`gen-lang-client-0615287333`**. Firestore rules enforce per-project → rules deploy to `vehicles-in-need`; the app image deploys to Cloud Run in `gen-lang-client`. (A rules deploy once went to the wrong project — always check parity.)
- **Personas:** manager (role via `users/{uid}.isManager` or `isManager` custom claim) vs consultant/user. All real users are `@priorityautomotive.com` Google Workspace accounts.
- **Live URL:** `https://pre-order-dealer-exchange-tracker-rbnzfidp7q-uw.a.run.app`

## Hard guardrails (never violate)

1. **The allocation email parser is CORRECT — do NOT modify it.** `src/utils/allocationParser.ts` relies on very specific email headers. Verify it works; never "improve" it. NOTE: a duplicate copy lives at `functions/src/allocationParser.ts` — verify the two stay in **parity** (drift splits the board from ingestion).
2. **No other-app impact.** V-i-N is Firebase; Sales Tracker is Supabase; BDC/rocket are separate. A V-i-N Firestore-rules / Cloud-Run change is physically isolated — but the V-i-N Cloud Run service also mounts **CallDrip** routes, so a deploy must smoke-check it didn't break that adjacent surface.
3. **`npm run build` is bare `vite build` (no typecheck).** Always run `npx tsc --noEmit` explicitly. Known pre-existing tsc errors live only in test files (`OrderList.test.tsx` mock-cast, `functions/.../setManagerRole.test.ts` jest-namespace) — don't hard-fail on those; don't let a NEW app-code tsc error hide behind them.
4. **DX (Dealer Exchange) is a separate Google-Sheet trades list**, not allocation "received."

## Agent lineup

**Use (ops-appropriate):** `release-auditor`, `result-verifier`, `browser-tester`, `hostile-break-tester`, `reproduction-runner`, `clarity-auditor`, `sense-check`, `ui-polisher`/`polish-loop`, `site-researcher`, **+ Codex** (cross-model, mandatory on any rules/auth/logic change).

**Exclude (ST/rocket/marketing-shaped — do not run on V-i-N):** `gamification-psych`, `fun-checker`, `wow-polish-auditor`, `modern-ux-researcher`, `calendar-flow-specialist`, `vehicle-art-curator`, `organization-auditor`, all `seo-*`, all `robos-*`. The shared `/lineup` command is ST-flavored (its Tier 2 is `gamification-psych`) — use this profile's lanes instead.

## Existing infra to leverage (don't rebuild)

- **Unit:** `npm test` (Vitest, 381+ passing) — components/services/helpers.
- **Rules security:** `npm run test:rules` (`tests/firestore-rules/` — orders, users, allocations, vehicle-links, adminAuditLogs, order-notes, manager-self-timestamp, smoke). Emulator-based; **needs Java/JDK** — runs in CI ("Firestore Rules Tests"), NOT on a machine without Java.
- **Seed:** `npm run seed:managers` / `seed:options` (`scripts/seed-manager.mjs`) — seed accounts/options.
- **Mock screenshot harness (auth-free VISUAL only):** `preview/` + `node preview/shot.mjs` (stubs Firebase; renders board/orders at 375/768/1366/1920). `preview/shot-live-login.mjs` screenshots the live login. Requires Playwright chromium (`npx playwright install chromium`).
- **Emulators configured:** `firebase.json` has Auth + Firestore emulators (the answer to live functional E2E without prod Google-SSO creds).
- **CI (`.github/workflows/`):** build, tsc, lint, rules-tests, E2E (Playwright — currently unauthenticated/stale), CodeQL, UI Audit, gitleaks, gemini-review.

## The verification lanes

Two modes: **per-PR gate** (the must-have 3) vs **full certification** (all 8).

### Per-PR must-have 3

1. **Build/test gate** — `npm run build` (exit 0) + `npx tsc --noEmit` (no NEW app-code errors) + `npm test` + `npm run test:rules` (CI) + `npm --prefix functions run build` + functions test.
2. **Security/data-invariant probe** — token probes (anon / non-priority Google / priority user / manager) against rules; `securedVehicleInfo` owner-guard; `isLatest` singleton; qty>1; `auto-25` orphan.
3. **Real manager+user browser smoke** — login → board → link/unlink → order create/edit/status → dashboard → DX, at 375 + 1366/1920, service-worker cache-bust.

### Full certification (8 lanes)

1. **Build / type / bundle / deps** — release-auditor + gitleaks.
2. **Security & auth (server-enforced)** — emulator token probes prove domain + role + owner-guard hold at the DATA layer, not just React. Extend `tests/firestore-rules/`. hostile-break-tester + release-auditor + Codex. *(Domain enforcement added 2026-07-13 — see below.)*
3. **Data integrity & invariants** — orphan `vehicle_links`, dup orders, stale `auto-25`, `isLatest` singleton under concurrent ingestion, qty>1 legacy rows, **cross-surface received/linked count parity** (board = dashboard = order card). site-researcher + live DB read.
4. **Parser integrity (verify, never touch)** — golden real-email fixture → correct snapshot + **parity between the two parser copies**.
5. **Automation / jobs** — Cloud Run job endpoints (reminders, order-notifications — env-flag mounted), Apps Script send/**ack idempotency** + failed-send release + trigger presence, DX Google-Sheet CSV schema/freshness.
6. **Live functional E2E** — browser-tester against the Firebase **emulators** + `seed:managers` (real functional auth without live Google SSO), or real Workspace test accounts (gold standard). Every surface × 4 widths; `[TEST-VIN-*]` tagging + cleanup proof.
7. **UX / design / clarity (dense-ops calibrated)** — ui-polisher/polish-loop (graphite/platinum brand law, keyboard/scan speed, mobile fit), clarity-auditor (5-second scannability for a GSM), sense-check. Lead reads every touched-surface screenshot.
8. **Deploy safety** — project parity (rules→`vehicles-in-need`, app→`gen-lang-client`), served-bundle == HEAD, and a **CallDrip collateral smoke** (shared Cloud Run service).

Then **lead synthesis** (BLOCKER/REQUIRED/RECOMMENDED/REJECTED) → **Codex final** iterate-to-clean.

## Security status + known gaps

- **Domain enforcement (added 2026-07-13):** `isPriorityUser()` in `firestore.rules` gates the data paths that previously required only `isSignedIn()` (allocation read, `vehicle_links` read, order create) to `@priorityautomotive.com` tokens. Before this, ANY authenticated Google account could read allocation/`vehicle_links` or create orders via the SDK, bypassing the React UI. Verified by the emulator rules-tests in CI.
- **Future hardening (Rob-gated):** the gold-standard is an **Auth blocking function** (`beforeUserSignedIn` rejects non-domain) — enforces domain once at sign-in. Needs Identity Platform (GCIP) enabled on `vehicles-in-need` (a project/billing change → Rob decision). The rules-layer gate above is defense-in-depth that works without GCIP.
- **Test accounts:** no live Google-SSO test creds exist. Use the emulator + `seed:managers` for functional E2E; the gold standard is two real Workspace users (`vin.test.manager@` / `vin.test.user@`) that only Rob can create.
- **Playwright E2E is stale/unauthenticated** (`TODO: implement auth flow` in `e2e/manager-flow.spec.ts`) — repair against the emulator before treating it as a gate.

## Cross-references

- `notes/codex-runs/codex-20260713-183559.md` — Codex adversarial review that shaped these lanes.
- `STATE.md` — current live state + the allocation model-totals framing + parser guardrail.
- `docs/features/linking-simplification.md` — the linking design.
