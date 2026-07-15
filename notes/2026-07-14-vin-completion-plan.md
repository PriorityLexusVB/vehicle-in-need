# V-i-N Completion Plan — 2026-07-14 (3-hour autonomous window)

**Origin:** 3-reviewer audit (2 agents + Codex) found a real live bug + hardening items.
**Grant:** explicit 3-hour autonomous window, full completion, no soft stops, maximize agents/Codex, meticulous visual + functional-flow verification.

## GOAL (measurable — "done" =)

1. **Parser parity:** the two allocation parser copies (`src/utils/allocationParser.ts` = REFERENCE, `functions/src/allocationParser.ts` = live ingestion) produce **byte-identical `vehicles[]` records** for a golden allocation fixture — proven by a parity test that runs BOTH copies. Functions copy uses the content-stable hash IDs + per-unit expansion + detectQuantity guard.
2. **Automation idempotency:** stale-reservation reclaim on new-order notifications (no silent-dropped manager email); per-order reminder ack (no batch poisoning).
3. **isLatest singleton** transactionally guaranteed (no 2-latest race).
4. **DX failure surfaced** on the board (error/loading propagated; section + Refresh stay visible).
5. **setManagerRole** callable domain-gated (defense-in-depth).
6. **Verified:** functions build+test green, root `npm test` green, tsc clean, rules-tests green (CI), **Codex SHIP (iterate-to-clean) on every code diff**, and **meticulous visual verification** of every surface at 375/768/1366/1920 (size/line fit, element presence, no overflow/dead-space, cross-surface consistency) + a full user-functionality-flow trace, lead-reviewed screenshot-by-screenshot.
7. **Deployed** (functions/rules/app as needed) + live read-back + deploy-safety (project parity + CallDrip collateral smoke + served-bundle==HEAD).
8. **Continuity:** STATE.md + plan updated; no regression; no other-app impact; **email header-parsing UNTOUCHED**.

## GUARDRAILS (hard)

- **Do NOT change email HEADER parsing** in either parser. The #1 fix changes ONLY the vehicle-ID scheme + record shaping in the STALE `functions/` copy to MATCH the reference — never the reference, never the header/line detection.
- **No other-app impact:** V-i-N = Firebase `vehicles-in-need` + Cloud Run `gen-lang-client`. Sales Tracker = Supabase. Physically isolated. Touch nothing outside this repo.
- **No regression:** every wave gated by the parity test + tests + Codex before commit; nothing merges/deploys red.
- **Verify before commit**, always. Codex on every code diff, iterate-to-clean.

## PHASES (each = build → verify [tests+Codex] → commit → next)

### P1 — Parser parity (the #1 live bug: positional IDs orphan customer links every allocation update)
- **P1a (SAFE, first):** golden-fixture parity test — run a real allocation email text through BOTH `parseAllocationSource` copies, assert identical `vehicles[].{id,quantity,code,model,color,...}`. This PROVES the divergence + is the regression net. No parser edit. Run it → expect FAIL (proves the bug).
- **P1b (the fix, with grant):** port `hashString` + `buildVehicleIdBase` + `normalizeVehicleIdPart` + per-unit expansion loop + detectQuantity `/`-`-` guard from the reference into `functions/src/allocationParser.ts`. Header/line-detection logic untouched. Sync the inlined `LEXUS_ALLOCATION_REFERENCE` (currently identical; import from src if feasible, else assert-equal test).
- **P1c verify:** parity test GREEN (both copies now identical); `npm --prefix functions run build` + functions test; root `npm test`; tsc; Codex adversarial iterate-to-clean on the functions diff.

