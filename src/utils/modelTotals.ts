/**
 * Per-model allocation totals as COUNTS (not dollar totals).
 *
 * The luxury redesign summarises each car/model by how many units exist, how
 * many are still open (unclaimed), and how many are linked to an order —
 * deliberately NOT by MSRP or profit dollar totals. This module is the pure,
 * testable core of that aggregation; the UI slice consumes the result.
 *
 * Unit counting: newly parsed snapshots expand quantity>1 rows into one record
 * per car, so most records represent a single unit. Legacy snapshots may still
 * carry `quantity > 1` on a single record, so we count units as
 * `max(1, quantity)` per record to stay correct across both shapes.
 */

/** Minimal shape needed to aggregate a vehicle into model totals. */
export interface ModelTotalInput {
  id: string;
  model?: string | null;
  code?: string | null;
  quantity?: number | null;
}

export interface ModelTotal {
  /** Display key for the model (falls back to code, then "Unknown"). */
  model: string;
  /** Total allocated units for this model. */
  quantity: number;
  /** Units linked to an order. */
  linked: number;
  /** Units not yet linked to an order (quantity - linked). */
  open: number;
}

function unitCount(quantity: number | null | undefined): number {
  const q = Number(quantity);
  return Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
}

function modelKey(vehicle: ModelTotalInput): string {
  const model = (vehicle.model ?? "").trim();
  if (model) return model;
  const code = (vehicle.code ?? "").trim();
  if (code) return code;
  return "Unknown";
}

/**
 * Aggregate vehicles into per-model count totals.
 *
 * @param vehicles   Allocation units (one record may represent >1 unit).
 * @param linkedIds  Set/array of vehicle ids that are linked to an order.
 * @returns One entry per model, sorted by quantity descending then model name.
 */
export function computeModelTotals(
  vehicles: readonly ModelTotalInput[],
  linkedIds: ReadonlySet<string> | readonly string[] = [],
): ModelTotal[] {
  const linked =
    linkedIds instanceof Set ? linkedIds : new Set(linkedIds as readonly string[]);

  const byModel = new Map<string, ModelTotal>();

  for (const vehicle of vehicles) {
    const key = modelKey(vehicle);
    const units = unitCount(vehicle.quantity);
    const isLinked = linked.has(vehicle.id);

    const entry =
      byModel.get(key) ?? { model: key, quantity: 0, linked: 0, open: 0 };
    entry.quantity += units;
    if (isLinked) entry.linked += units;
    entry.open = entry.quantity - entry.linked;
    byModel.set(key, entry);
  }

  return [...byModel.values()].sort(
    (a, b) => b.quantity - a.quantity || a.model.localeCompare(b.model),
  );
}
