# Vehicle-in-Need — DESIGN.md

> Minimum-viable design stub per `ai-ui-quality-loop.md` §"Minimum viable
> DESIGN.md". Vehicle-in-Need was the only active dealership product without
> one. Every token/pattern below is **extracted from the real codebase**
> (file:line cited) — nothing here is invented. Sections the code cannot
> answer are marked `OPEN`. This is a stub, not a finished spec: treat it as
> a LIVING guardrail (`ai-ui-quality-loop.md` Step 0) — a reasoned,
> evidence-backed improvement may override it; update this file in the same
> wave.
>
> Companion file: `STATE.md` (project truth/history). This file owns visual
> law only.

## Product Job

Internal order tracker for Priority Lexus Virginia Beach (`STATE.md:34`,
`README.md:10`): track factory pre-orders and dealer exchanges from creation
to delivery, and match incoming factory allocation against open customer
orders before a competitor rep can claim the same unit.

**What the user must decide in <5s, per role:**

- **Salesperson (non-manager):** "Is MY order still open, and did a matching
  vehicle just arrive?" — `/requests` shows only their own orders
  (`README.md:44-47`).
- **Manager:** "Which orders need action today, and which incoming allocation
  units are unclaimed / at risk of being lost to another store?" — `/`
  (dashboard) and `/allocation` (board) are the manager's two decision
  surfaces.

## Primary Surfaces

Extracted from `App.tsx:1089-1266` (route table):

| Route | Audience | Purpose |
| --- | --- | --- |
| `/` (Dashboard) | Manager only — non-managers `<Navigate>` to `/requests` (`App.tsx:1188`) | `DashboardStats` KPI strip + full order queue (`OrderList`) + Add Order / Import CSV toggles (`App.tsx:1092-1183`) |
| `/allocation` (Allocation Board) | Both roles (manager sees more — DX partners, matches tab) | Live factory-allocation snapshot vs. open orders; Strategy / Full Log / Matches tabs (`AllocationBoard.tsx:2026-2050`) |
| `/requests` | Non-manager only — managers `<Navigate>` to `/` (`App.tsx:1213`) | Order submission form + "Your Orders" list scoped to the creator (`App.tsx:1216-1249`) |
| `/admin` (Settings) | Manager only, `ProtectedRoute`-gated (`App.tsx:1252-1264`) | User/role management, manager toggle (`SettingsPage.tsx`) |
| Login | Unauthenticated | Google sign-in on the dark shell (`Login.tsx:353-357`) |

## Visual Hierarchy

What gets top weight, in order:

1. **The status of a specific order/vehicle** — `StatusBadge` (a pill, not a
   color-only cue) is present on every order row/card; it is the single
   highest-frequency glance target in the app.
2. **KPI counts** (Total Active / Awaiting Action / Secured Last 30d) —
   `DashboardStats.tsx:40-63`, large `text-3xl font-bold` numeral over a small
   uppercase label, the classic stat-card inversion (big number wins, label
   is secondary).
3. **The allocation provenance signal** — on `/allocation`, the
   Published/Publisher/Report-Date card (`AllocationBoard.tsx:1836-1849`) is
   the evidence a manager needs before trusting anything below it. The
   parse-Confidence badge is NOT beside it: it lives in the Parse Preview inside
   the manager panel, which starts closed (`AllocationBoard.tsx:577`,
   `1950-1966`). Corrected 2026-09-17.
4. **The order/vehicle identity line** (year + model + customer name) —
   secondary heading weight, always paired with the status pill.
5. **Everything else** (colors, options, deposit, notes) is detail-density
   content that earns its space only once 1-4 are read.

`OPEN: no numeric hierarchy spec (font-size ratio) exists in code — the
above is a description of what IS emphasized structurally, not a locked
scale. If a future pass wants a Sales-Tracker-style "1.25x minimum between
steps" rule, that is a new decision, not an extraction.`

## Palette Tokens With Jobs

**Two coexisting layers — document both, do not pretend only one exists.**

### Layer 1 — the locked "luxury redesign" tokens (`src/index.css:20-37`)

