import { CURRENT_DX_SOURCE, type DxTrade } from "./dxSheetParser";

export function formatDxMovementDifference(balance: number): string {
  if (balance === 0) return "Equal counts";
  return balance > 0 ? `${balance} more received` : `${Math.abs(balance)} more sent`;
}

export const DX_MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: `${CURRENT_DX_SOURCE.sourceYear}-${String(index + 1).padStart(2, "0")}`,
  label: new Date(Date.UTC(CURRENT_DX_SOURCE.sourceYear, index, 1)).toLocaleDateString("en-US", {
    month: "long", year: "numeric", timeZone: "UTC",
  }),
}));

export function filterDxMonth(trades: readonly DxTrade[], month: string): DxTrade[] {
  return month ? trades.filter((trade) => trade.date.startsWith(`${month}-`)) : [...trades];
}

export function summarizeDxFees(trades: readonly DxTrade[]) {
  let cents = 0;
  let entered = 0;
  let missing = 0;
  let invalid = 0;
  for (const trade of trades) {
    if (!trade.dxFee.trim()) {
      missing++;
    } else if (!Number.isFinite(Number(trade.dxFee))) {
      invalid++;
    } else {
      cents += Math.round(Number(trade.dxFee) * 100);
      entered++;
    }
  }
  return { total: cents / 100, entered, missing, invalid };
}
