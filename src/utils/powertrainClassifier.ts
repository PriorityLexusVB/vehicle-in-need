/**
 * Powertrain classifier (pure, UI-agnostic).
 *
 * Derives a single powertrain bucket for an allocation vehicle OR an order so
 * the allocation toolbar can offer Hybrid and Plug-in controls alongside the
 * broader Electrified umbrella. Classification never relies on `category` alone
 * (the parser's category may say SUV/Sedan/Luxury SUV and miss powertrain) or
 * on snapshot-level `hybridMix`; it normalises every identifying string field
 * (model, code, sourceCode, grade, type, engine) and applies Lexus naming
 * rules.
 *
 * Buckets (per redesign plan):
 *   - Plug-in Hybrid: PHEV / plug / plug-in / "h+" naming (RX 450h+, TX 550h+).
 *   - EV:             EV / BEV / RZ series.
 *   - Hybrid:         "hybrid" or a model/code ending in "h" without "+"
 *                     (RX 350h, ES 300h, NX 350h, TX 500h, UX 300h).
 *   - Gas:            everything else.
 *
 * Electrified = Hybrid ∪ Plug-in Hybrid ∪ EV. `Electrified` stays the umbrella;
 * it is not replaced by Hybrid.
 */

export type Powertrain = "Gas" | "Hybrid" | "Plug-in Hybrid" | "EV";

/** Display-ordered buckets. */
export const POWERTRAINS: readonly Powertrain[] = [
  "Plug-in Hybrid",
  "Hybrid",
  "EV",
  "Gas",
] as const;

/**
 * Identifying fields used for classification. Works for an allocation vehicle
 * (model/code/type/engine/...) or an order (model/modelNumber via `code`).
 */
export interface PowertrainInput {
  model?: string | null;
  code?: string | null;
  sourceCode?: string | null;
  grade?: string | null;
  type?: string | null;
  engine?: string | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Normalised space-joined blob of every identifying field. */
function haystack(vehicle: PowertrainInput): string {
  return [
    vehicle.model,
    vehicle.code,
    vehicle.sourceCode,
    vehicle.grade,
    vehicle.type,
    vehicle.engine,
  ]
    .map(norm)
    .filter(Boolean)
    .join(" ");
}

// --- Raw signal detectors (private) — used for bucket precedence only. ---

/** Plug-in signal: PHEV / plug / plug-in / "…h+" naming. */
function plugInSignal(hay: string): boolean {
  // "h+" catches 450h+/550h+ tokens; phev/plug catch the spelled-out forms.
  return /\bphev\b/.test(hay) || /plug/.test(hay) || /h\+/.test(hay);
}

/** EV signal: EV / BEV / RZ series. */
function evSignal(vehicle: PowertrainInput, hay: string): boolean {
  if (norm(vehicle.engine) === "ev") return true;
  return /\bb?ev\b/.test(hay) || /\brz\w*/.test(hay);
}

/** Hybrid signal: "hybrid" or a "…<digit>h" naming without a trailing "+". */
function hybridSignal(hay: string): boolean {
  // The negative lookahead keeps "450h+" out of the plain-hybrid signal.
  return /\bhybrid\b/.test(hay) || /\dh(?!\+)\b/.test(hay);
}

/**
 * Classify into a single bucket. Precedence: Plug-in > EV > Hybrid > Gas.
 * Plug-in is checked first so "h+" naming never falls through to Hybrid.
 */
export function derivePowertrainBucket(vehicle: PowertrainInput): Powertrain {
  const hay = haystack(vehicle);
  if (plugInSignal(hay)) return "Plug-in Hybrid";
  if (evSignal(vehicle, hay)) return "EV";
  if (hybridSignal(hay)) return "Hybrid";
  return "Gas";
}

// --- Public predicates — bucket-consistent (mutually exclusive). ---

/** True only for plug-in hybrids (bucket === "Plug-in Hybrid"). */
export function isPlugIn(vehicle: PowertrainInput): boolean {
  return derivePowertrainBucket(vehicle) === "Plug-in Hybrid";
}

/** True only for plain hybrids (excludes plug-in hybrids). */
export function isHybrid(vehicle: PowertrainInput): boolean {
  return derivePowertrainBucket(vehicle) === "Hybrid";
}

/** True only for battery-electric vehicles. */
export function isEV(vehicle: PowertrainInput): boolean {
  return derivePowertrainBucket(vehicle) === "EV";
}

/** True for anything electrified (Hybrid, Plug-in Hybrid, or EV). */
export function isElectrified(vehicle: PowertrainInput): boolean {
  return derivePowertrainBucket(vehicle) !== "Gas";
}
