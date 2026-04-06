/**
 * Computes a per-order match summary against allocation vehicles.
 * Lightweight version of the AllocationBoard matching logic,
 * used to show match badges on dashboard order cards.
 */

import { Order } from "../../types";
import { AllocationVehicle } from "./allocationTypes";
import { MODEL_CODE_TO_ALLOCATION } from "./allocationReference";
import { matchExteriorColors, matchInteriorColors } from "./colorReference";

export interface OrderMatchSummary {
  exactCount: number;
  partialCount: number;
  modelOnlyCount: number;
}

function normalizeModel(model: string): string {
  return model.replace(/\s+/g, "").toUpperCase();
}

function extractFourDigitCode(value: string): string | null {
  const match = value.trim().match(/^(\d{4})/);
  return match?.[1] ?? null;
}

type ColorMatchResult = "exact" | "partial" | null;

function bestColorMatch(
  preferences: string[],
  vehicleColor: string,
  matchFn: (a: string, b: string) => ColorMatchResult,
): ColorMatchResult {
  for (const pref of preferences) {
    const result = matchFn(pref, vehicleColor);
    if (result === "exact") return "exact";
    if (result === "partial") return "partial";
  }
  return null;
}

/**
 * Build a Map from order ID to match summary.
 * Only includes orders that have at least one match.
 */
export function computeOrderMatchSummaries(
  orders: Order[],
  vehicles: AllocationVehicle[],
): Map<string, OrderMatchSummary> {
  const results = new Map<string, OrderMatchSummary>();
  if (orders.length === 0 || vehicles.length === 0) return results;

  const precomputed = orders.map((order) => {
    const fourDigitCode = extractFourDigitCode(order.modelNumber);
    const bridged = fourDigitCode ? MODEL_CODE_TO_ALLOCATION[fourDigitCode] : null;
    return {
      order,
      normalizedModel: normalizeModel(order.model),
      fourDigitCode,
      bridgedModel: bridged ? normalizeModel(bridged) : null,
      extColors: [order.exteriorColor1, order.exteriorColor2, order.exteriorColor3].filter(Boolean) as string[],
      intColors: [order.interiorColor1, order.interiorColor2, order.interiorColor3].filter(Boolean) as string[],
    };
  });

  for (const vehicle of vehicles) {
    const vehicleCode = normalizeModel(vehicle.code);
    const vehicleSourceCode = vehicle.sourceCode ? extractFourDigitCode(vehicle.sourceCode) : null;

    for (const pc of precomputed) {
      const modelMatch = vehicleCode !== "" && pc.normalizedModel === vehicleCode;
      const codeMatch = vehicleSourceCode !== null && pc.fourDigitCode !== null && vehicleSourceCode === pc.fourDigitCode;
      const bridgeMatch = pc.bridgedModel !== null && vehicleCode !== "" && pc.bridgedModel === vehicleCode;

      if (!modelMatch && !codeMatch && !bridgeMatch) continue;

      const ext = bestColorMatch(pc.extColors, vehicle.color, matchExteriorColors);
      const int = bestColorMatch(pc.intColors, vehicle.interiorColor, matchInteriorColors);

      const existing = results.get(pc.order.id) ?? { exactCount: 0, partialCount: 0, modelOnlyCount: 0 };

      if (ext === "exact" || int === "exact") {
        existing.exactCount++;
      } else if (ext === "partial" || int === "partial") {
        existing.partialCount++;
      } else {
        existing.modelOnlyCount++;
      }

      results.set(pc.order.id, existing);
    }
  }

  return results;
}