> Direction locked by product (comment block, `src/index.css:11-14`): light
> COOL operational canvas (no cream/tan/sand), dark GRAPHITE focal surfaces
> for vehicle/order cards, PLATINUM as the normal premium accent — **gold is
> NOT a default accent.**

| Token | Value | Job |
| --- | --- | --- |
| `--color-canvas` | `#eef2f6` | Page background for the app/login/loading shell (`App.tsx:1023`, `Login.tsx:353`, `LoadingSpinner.tsx:5`). Replaces a retired warm `#f6f1ea` cream shell — **do not reintroduce cream/tan/sand.** |
| `--color-canvas-elevated` | `#f8fafc` | Elevated neutral surface within the canvas layer. |
| `--color-graphite` | `#0e1418` | Focal dark surface — the header (`Header.tsx:71`), the login card (`Login.tsx:355`), and HIGH-SIGNAL cards on the Allocation Board (linked/matched vehicle rows get the dark band; plain available inventory stays light) (`AllocationBoard.tsx:1522-1618`). Warm near-black, deliberately **not navy** — the code comment cites the sister Sales Tracker app killing the same navy value for the same reason. |
| `--color-graphite-elevated` | `#1a1815` | One step lighter than graphite, for elevated content inside a dark island. |
| `--color-platinum` | `#cbd0d8` | Default prestige accent — active-nav fill (`Header.tsx:32,40`: `bg-platinum text-graphite`, i.e. platinum as a BACKGROUND fill with dark text, never as light-on-dark foreground text), model-total pills, "First in line" badge context. |

### Layer 2 — the chip/tone system used everywhere else (`components/ui/chipStyles.ts`)

This is the **canonical, reusable** semantic-color primitive — `chipClasses({tone, active, size})` renders a pill from a fixed `ChipTone` set. Prefer this over any ad-hoc Tailwind color literal for a new status/filter/action chip.

| Tone | Idle | Active | Job |
| --- | --- | --- | --- |
| `neutral` | `stone-200`/white/`stone-700` | `stone-900` fill, white text | Default/no-signal state (filter="all", inactive tab). |
| `brand` | `stone-200`/white | `stone-950` fill, white text | Primary navigation/tab selection (Strategy/Log view, powertrain filters) — `AllocationBoard.tsx:2031,2039,2085`. |
| `success` | `emerald-50`/`emerald-200` | `emerald-700` fill | Secured/Received/Delivered order status; "Matches" tab when matches exist — `StatusBadge.tsx:18-20`, `AllocationBoard.tsx:2048`. |
| `warning` | `amber-50`/`amber-200` | `amber-500` fill, dark ink | In-progress/needs-attention: `Locate`, `Dealer Exchange` statuses — `StatusBadge.tsx:16-17`, `OrderForm.tsx:310`, `OrderList.tsx:301`. |
| `danger` | `red-50`/`red-200` | `red-700` fill | Destructive/reset actions — "Reset View" filter clear (`AllocationBoard.tsx:2067`). **Not currently used for order status** — reserved for actions, not states. |

### Layer 3 — stat-card decoration colors (`DashboardStats.tsx:44-62`)

Explicit code comment confirms INTENT, not just usage: *"Amber is reserved
for the 'Awaiting Action' status card (attention), not decoration."*

- Neutral count → `bg-stone-100` (Total Active).
- Attention → `bg-amber-50` / `text-amber-700` (Awaiting Action).
- Earned/positive → `bg-emerald-50` / `text-emerald-700` (Secured Last 30d).

### Documented palette drift (fact, not a recommendation to silently "fix")

The chip-tone system (Layer 2) is **not** universally applied to status
color. Two other, divergent status-color maps exist in the same codebase:

1. ~~`components/OrderPreviewDrawer.tsx` local `STATUS_STYLES` map~~
   **RESOLVED 2026-09-17:** the drawer now renders `StatusBadge`. The old map
   showed Factory Order as a filled indigo pill (`StatusBadge` renders the
   `brand` idle tone, a white pill with a stone border) and Locate as neutral
   gray (vs `warning` amber), so the same order read differently on the card
   and in the drawer. The drawer only ever receives Factory Order or Locate
   orders (`AllocationBoard.tsx:694-703`, `isAllocationLinkable`).
