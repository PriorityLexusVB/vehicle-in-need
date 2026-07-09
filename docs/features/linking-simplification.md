# Vehicle-in-Need — Linking Model & Simplification Options

Status: DRAFT for Rob review (2026-07-08). Understanding pass before any linking rework.
Not a build authorization. Source: full code trace of the order↔allocation linking lifecycle.

## The app in one paragraph

Vehicle-in-Need answers one question for Priority Lexus Virginia Beach:
**"For each customer who ordered a car we don't have yet, which incoming car should we give them?"**
It holds two lists that meet in the middle:

- **Customer pre-orders** (`orders`): customer name, year/model/model-number, up to 3 exterior + 3 interior color choices, deposit, status (Factory Order / Locate / Dealer Exchange → Received / Delivered / "Secured").
- **Factory allocation** (`allocationSnapshots`): the monthly Toyota/Lexus DM allocation PDF is emailed in, auto-parsed, and split into **one record per incoming car** (`AllocationVehicle`).

A **manager's core job** is to **LINK** an incoming allocation car to the customer order it should fill. Reps submit and watch orders; managers do the matching and linking.

## How linking works today (plain English)

1. A **link** = one incoming car claimed for one customer order. Strictly **1 car ↔ 1 order**.
2. The app **auto-suggests** matches (never auto-links): it scores each incoming car against each order by model, then by color — **Exact / Close(partial) / Model-only**. The manager still clicks to confirm.
3. The link is stored in **two places at once**: a `vehicle_links/{vehicleId}` record AND fields on the order (`allocatedVehicleId`, etc.), written together in one transaction. The car's ID is the key, so the database physically prevents two orders claiming the same car.
4. **Securing/delivering an order RELEASES the car** (deletes the link, frees the slot). **Deleting an order** also releases it. **Unlinking** frees it manually.
5. Only managers can link/unlink.

## The 5 things that make it confusing (candidates to simplify)

### 1. Securing the deal makes the car "disappear" from the link  ⚑ biggest surprise

When you mark an order Received/Delivered/Secured, the app **deletes the link and frees the car** — on the theory that the allocation slot is now "used up." But a GM reasonably expects the opposite: *"I won this deal, the car is now firmly this customer's."* Today, a secured order shows **no** car association at all.

- **Options:** (a) keep as-is (secure = recycle slot); (b) secure **keeps** the car association as a permanent record (car is "delivered to X"); (c) secure keeps a read-only historical stamp but still frees the live allocation slot.
- **My recommendation: (b/c hybrid)** — keep the car↔customer association as history on the order (so "who got which car" is never lost), while the *live allocation board* stops showing that car as available. Matches how a GM thinks about a closed deal.

### 2. Two different "Link" buttons with different rules

You can link from the **order card** (only when status = Factory Order) OR from the **allocation board** (Factory Order **and** Locate). Same action, two UIs, inconsistent availability — "why can I link this one here but not there?"