### P2 — isLatest singleton — **DEFERRED (lead decision, documented)**
A true singleton needs a pointer-doc refactor of the core allocation read/write model (Firestore transactions can't transactionally read the `where isLatest==true` query, so the query-read-then-write race is inherent to the field-based model). Both write paths hit it (`allocationEmailFunction.ts` batch; `allocationService.ts` runTransaction-over-non-transactional-getDocs). BUT the issue is **RECOMMENDED, self-healing, and UI-safe**: the read path is `orderBy publishedAt desc limit 1`, so a transient 2-latest always resolves to the newest and the next publish re-collapses the set. Weekly-serialized ingestion makes concurrency rare. **Decision: do NOT refactor the core model for a self-healing edge case in a 3-hour no-regression window.** Documented as an accepted limitation in STATE.md. (A lower-risk future win: LockService on the Apps Script watcher + a message-id-based dedup doc-id — but the watcher is a Rob-paste file, deferred.)

### P1d — Migration/reconciliation (Codex OVERRODE my accept-re-link call — adopted)
The cutover orphans ALL active links AT ONCE (100% positional→hash mismatch), a mass simultaneous double-booking window — worse than the gradual weekly drift. So a reconciliation IS required. It IS feasible: the current latest snapshot's vehicle records carry the fields (code/color/grade/sourceCode/bos/options), so re-running `buildVehicleIdBase` on them yields each car's hash ID → a positional→hash map. Steps (careful, live-data, reversible):
1. **Backup** current latest snapshot + all `vehicle_links` + active orders' `allocatedVehicleId` (read to a dated JSON).
2. Compute positional→hash map for the current latest snapshot's vehicles.
3. **Dry-run**: print the map + which links/orders migrate + flag any ambiguous (two vehicles → same hash).
4. **Apply** (Firestore REST + owner token, which bypasses rules via IAM): rewrite the snapshot's `vehicles[].id` to hash; recreate each `vehicle_links` doc under its hash ID (same orderId/linkedAt/linkedByUid) + delete the positional doc; update the order's `allocatedVehicleId`/`allocatedVehicleInfo`. Snapshot + links stay consistent (both hash) → next hash-ID email continues cleanly.
5. **Verify**: zero orphan links (every `vehicle_links` id ∈ new snapshot hash-id set); backup retained for rollback.
Timing: the snapshot stays positional (+ links positional = consistent) until the NEXT email; do the deploy + reconciliation before the next ingest. firebase CLI is authed (`rob.brasco@priorityautomotive.com`) → `npm run deploy:functions` works (no CI functions path exists — Codex #8).

### Codex plan-review reconciliations (2026-07-14, `codex-20260714-211229.md`)
- ADOPTED: P1d migration (above); parity test upgraded to a REAL Toyota-DM golden fixture + reference-table drift guard + functions-side coverage (P1c); DX header validation added to P4; reminder `LockService` added to the `.gs` (Rob-paste, flagged); "tsc clean" → "no NEW app-code tsc errors."
- P2 isLatest: Codex pushed to fix both paths via a metadata/latest-pointer. Lead call: still DEFER (self-healing, RECOMMENDED; a core-model refactor is disproportionate risk in this window) — noted as the #1 follow-up with Codex's dissent recorded.

### P3 — Automation idempotency
- Stale-reservation reclaim: `isNewOrderNotificationDue` treats a reservation with no `sentAt` older than N min as due again (`orderNotifications.cjs`).
- Per-order reminder ack: replace the single `db.batch()` with per-order transaction + existence guard (`unsecuredOrderReminders.cjs`).
- Verify: server tests, Codex.

### P4 — UI hardening
- DX failure visible: propagate App's DX error/loading into `AllocationBoard`; keep the DX section header + Refresh rendered on empty/failed (`App.tsx` + `AllocationBoard.tsx`).
- (minor) orders loading skeleton to avoid empty-flash.
- Verify: build, tsc, root test, Codex.

### P5 — setManagerRole domain guard
- Gate the callable on caller + target `@priorityautomotive.com` (`functions/src/index.ts`).
- Verify: functions build+test, Codex.

### P6 — Meticulous visual + functional-flow verification (throughout + final)
- Harness screenshots (`node preview/shot.mjs`) board + orders at 375/768/1366/1920 + live-login shots.
- **Meticulous checks per surface:** text fits its container (no clip/overflow at 375), no dead space, every intended element present + non-zero-height, cross-surface entity consistency (received/linked counts, model keys), no horizontal overflow, console-error-free.
- **User-flow trace:** login → board (filters/sort/powertrain/link/unlink two-step confirm) → order create/edit/status → dashboard "Received by Model" → DX pipeline (incl. failure state). Lead Reads every screenshot.

### P7 — Deploy + deploy-safety
- Functions (P1/P2/P3/P5) → `npm run deploy:functions` (or CI). Rules (if touched) → script. App (if components touched) → auto on merge.
- Read-back: parser behavior (re-ingest a fixture?), live app HTTP 200 + bundle==HEAD, ruleset if changed.
- Deploy-safety: project parity (functions→vehicles-in-need, app→gen-lang-client), CallDrip routes still mount (`server/index.cjs`), served-bundle==HEAD.

### P8 — Continuity + final report
- STATE.md current truth; this plan → outcomes; Rob checklist.

## Verification lineup per wave
release-auditor-equivalent (grep/build/tsc) + result-verifier-equivalent (field trace) + **Codex adversarial iterate-to-clean** + deterministic tests + (P6) lead visual review. Rules changes → CI emulator. Parser → the parity test is the deterministic gate.