2. `constants.ts:23-30` — `STATUS_COLORS`, an indigo/amber/emerald/stone map.
   **Confirmed dead code** — grepped with zero other references in the repo
   at doc time.

**Component Law (below) states the fix-forward rule**: new status-color UI
routes through `StatusBadge`/`chipClasses`, never a new literal map.

### Anti-slop guardrails already true in this codebase (do not undo)

- No raw `#000`/`#fff` found in the Tailwind config or `index.css`.
- No gold/`amber` used as decorative flourish — every amber usage found in
  this pass ties to an actual "needs attention" state.
- Cream/tan/sand explicitly retired (`src/index.css:22`) — reintroducing it
  is a regression, not a style choice.

## Typography Rules

- **Font:** Inter, weights 400/500/600/700, loaded via Google Fonts
  (`index.html:14-17`, `tailwind.config.js:8`). No secondary/display
  typeface exists in this codebase — do not invent one without a decision.
- **Headings:** `text-2xl font-bold` (section/page headers, e.g.
  `OrderForm.tsx:172`), `text-xl`/`text-lg font-bold` (card/modal titles),
  `text-3xl font-bold` reserved for the single largest number on a surface
  (stat-card value, `DashboardStats.tsx:19`).
- **Eyebrow label convention** (pervasive — found in 11 of the component
  files surveyed): `text-xs font-semibold uppercase tracking-wide
  text-stone-400` (or `text-stone-500`/`text-platinum` on dark). Used above
  a value or a section to name what it is without competing with it, e.g.
  `AllocationBoard.tsx:1829` (`Live Allocation`), `DashboardStats.tsx:66`
  (`Received by Model`).
- **Body:** `text-sm`/`text-xs`, `font-medium` for structured content
  (order-card field values, `OrderCard.tsx`), `font-semibold` for anything
  that also carries a status/emphasis.
- **Numerals:** no tabular-nums / monospace treatment found for money/VIN
  fields — `OPEN: worth deciding if MSRP/price columns should get
  tabular-nums for scan-ability; not currently applied anywhere.`

## Component Law

### Cards

- Default card radius: `rounded-lg` (93 occurrences — the dominant radius in
  the codebase). `rounded-xl` for section-level containers (the Allocation
  Board shell, `AllocationBoard.tsx:1825`). `rounded-full` exclusively for
  pills/chips/avatars/badges (52 occurrences). `rounded-2xl` is reserved for
  **overlays only** (modal, drawer) — never a plain content card. Using
  `rounded-2xl` on a resting card is a radius-hierarchy violation per
  `ai-ui-quality-loop.md` anti-slop #3.
- High-signal cards on the Allocation Board (a matched/linked vehicle) get
  the dark `graphite` band; plain available inventory stays light with a
  slim `border-l-graphite/40` accent (`AllocationBoard.tsx:1612-1622`) — this
  is the one place graphite is used as a CONTENT signal, not just chrome.

### Status

- **Status color is ALWAYS rendered via `StatusBadge` → `chipClasses`.**
  Never introduce a third literal color map (see "Documented palette drift"
  above). If a surface needs the drawer's own compact status pill, import
  `chipClasses` with the matching tone instead of a local `STATUS_STYLES`
  object.

### Forms (`OrderForm.tsx`)

- `FormField` pattern: label → input slot → **hint OR error, never both**
  (error replaces hint) — `OrderForm.tsx:42-48`. Error text: `text-xs
  text-red-600`.
- Input base class: `rounded-lg border bg-stone-50 p-2.5 ... focus:border-
  stone-500 focus:ring-2 focus:ring-stone-200` (`OrderForm.tsx:167`); the
  border flips to `border-red-500` on a field with an error.
- Submit button: full-width, `bg-stone-950`, disabled + `ButtonSpinner` +
  "Submitting..." while in flight, `disabled:opacity-50` (`OrderForm.tsx:326-
  343`).
- Success state: a dismissable-by-navigation (not manually closable) inline
  emerald banner — `bg-emerald-100 border-emerald-300 text-emerald-800` +
  `CheckCircleIcon`, `animate-fade-in-down` (`OrderForm.tsx:174-179`).