- **My recommendation:** one linking affordance, one rule. Pick the board as the primary place (it's where you compare a car against all interested customers), keep the order card's as a shortcut with identical rules.

### 3. Two sources of truth that can drift

Every link lives on both the order and the `vehicle_links` record. They're kept in sync by transactions, but direct edits / CSV imports / legacy data have already produced an **orphan** (a Delivered order still "holding" a car with no matching link). Worse, the order-card screen computes "is this car taken?" as *order-field OR vehicle_links*, while the board uses *vehicle_links only* — so the two screens can disagree.

- **My recommendation:** make `vehicle_links` the **single** authority for "is this car taken?" everywhere; treat the order's `allocatedVehicleId` as a convenience mirror only. Add a tiny reconcile so an orphan can't mark a car falsely taken.

### 4. Too many words for "not available"

Today: "Vehicle Taken," "Linked elsewhere," "All claimed," "Linked to Another Customer" — four phrasings for overlapping states, plus match tiers "Color Match / Similar Color / model-only."

- **My recommendation:** two plain states — **Available** vs **Taken by {Customer}** — and rename match tiers to **Exact color / Close color / Model only**.

### 5. When several customers want the same car, no recommendation

The board lists all interested orders under a car (ranked by color-match) but gives **no tie-break** when it matters — deposit and order date are shown but not used to recommend who gets it.

- **My recommendation (optional):** a soft "suggested: {Customer}" using a simple, GM-approved rule (e.g., earliest order date, then largest deposit) — manager still decides.

## Scenario reference (what happens today)

| Scenario | Today | Friction |
| --- | --- | --- |
| Factory Order, unlinked, has matches | Link from card OR board | 2 entry points |
| Factory Order linked | Green "Linked ✓" (also the unlink button) | Confirm chip = destroy button |
| Locate order | Linkable from board only | Asymmetry, unexplained |
| Dealer Exchange order | Never allocation-linked (comes from a dealer trade) | Correct, but unexplained in UI |
| Order, no matching car | Manual search of full allocation list | No "waiting on future allocation" state |
| Several orders → one car | List ranked by color; pick one; others "Taken" | No tie-break recommendation |
| One order → several cars | Order appears under each car | No single "this customer's options" view |
| Car already claimed | 3 different "unavailable" labels | Inconsistent wording |
| qty>1 rows | New data = per-unit slots; legacy data ≠ | Hidden data-shape gap |
| Secure order | **Link deleted, car freed** | Counter-intuitive (see #1) |
| Delete order | Link released (guarded) | OK |
| Unlink | Frees car, no confirm dialog | Silent vs delete's confirm |

## PROPOSED MODEL — decisions I'm building (Rob can override any)

Building these on-branch, verified, NOT deployed. Each is reversible.

- **L1 — plain states + wording (safe copy).** "Vehicle Taken" / "All claimed" / "Linked to Another Customer" → **"Taken"**. "Linked elsewhere" (means THIS order already has a different car) → **"On another car"** (distinct meaning kept). Match tiers → **Exact color / Close color / Model only**.
- **L2 — one source of truth for "is this car taken?"** = the `vehicle_links` record, everywhere. Order cards stop using the `allocatedVehicleId`-union (which let a stale order field falsely mark a car taken). Fixes the board-vs-card drift.
- **L3 — one link rule.** The order-card link sheet appears for the SAME orders the board considers linkable (active, non-Dealer-Exchange), not just Factory Order — so the two surfaces stop disagreeing.
- **L4 — secured deal keeps its car as HISTORY (additive, low-risk).** When an order is secured, instead of erasing the car association, preserve a read-only `securedVehicleInfo` stamp on the order ("Delivered: {car}") while STILL freeing the live allocation slot (`vehicle_links` deleted). No Firestore-rules change, no slot-recycling behavior change — just stops losing the "who got which car" record. (If Rob wants secured cars to also stay OFF the board as "reserved," that's a follow-up rules change, flagged separately.)
- **L5 — unlink gets a confirm** (parity with delete; today unlink is silent).

## Deferred (need Rob's rule, not built blind)

- **Tie-break (#5):** auto-suggested winner when multiple customers want one car — needs the rule (order date? deposit? both?). Not built until Rob picks the rule.
- **Full secured=reserved rules change** (if Rob wants delivered cars to never recycle) — a Firestore-rules change, heavier gate.

## Open questions for Rob (won't block the build above)

1. **Secured (#1):** is L4 (keep history, still free the slot) right, or do you want delivered cars to stay RESERVED (never recycle)?
2. **Tie-break (#5):** want an auto-suggested winner? By order date, deposit, or both?
3. Anything about the real workflow I've mis-stated?

---

## STATUS — SHIPPED TO BRANCH (2026-07-08, NOT DEPLOYED)

All five slices built, verified, and pushed to `claude/vin-luxury-redesign-slice-1-4pxzyc`. Deploy is gated on Rob's screenshot approval.

| Slice | Commit | What landed | Lineup |
| --- | --- | --- | --- |
| L1 + L5 | `54d058b` | Plain Taken/Available wording + match tiers; two-step unlink confirm on the reachable OrderCard button (Codex caught my first attempt was dead code in `VehicleLinkSelector`). | result-verifier + Codex ×3 |
| L2 | `528f76c` | One source of truth for "car taken" = pure `vehicle_links` (dropped the stale-`allocatedVehicleId` union). | result-verifier + Codex |
| L3 | `0c59254` | One link-entry rule — `isAllocationLinkable` shared by the order card AND the board. | Codex |
| L4 | `43c9e17` | Secured deal keeps its car as read-only `securedVehicleInfo` history (slot still freed); owner-immutable rule guard. | result-verifier + Codex ×2 + release-auditor |

Whole-branch verification: build 0, test 381/381, lint 0-err, tsc-clean.

**Pre-deploy gate (L4):** `npm run test:rules` (Firestore-rules emulator) could not run on the build machine (no Java) — the new owner-immutability guard was verified by Codex + release-auditor static read + structural mirror of the tested `allocatedVehicleInfo` guard. Run `test:rules` before deploying `firestore.rules`.

## STILL OPEN — genuine Rob decisions (deliberately not built blind)

1. **Secured = history vs reserved.** Shipped L4 = keep history + still free the slot (car recycles). If delivered cars should stay RESERVED (never recycle back onto the board), that's a follow-up rules + board-filter change.
2. **Tie-break rule** for multiple customers wanting one allocation car — needs the business rule (order date? deposit? both?) before an auto-suggested winner can be built.
