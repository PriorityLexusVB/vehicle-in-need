/**
 * Powertrain classification helpers.
 *
 * The allocation data model does not carry an explicit powertrain field. It
 * carries `engine` ("Gas" | "Hybrid" | "EV") and a free-form `type`
 * (e.g. "PHEV SUV", "Three-Row PHEV SUV", "SUV Hybrid"). Plug-in hybrids are
 * stored with `engine: "Hybrid"` but are distinguished by a "PHEV" marker in
 * `type` and/or a "+" suffix on the model code (e.g. "RX450H+", "TX550H+").
 *
 * This module derives a single, unambiguous powertrain bucket so the UI can
 * offer Hybrid and Plug-in controls in addition to the existing Electrified
 * grouping. It is intentionally pure (no UI, no data-layer imports) and cheap
 * to test.
 *
 * NOTE: This is a distinct dimension from the reference `category` field. In
 * the reference data `category: "Electrified"` covers only EV + PHEV, while
 * plain hybrids are `category: "Core"`. `isElectrified()` here is the broader
 * "anything that isn't purely gas" grouping; do not conflate the two.
 */

export type Powertrain = "Gas" | "Hybrid" | "Plug-in Hybrid" | "EV";

/** Stable, display-ordered list of powertrain buckets. */
export const POWERTRAINS: readonly Powertrain[] = [
  "Gas",
  "Hybrid",
  "Plug-in Hybrid",
  "EV",
] as const;

/** Minimal shape needed to classify a vehicle's powertrain. */
export interface PowertrainInput {
  engine?: string | null;
  type?: string | null;
  code?: string | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** True when the vehicle is a plug-in hybrid (PHEV marker in type or "+" code). */
export function isPlugIn(vehicle: PowertrainInput): boolean {
  const type = norm(vehicle.type);
  const code = norm(vehicle.code);
  return type.includes("phev") || code.endsWith("+");
}

/** True when engine/type signals a battery-electric vehicle. */
function isEvSignal(vehicle: PowertrainInput): boolean {
  if (norm(vehicle.engine) === "ev") return true;
  // Match "EV" as a standalone token in the type ("EV SUV", "EV Sedan AWD"),
  // never as a substring of another word.
  return /\bev\b/.test(norm(vehicle.type));
}

/**
 * Classify a vehicle into a single powertrain bucket.
 *
 * Precedence: EV > Plug-in Hybrid > Hybrid > Gas. EV wins first; plug-in is
 * decided by the PHEV/"+" markers, which override a plain "Hybrid" engine;
 * remaining hybrids map to Hybrid; everything else is Gas.
 */
export function classifyPowertrain(vehicle: PowertrainInput): Powertrain {
  if (isEvSignal(vehicle)) return "EV";
  if (isPlugIn(vehicle)) return "Plug-in Hybrid";
  if (norm(vehicle.engine) === "hybrid") return "Hybrid";
  return "Gas";
}

/** True for plain hybrids only (excludes plug-in hybrids). */
export function isHybrid(vehicle: PowertrainInput): boolean {
  return classifyPowertrain(vehicle) === "Hybrid";
}

/** True for battery-electric vehicles. */
export function isEV(vehicle: PowertrainInput): boolean {
  return classifyPowertrain(vehicle) === "EV";
}

/**
 * True for anything that isn't purely gas (Hybrid, Plug-in Hybrid, or EV).
 * Broader than the reference `category: "Electrified"` grouping — see module note.
 */
export function isElectrified(vehicle: PowertrainInput): boolean {
  return classifyPowertrain(vehicle) !== "Gas";
}