### Modals (`MatchPreviewModal.tsx`)

- `fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4`
  backdrop; `role="dialog"`; backdrop click closes via `onClose` on the
  outer div, content `stopPropagation()`s so clicking inside never closes it
  (`MatchPreviewModal.tsx:29-38`); `Escape` closes (`onKeyDown` on the
  backdrop, line 32). Close affordance is a top-right `X` icon button.
  Container radius: `rounded-2xl`, `bg-white`.

### Drawers (`OrderPreviewDrawer.tsx`, `VehicleLinkSelector.tsx`)

- Built on `vaul` (already a dependency — `package.json:64`), not a
  hand-rolled slide-panel. `Drawer.Overlay` = `fixed inset-0 z-50 bg-black/
  40`; `Drawer.Content` = `fixed bottom-0 right-0 top-0 z-50 ... sm:max-w-md
  sm:rounded-l-2xl` — right-side panel at `sm:`+, full-width sheet on
  mobile (`OrderPreviewDrawer.tsx:63-65`).

### Destructive actions — inline two-step confirm, never `window.confirm`

Every destructive/reversal action found (delete order, unlink vehicle,
mark-unsecured) uses the SAME inline pattern: an idle button that, on click,
swaps IN PLACE for a `Confirm` / `Cancel` (or "Yes, delete" / "Cancel") pair
— never a native browser `confirm()` and never a full modal for this class
of action (`OrderCard.tsx:596-620` delete; `OrderCard.tsx:639-666` unlink).
State resets on the card re-rendering with different data so a stale
"Confirm" can never reopen already-primed (`OrderCard.tsx:368-370` comment,
load-bearing).

### Empty states

Icon (muted `stone-400`, 48px `h-12 w-12`) + `text-sm font-semibold`
heading + `text-sm text-stone-500` explanatory subtext, centered
(`OrderList.tsx:330-358`). Copy is context-aware: distinguishes a genuinely
empty tab ("Orders will appear here once created.") from a filtered-to-empty
search ("No results for `"<query>"`. Try a different search term.") — never
a single generic "No data" string. The Allocation Board reuses the same
posture at a smaller weight: `text-sm text-stone-400`, "No vehicles match
current filters." (`AllocationBoard.tsx:2343`).

### Loading states

Full-page: centered `h-16 w-16 animate-spin` ring on `bg-canvas`, `role=
"status"` + visually-hidden "Loading..." text for a11y (`LoadingSpinner.tsx`).
Inline/button-level: `ButtonSpinner` (24x24 default, `animate-spin` SVG,
`currentColor`) swapped in next to a "…ing" verb ("Submitting...",
"Unlinking...") — never a bare disabled button with no in-progress signal.

### Error / alert banners

`ZeroManagerWarning.tsx` uses `role="alert"`, `bg-yellow-50 border-l-4
border-yellow-400`, dismissable via an `X`. **Note:** this predates and does
not match the `chipStyles` `warning` tone (`amber-*`, not `yellow-*`) — a
literal-color banner outside the tone system. Per the anti-slop precedence
rule ("undocumented uses of the same pattern are still flagged"), a NEW
alert banner should use the `warning` tone's amber values for consistency;
this existing one is grandfathered, not a template to copy.

Field-level form errors: see Forms above (`text-red-600`, replaces hint).

Parser errors on the Allocation Board: a plain bulleted red list,
`text-red-600`, directly under the confidence badges — not a banner, not a
toast (`AllocationBoard.tsx:1971-1976`).

## Interaction Law

- **Touch target floor:** per the ROB Design DNA skill, 44px is the shared
  house preference (WCAG 2.2 AA floor is 24px — never cite 44 as the AA
  minimum). Icon-only buttons are `h-11 w-11` with the icon centered; a
  button that gains a text label at `sm:` uses `min-h-11 min-w-11`. Close and
  dismiss glyphs need >=3:1 against their surface (`stone-500` on white,
  `yellow-700` on `yellow-50`), never `stone-400`/`yellow-500`. Raised to
  44px on 2026-09-17: the Header hamburger (was ~42px) and Sign Out (~36px),
  the order-preview drawer close (~32px, `-my-1.5` so it doesn't push the
  header row down), the DX dealer-history close (~32px), the match-preview
  close (~36px) and the zero-manager warning dismiss (~32px). The one
  exception is in the Override Register (the search clear button).
