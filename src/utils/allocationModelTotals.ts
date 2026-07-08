/**
 * Per-model allocation slot totals as COUNTS (never dollar totals).
 *
 * "Total for each car" is model-level inventory, surfaced as slot counts. The
 * allocation parser intentionally sets `msrp`/`profit`/`totalValue` to 0, so a
 * dollar-total UI would be fake — this helper deals only in counts.
 *
 * Terms (per redesign plan):
 *   - totalSlots:     allocation vehicle slots for a display model (after the
 *                     parser expands multi-quantity rows into per-unit records).
 *   - linkedSlots:    slots claimed via `vehicle_links` (NOT inferred from order
 *                     status).
 *   - availableSlots: totalSlots − linkedSlots.
 *
 * This is the pure, UI-agnostic core. Demand counts (activeDemand,
 * exactColorDemand, similarColorDemand, dxDemand) join in a later slice once
 * orders/matches are threaded in; they are deliberately out of scope here.
 *
 * Unit counting: newly parsed snapshots emit one record per car (`quantity: 1`).
 * Legacy snapshots may still carry `quantity > 1` on a single record, so a slot
 * count of `max(1, quantity)` per record stays correct across both shapes.
 */

/** Fields needed to derive a model display key (no id required). */
export interface ModelKeyInput {
  model?: string | null;
  code?: string | null;
}

/** Minimal shape needed to aggregate a vehicle into model slot totals. */
export interface ModelTotalVehicle extends ModelKeyInput {
  id: string;
  quantity?: number | null;
}

export interface ModelSlotTotals {
  /** Display key for the model (mirrors the board's getDisplayModel). */
  model: string;
  /** Total allocated slots for this model. */
  totalSlots: number;
  /** Slots claimed via vehicle_links. */
  linkedSlots: number;
  /** Slots not yet claimed (totalSlots − linkedSlots). */
  availableSlots: number;
}

function slotCount(quantity: number | null | undefined): number {
  const q = Number(quantity);
  return Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
}

function displayValue(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  // Mirror AllocationBoard.getDisplayValue: treat placeholder words as empty so
  // the pill key matches the model the card actually displays.
  if (/^(unknown|n\/a|na|tbd)$/i.test(trimmed)) return "";
  return trimmed;
}

/**
 * Model key for a vehicle, mirroring AllocationBoard.getDisplayModel so slot
 * totals bucket identically to the visible model options: prefer `model`, fall
 * back to `code` unless it's a bare 4-digit(+letter) code, else "Not listed".
 * Takes only the key fields (no id) so aggregation objects can reuse it.
 */
export function getVehicleModelKey(vehicle: ModelKeyInput): string {
  const model = displayValue(vehicle.model);
  if (model) return model;

  const code = displayValue(vehicle.code);
  if (code && !/^\d{4}[A-Z]?$/i.test(code)) return code;

  return "Not listed";
}

/**
 * Aggregate vehicles into per-model slot totals.
 *
 * @param vehicles   Allocation records (one record may represent >1 slot).
 * @param linkedIds  Vehicle ids claimed via vehicle_links (Set or array).
 * @returns One entry per model, sorted by totalSlots desc then model name asc.
 */
export function buildModelSlotTotals(
  vehicles: readonly ModelTotalVehicle[],
  linkedIds: ReadonlySet<string> | readonly string[] = [],
): ModelSlotTotals[] {
  const linked =
    linkedIds instanceof Set
      ? linkedIds
      : new Set(linkedIds as readonly string[]);

  const byModel = new Map<string, ModelSlotTotals>();

  for (const vehicle of vehicles) {
    const key = getVehicleModelKey(vehicle);
    const slots = slotCount(vehicle.quantity);
    const isLinked = linked.has(vehicle.id);

    const entry =
      byModel.get(key) ??
      { model: key, totalSlots: 0, linkedSlots: 0, availableSlots: 0 };
    entry.totalSlots += slots;
    if (isLinked) entry.linkedSlots += slots;
    entry.availableSlots = entry.totalSlots - entry.linkedSlots;
    byModel.set(key, entry);
  }

  return [...byModel.values()].sort(
    (a, b) => b.totalSlots - a.totalSlots || a.model.localeCompare(b.model),
  );
}
