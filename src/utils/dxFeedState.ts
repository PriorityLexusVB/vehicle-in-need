import type { DxRejectedRowEvidence, DxTrade } from "./dxSheetParser";

export type DxFeedStatus =
  | "syncing"
  | "current"
  | "stale"
  | "source-error"
  | "no-data";

export interface DxFeedState {
  status: DxFeedStatus;
  trades: DxTrade[];
  historicalTrades: DxTrade[];
  liveTrades: DxTrade[];
  /** Non-transaction rows excluded from the latest successful live parse. */
  rejectedRows: DxRejectedRowEvidence[];
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  latestBusinessDate: string | null;
  error: string | null;
}

function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function sortNewestFirst(trades: DxTrade[]): DxTrade[] {
  return [...trades].sort((a, b) => {
    const aTime = validIsoDate(a.date) ? Date.parse(`${a.date}T00:00:00Z`) : -1;
    const bTime = validIsoDate(b.date) ? Date.parse(`${b.date}T00:00:00Z`) : -1;
    if (aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

function combineTrades(historicalTrades: DxTrade[], liveTrades: DxTrade[]): DxTrade[] {
  const byId = new Map<string, DxTrade>();
  for (const trade of [...historicalTrades, ...liveTrades]) {
    byId.set(trade.id, trade);
  }
  return sortNewestFirst([...byId.values()]);
}

export function latestDxBusinessDate(trades: DxTrade[]): string | null {
  let latest: string | null = null;
  for (const trade of trades) {
    if (!validIsoDate(trade.date)) continue;
    if (latest === null || trade.date > latest) latest = trade.date;
  }
  return latest;
}

export function createDxFeedState(historicalTrades: DxTrade[] = []): DxFeedState {
  const trades = combineTrades(historicalTrades, []);
  return {
    status: "no-data",
    trades,
    historicalTrades: [...historicalTrades],
    liveTrades: [],
    rejectedRows: [],
    lastAttemptAt: null,
    lastSuccessAt: null,
    latestBusinessDate: latestDxBusinessDate(trades),
    error: null,
  };
}

export function beginDxRefresh(previous: DxFeedState, attemptedAt: Date): DxFeedState {
  return {
    ...previous,
    status: "syncing",
    lastAttemptAt: attemptedAt,
    error: null,
  };
}

export function completeDxRefresh(
  previous: DxFeedState,
  liveTrades: DxTrade[],
  completedAt: Date,
  rejectedRows: DxRejectedRowEvidence[] = [],
): DxFeedState {
  const trades = combineTrades(previous.historicalTrades, liveTrades);
  return {
    ...previous,
    status: liveTrades.length > 0 ? "current" : "no-data",
    trades,
    liveTrades: [...liveTrades],
    rejectedRows: [...rejectedRows],
    lastAttemptAt: completedAt,
    lastSuccessAt: completedAt,
    latestBusinessDate: latestDxBusinessDate(trades),
    error: null,
  };
}

export function failDxRefresh(
  previous: DxFeedState,
  error: string,
  failedAt: Date,
): DxFeedState {
  const trades = combineTrades(previous.historicalTrades, previous.liveTrades);
  return {
    ...previous,
    status: previous.liveTrades.length > 0 ? "stale" : "source-error",
    trades,
    lastAttemptAt: failedAt,
    latestBusinessDate: latestDxBusinessDate(trades),
    error,
  };
}

export function resetDxFeed(historicalTrades: DxTrade[] = []): DxFeedState {
  return createDxFeedState(historicalTrades);
}