- **Destructive confirmation:** see Component Law above — inline two-step,
  always. Never introduce a native `confirm()` dialog or a full-screen modal
  for a delete/unlink/unsecure action; it would be inconsistent with every
  existing instance.
- **Primary next-action is always visible, never buried in a menu:** "Add
  New Order" / "Import CSV" are always-visible header buttons on the
  manager dashboard (`App.tsx:1108-1149`), and the non-manager's order form
  is always-rendered on `/requests` (`README.md:44`) — there is no
  "click to reveal the form" gate for the primary action of that surface.
- **Optimistic-vs-confirmed state is explicit:** buttons show their own verb
  while in flight (`Submitting...`, `Unlinking...`) rather than a generic
  spinner-only state, so the user always knows WHAT is pending, not just
  THAT something is pending.

## Trust/Evidence Rules

V-i-N's evidence problem is not "is this AI-generated" (BDC's problem) — it
is **"is this allocation data current, and can I trust the parse."** The
existing pattern already answers exactly that on the Allocation Board:

- **Source + timestamp, always paired:** every snapshot displays `Published:
  <timestamp>` / `Publisher: <email>` / `Report Date: <value>` as a
  three-line provenance card, never just a bare date
  (`AllocationBoard.tsx:1834-1846`). A snapshot with no publish event reads
  "Not published yet" (`formatTimestamp`, `AllocationBoard.tsx:518-522`) —
  never a blank or a fabricated "just now."
- **A confidence label, derived from real parse-quality signals, not
  vibes:** `deriveParseConfidence` (`AllocationBoard.tsx:488-515`) returns
  `High` / `Medium` / `Needs Review` from the actual warning count and TBD
  field count on that parse — rendered as a colored badge right next to the
  timestamp (`AllocationBoard.tsx:1963-1966`), with the raw warning/TBD
  counts shown alongside it, not hidden behind the label.
- **Parse errors are listed, not swallowed:** any `parsedResult.errors` are
  rendered as a literal bulleted list under the confidence badges
  (`AllocationBoard.tsx:1971-1976`) — the user can see exactly what failed
  to parse, not just a degraded confidence score.
- **Rule going forward:** any NEW data-derived claim on this board (a new
  match metric, a new aggregate) should carry the same three things —
  source/publisher, a timestamp, and a confidence-or-caveat — before it
  ships. A number with no provenance is not acceptable on this surface.

## Anti-References

Per the ROB Design DNA skill's project routing for Vehicle-in-Need: preserve
platinum canvas, graphite focal surfaces, white data panels, tight
operational density, restrained radius, restrained color. **Explicitly
reject:**

- Cream/tan/sand canvas (already retired once, `src/index.css:22`; do not
  reintroduce).
- Decorative gold as a default accent (gold is not part of this app's
  palette at all today — do not import it from Sales Tracker's
  legendary-tier gold convention).
- Generic gradients / glassmorphism-everywhere.
- DORIS identity, Ops Island styling, or a literal transplant of Sales
  Tracker's hero-card mechanics — those are different products' visual
  law, not V-i-N's.
- A fourth status-color map. If a surface needs status color, it uses
  `StatusBadge`/`chipClasses` — see Component Law.

## Mobile Rules

- **Header collapses to a hamburger below `md:`** (`Header.tsx:153`
  `md:hidden`); the expanded mobile menu is an accordion-style panel
  (`max-h-0` → `max-h-96`, `transition-all duration-200`) directly under the
  header, not an overlay (`Header.tsx:172`).
- **Allocation Board filters collapse to a toggle button below `lg:`**
  (`AllocationBoard.tsx:2093-2102` `lg:hidden`) that reports an active-filter
  count in its own label ("Filters (2)") rather than a bare "Filters" — the
  user knows before opening whether anything is currently narrowing the
  view.
