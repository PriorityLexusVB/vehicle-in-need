import type { AllocationSnapshot } from "./allocationTypes";

export interface ModelNumberTotal {
  modelNumber: string;
  totalSlots: number;
  unassignedSlots: number;
}

export interface LatestModelNumberTotals {
  reportDate: string;
  byModelNumber: Map<string, ModelNumberTotal>;
}

export function fourDigitModelNumber(value: string | null | undefined): string | null {
  const match = value?.trim().match(/^(\d{4})(?!\d)/);
  return match?.[1] ?? null;
}

function validReportDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Counts only source model numbers in one published latest snapshot.
 * A null result means the source cannot support a numerical claim.
 * A broad model name and a color match are deliberately never used here.
 */
export function buildLatestModelNumberTotals(
  snapshot: AllocationSnapshot | null,
  linkedVehicleIds: ReadonlySet<string>,
): LatestModelNumberTotals | null {
  if (
    !snapshot?.isLatest ||
    !snapshot.publishedAt ||
    !validReportDate(snapshot.reportDate) ||
    snapshot.vehicles.length === 0
  ) return null;

  const byModelNumber = new Map<string, ModelNumberTotal>();
  const seenIds = new Set<string>();
  for (const vehicle of snapshot.vehicles) {
    const code = fourDigitModelNumber(vehicle.sourceCode);
    // The current parser emits one stable ID per unit. Legacy grouped rows do
    // not identify which individual slot a vehicle_links claim occupies.
    if (!vehicle.id || seenIds.has(vehicle.id) || !code ||
      vehicle.quantity !== 1) return null;
    seenIds.add(vehicle.id);
    const total = byModelNumber.get(code) ?? {
      modelNumber: code,
      totalSlots: 0,
      unassignedSlots: 0,
    };
    total.totalSlots += 1;
    if (!linkedVehicleIds.has(vehicle.id)) total.unassignedSlots += 1;
    byModelNumber.set(code, total);
  }

  return { reportDate: snapshot.reportDate, byModelNumber };
}
