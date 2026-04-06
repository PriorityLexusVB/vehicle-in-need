/**
 * Computes a per-order match summary against allocation vehicles and DX trades.
 * Lightweight version of the AllocationBoard matching logic,
 * used to show match badges on dashboard order cards.
 */

import { Order } from "../../types";
import { AllocationVehicle } from "./allocationTypes";
import { DxTrade } from "./dxSheetParser";
import { MODEL_CODE_TO_ALLOCATION } from "./allocationReference";
import { matchExteriorColors, matchInteriorColors } from "./colorReference";

export interface OrderMatchSummary {
  exactCount: number;
  partialCount: number;
  modelOnlyCount: number;
  dxExactCount: number;
  dxPartialCount: number;
  dxModelOnlyCount: number;
  /** Allocation model names that matched (as they appear in allocation data, for deep linking) */
  matchedAllocModels: Set<string>;
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

function emptySummary(): OrderMatchSummary {
  return {
    exactCount: 0, partialCount: 0, modelOnlyCount: 0,
    dxExactCount: 0, dxPartialCount: 0, dxModelOnlyCount: 0,
    matchedAllocModels: new Set(),
  };
}

interface PrecomputedOrder {
  order: Order;
  normalizedModel: string;
  fourDigitCode: string | null;
  bridgedModel: string | null;
  extColors: string[];
  intColors: string[];
}

function precomputeOrders(orders: Order[]): PrecomputedOrder[] {
  return orders.map((order) => {
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
}

/**
 * Build a Map from order ID to match summary.
 * Includes allocation vehicle matches and DX trade matches.
 */
export function computeOrderMatchSummaries(
  orders: Order[],
  vehicles: AllocationVehicle[],
  dxTrades?: DxTrade[],
): Map<string, OrderMatchSummary> {
  const results = new Map<string, OrderMatchSummary>();
  if (orders.length === 0) return results;

  const precomputed = precomputeOrders(orders);

  // Allocation vehicle matching
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

      const existing = results.get(pc.order.id) ?? emptySummary();

      // Track the allocation model name for deep linking
      const allocModel = vehicle.model || vehicle.code;
      if (allocModel) existing.matchedAllocModels.add(allocModel);

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

  // DX trade matching
  if (dxTrades && dxTrades.length > 0) {
    for (const trade of dxTrades) {
      // DX model matching: description is the model name ("TX350"), modelNumber is the code ("9353")
      const dxModel = normalizeModel(trade.description);
      const dxCode = extractFourDigitCode(trade.modelNumber);
      // Also bridge the DX model number through the allocation reference
      const dxBridged = dxCode ? MODEL_CODE_TO_ALLOCATION[dxCode] : null;
      const dxBridgedNormalized = dxBridged ? normalizeModel(dxBridged) : null;

      // DX color: combine colorCode + color name for matching (e.g., "89 WHITE" or just "WHITE")
      const dxColor = [trade.colorCode, trade.color].filter(Boolean).join(" ").trim();

      for (const pc of precomputed) {
        const modelMatch = dxModel !== "" && pc.normalizedModel === dxModel;
        const codeMatch = dxCode !== null && pc.fourDigitCode !== null && dxCode === pc.fourDigitCode;
        const bridgeMatch = dxBridgedNormalized !== null && pc.normalizedModel === dxBridgedNormalized;

        if (!modelMatch && !codeMatch && !bridgeMatch) continue;

        // Match color against order preferences — try both the full string and just the color name
        const ext1 = bestColorMatch(pc.extColors, dxColor, matchExteriorColors);
        const ext2 = trade.color ? bestColorMatch(pc.extColors, trade.color, matchExteriorColors) : null;
        const ext = ext1 === "exact" || ext2 === "exact" ? "exact"
          : ext1 === "partial" || ext2 === "partial" ? "partial"
          : null;

        const existing = results.get(pc.order.id) ?? emptySummary();

        if (ext === "exact") {
          existing.dxExactCount++;
        } else if (ext === "partial") {
          existing.dxPartialCount++;
        } else {
          existing.dxModelOnlyCount++;
        }

        results.set(pc.order.id, existing);
      }
    }
  }

  return results;
}