- **Order-preview drawer goes full-width on mobile, fixed right-panel at
  `sm:`+** (`OrderPreviewDrawer.tsx:65` — no `sm:max-w-md` below `sm:`).
- **Minimum visible at 375px (LAW, 2026-09-17).** Required by the min-viable
  DESIGN.md spec and the Interaction Integrity contract. The real fold is
  375×650 (iPhone Safari with its bar), not 375×812. Without scrolling:
  - every route: the header row with the 44px menu button, and no horizontal
    overflow at the page root;
  - `/allocation`: the Published/Publisher/Report Date card (hierarchy item
    3) and the filter toggle with its active-filter count;
  - order-preview drawer: customer name, `StatusBadge` and the close button,
    pinned in the drawer header.
  Status: measured 2026-09-17 in the mock-data preview harness (real
  components, mocked services; not live screens, which need a test sign-in).
  At 375px: menu and Sign Out 44x44; no root horizontal overflow; the
  Published card and Filters toggle above the fold; drawer close 44x44, with
  badge and name aligned in the pinned drawer header.
  `OPEN` (a known gap, not met today): the first OrderCard's `StatusBadge` +
  identity line (hierarchy items 1 and 4) sits BELOW the 650px fold. On the
  manager orders view the stacked KPI cards push it to y=1192px (measured in
  the harness at 375px); on
  `/requests` the order form comes first. Whether to reorder is a product
  call.

## Override Register

One entry so far (2026-09-17) — this is still a stub, not a matured spec. Exceptions to the rules
above should be added here in this exact shape as they're decided:

| Pattern | Exception | Reason | Owner | Date |
| --- | --- | --- | --- | --- |
| Icon-only button 44px | Search clear button inside the orders search field is 40px (`h-10 w-10`, input `pr-11`) | An inline adornment can't exceed the 46px field without covering the border; 40px clears WCAG 2.2 AA (24px) | Design law (HOME) | 2026-09-17 |

The one former divergence from "always use `StatusBadge`"
(`OrderPreviewDrawer`'s local `STATUS_STYLES` map) was reconciled on
2026-09-17. No override is needed.

## Taste Ledger

Per the ROB Design DNA skill's preference-record discipline: one observation
is `OBSERVED`; repeated agreement may become `PROPOSED`; only Rob's current
explicit approval makes a cross-product rule `APPROVED`. No design-review
cycle has run against this repo under that discipline yet — an empty ledger
is valid for a stub.

### Approved

_(none yet)*

### Rejected

- PR #282 initial Dealer Exchange candidate (`outputs/vehicle-dx-primary-nav/full-flow/*-dealer-exchange.png`) — amber/cream pipeline card, pill cluster, generic table treatment, and horizontally incomplete mobile history made a working route feel flat, cheap, and unlike the Vehicle-in-Need system — `/dealer-exchange`, desktop and mobile — 2026-09-28.

### Open

*(none)*. The four questions listed here until 2026-09-17 were not taste
calls. Existing rules settled them, so they are resolved in place rather
than entered as Rob-approved taste:

- Hamburger to 44px: house target rule (Interaction Law).
- Drawer status colors: reconciled to `StatusBadge` (same entity must read
  the same across surfaces).
- 375px contract: required by the min-viable spec (Mobile Rules).
- `--color-platinum-strong`: 0 uses outside its own definition, removed
  from `src/index.css`.

## Cross-references

- `STATE.md` — project truth, deploy state, history (this file does NOT
  duplicate that).
- `src/index.css` — CSS variable source of truth for Layer-1 luxury tokens.
- `components/ui/chipStyles.ts` — canonical status/tone chip primitive.
- `sales-tracker/DESIGN.md` — the gold-standard SHAPE this stub follows
  (content is product-specific and NOT transplanted; per the ROB Design DNA
  skill, local project canon owns brand/palette/personality here).
- `C:/Users/rbras/.claude/rules/ai-ui-quality-loop.md` — the standing rule
  this stub satisfies (Lane A, dense operator UI — this repo's own
  DESIGN.md is now the law for future waves, per that rule's Step 0).
- `C:/Users/rbras/.claude/skills/rob-design-dna/SKILL.md` — the composition
  lens + project-routing guidance referenced throughout this doc.
