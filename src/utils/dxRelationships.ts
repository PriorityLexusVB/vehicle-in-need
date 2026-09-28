import {
  DX_HISTORICAL_SOURCES,
  type HistoricalDxSource,
} from "../data/dxHistoricalSeeds";
import {
  buildDxSourceRowUrl,
  getDxDirectionMeaning,
  normalizeDxDate,
  type DxDirection,
  type DxSourceContext,
  type DxTrade,
} from "./dxSheetParser";

export interface DxRelationshipMetrics {
  totalCompleted: number;
  vehiclesReceived: number;
  vehiclesSent: number;
  /** vehiclesReceived minus vehiclesSent; positive means we owe vehicles. */
  vehicleBalance: number;
  oursRequested: number;
  theirsRequested: number;
  unknownInitiator: number;
  lastActivity: string | null;
}

export interface DxRecentRelationshipMetrics extends DxRelationshipMetrics {
  startDate: string;
  endDate: string;
}

export interface DealerRelationship {
  id: string;
  key: string;
  dealerCode: string;
  displayName: string;
  aliases: string[];
  allTime: DxRelationshipMetrics;
  recent12Months: DxRecentRelationshipMetrics;
  /** Complete, newest-first transaction history for this relationship. */
  history: DxTrade[];
}

export interface AggregateDxRelationshipOptions {
  /** Inclusive end date for the 12-month view. Defaults to the newest trade. */
  asOf?: string | Date;
}

const DEALER_CODE_CORRECTIONS: Readonly<Record<string, string>> = {
  // Confirmed Richmond transposition in the source data.
  "65407": "64507",
  // Confirmed Rockville transposition; do not merge ambiguous Wilmington 60704/60702.
  "51906": "61906",
};

function normalizeDealerName(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "").trim();
}

export function canonicalizeDxDealerCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  return DEALER_CODE_CORRECTIONS[normalized] ?? normalized;
}

function normalizeHistoricalYear(value: string): string {
  const trimmed = value.trim();
  return /^\d{2}$/.test(trimmed) ? `20${trimmed}` : trimmed;
}

/** Convert the sanitized closed-workbook seeds into the common trade shape. */
export function buildHistoricalDxTrades(
  sources: readonly HistoricalDxSource[] = DX_HISTORICAL_SOURCES,
): DxTrade[] {
  const trades: DxTrade[] = [];

  for (const source of sources) {
    const context: DxSourceContext = {
      sourceYear: source.sourceYear,
      workbookId: source.workbookId,
      workbookTitle: source.workbookTitle,
      tabName: source.sheetName,
      gid: source.sheetId,
    };

    for (const record of source.records) {
      const [
        sourceRowNumber,
        sourceFingerprint,
        rawDate,
        vehicleYear,
        modelNumber,
        description,
        colorCode,
        color,
        tradingDealer,
        dealerCode,
        direction,
        outgoingModelNumber,
        isSwap,
      ] = record;
      const date = normalizeDxDate(rawDate, source.sourceYear);

      trades.push({
        id: `dx-${source.sourceYear}-fingerprint-${sourceFingerprint}`,
        date: date.value,
        year: normalizeHistoricalYear(vehicleYear),
        modelNumber,
        description,
        colorCode,
        color,
        vinIncoming: "",
        tradingDealer,
        dealerCode,
        stockNumber: "",
        dxFee: "",
        direction,
        directionMeaning: getDxDirectionMeaning(direction),
        completed: true,
        salesConsultant: "",
        outgoingStock: "",
        vinOutgoing: "",
        outgoingModelNumber,
        isSwap,
        sourceYear: source.sourceYear,
        sourceWorkbookId: source.workbookId,
        sourceWorkbookTitle: source.workbookTitle,
        sourceTabName: source.sheetName,
        sourceGid: source.sheetId,
        sourceRowNumber,
        sourceRowUrl: buildDxSourceRowUrl(context, sourceRowNumber),
        sourceFingerprint,
        sourceSchema: "LEGACY_2024_2025",
        sourceDataKind: "SANITIZED_HISTORY",
        issues: date.issue ? [date.issue] : [],
      });
    }
  }

  return trades;
}

interface DatedTrade {
  trade: DxTrade;
  time: number | null;
}

function dateToUtcTime(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const candidate = new Date(time);
  if (candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day) return null;
  return time;
}

function formatUtcDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function resolveAsOf(trades: readonly DxTrade[], provided?: string | Date): number {
  if (provided instanceof Date) {
    if (Number.isNaN(provided.getTime())) throw new Error("Invalid DX relationship asOf date.");
    return Date.UTC(
      provided.getUTCFullYear(),
      provided.getUTCMonth(),
      provided.getUTCDate(),
    );
  }
  if (typeof provided === "string") {
    const parsed = dateToUtcTime(provided);
    if (parsed === null) throw new Error(`Invalid DX relationship asOf date: ${provided}.`);
    return parsed;
  }

  const latest = trades
    .map((trade) => dateToUtcTime(trade.date))
    .filter((value): value is number => value !== null)
    .sort((first, second) => second - first)[0];
  if (latest === undefined) throw new Error("DX relationship aggregation needs asOf when no valid trade dates exist.");
  return latest;
}

function subtractTwelveMonths(time: number): number {
  const date = new Date(time);
  const year = date.getUTCFullYear() - 1;
  const month = date.getUTCMonth();
  const day = Math.min(
    date.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  );
  return Date.UTC(year, month, day);
}

function buildMetrics(dated: readonly DatedTrade[]): DxRelationshipMetrics {
  let vehiclesReceived = 0;
  let vehiclesSent = 0;
  let oursRequested = 0;
  let theirsRequested = 0;
  let unknownInitiator = 0;
  let latest: number | null = null;

  for (const { trade, time } of dated) {
    if (hasIncomingDxVehicle(trade)) vehiclesReceived++;
    if (hasOutgoingDxVehicle(trade)) vehiclesSent++;
    if (trade.direction === "OURS") oursRequested++;
    else if (trade.direction === "THEIRS") theirsRequested++;
    else unknownInitiator++;
    if (time !== null && (latest === null || time > latest)) latest = time;
  }

  return {
    totalCompleted: dated.length,
    vehiclesReceived,
    vehiclesSent,
    vehicleBalance: vehiclesReceived - vehiclesSent,
    oursRequested,
    theirsRequested,
    unknownInitiator,
    lastActivity: latest === null ? null : formatUtcDate(latest),
  };
}

export function hasIncomingDxVehicle(trade: DxTrade): boolean {
  return [trade.modelNumber, trade.description, trade.vinIncoming, trade.stockNumber]
    .some((value) => value.trim().length > 0);
}

export function hasOutgoingDxVehicle(trade: DxTrade): boolean {
  return [trade.outgoingModelNumber, trade.vinOutgoing, trade.outgoingStock]
    .some((value) => value.trim().length > 0);
}

function pickDisplayName(nameCounts: ReadonlyMap<string, number>): string {
  return [...nameCounts.entries()]
    .sort(([firstName, firstCount], [secondName, secondCount]) => (
      secondCount - firstCount
      || normalizeDealerName(secondName).length - normalizeDealerName(firstName).length
      || firstName.localeCompare(secondName)
    ))[0]?.[0] ?? "Unknown dealer";
}

interface RelationshipBucket {
  key: string;
  dealerCode: string;
  trades: DxTrade[];
  nameCounts: Map<string, number>;
}

/**
 * Build dealer relationships from completed DX history.
 *
 * Code is primary. A no-code row joins a code group only when its normalized
 * dealer name maps to exactly one code in the supplied history.
 */
export function aggregateDxRelationships(
  trades: readonly DxTrade[],
  options: AggregateDxRelationshipOptions = {},
): DealerRelationship[] {
  if (trades.length === 0) return [];

  const asOf = resolveAsOf(trades, options.asOf);
  const windowStart = subtractTwelveMonths(asOf);
  const nameToCodes = new Map<string, Set<string>>();

  for (const trade of trades) {
    const normalizedName = normalizeDealerName(trade.tradingDealer);
    const code = canonicalizeDxDealerCode(trade.dealerCode);
    if (!normalizedName || !code) continue;
    const codes = nameToCodes.get(normalizedName) ?? new Set<string>();
    codes.add(code);
    nameToCodes.set(normalizedName, codes);
  }

  const buckets = new Map<string, RelationshipBucket>();
  for (const trade of trades) {
    const normalizedName = normalizeDealerName(trade.tradingDealer);
    const explicitCode = canonicalizeDxDealerCode(trade.dealerCode);
    const inferredCodes = normalizedName ? nameToCodes.get(normalizedName) : undefined;
    const dealerCode = explicitCode || (inferredCodes?.size === 1 ? [...inferredCodes][0] : "");
    const key = dealerCode ? `code:${dealerCode}` : `name:${normalizedName || "UNKNOWN"}`;
    const bucket = buckets.get(key) ?? {
      key,
      dealerCode,
      trades: [],
      nameCounts: new Map<string, number>(),
    };
    bucket.trades.push(trade);
    const name = trade.tradingDealer.trim();
    if (name) bucket.nameCounts.set(name, (bucket.nameCounts.get(name) ?? 0) + 1);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket): DealerRelationship => {
      const dated: DatedTrade[] = bucket.trades.map((trade) => ({
        trade,
        time: dateToUtcTime(trade.date),
      }));
      const recent = dated.filter(({ time }) => (
        time !== null && time >= windowStart && time <= asOf
      ));
      const history = [...dated]
        .sort((first, second) => {
          if (first.time === null && second.time !== null) return 1;
          if (first.time !== null && second.time === null) return -1;
          if (first.time !== second.time) return (second.time ?? 0) - (first.time ?? 0);
          return first.trade.id.localeCompare(second.trade.id);
        })
        .map(({ trade }) => trade);
      const allTime = buildMetrics(dated);

      return {
        id: bucket.key,
        key: bucket.key,
        dealerCode: bucket.dealerCode,
        displayName: pickDisplayName(bucket.nameCounts),
        aliases: [...bucket.nameCounts.keys()].sort((first, second) => first.localeCompare(second)),
        allTime,
        recent12Months: {
          ...buildMetrics(recent),
          startDate: formatUtcDate(windowStart),
          endDate: formatUtcDate(asOf),
        },
        history,
      };
    })
    .sort((first, second) => (
      second.allTime.totalCompleted - first.allTime.totalCompleted
      || (second.allTime.lastActivity ?? "").localeCompare(first.allTime.lastActivity ?? "")
      || first.displayName.localeCompare(second.displayName)
    ));
}

/** Only OURS rows represent a completed exchange where another dealer helped us. */
export function isEligibleDxNeedCandidate(trade: Pick<DxTrade, "direction">): boolean {
  return trade.direction === "OURS";
}

export function filterDxNeedCandidates<T extends Pick<DxTrade, "direction">>(
  trades: readonly T[],
): T[] {
  return trades.filter(isEligibleDxNeedCandidate);
}

function normalizeModel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/** Match only incoming/primary models from OURS rows. */
export function getEligibleDxNeedCandidatesByModel(
  trades: readonly DxTrade[],
  modelOrNumber: string,
): DxTrade[] {
  const wanted = normalizeModel(modelOrNumber);
  if (!wanted) return [];
  return filterDxNeedCandidates(trades).filter((trade) => (
    normalizeModel(trade.description) === wanted
    || normalizeModel(trade.modelNumber) === wanted
  ));
}

/** Public semantic helper for callers constructing lightweight records. */
export function relationshipMeaningForDirection(direction: DxDirection) {
  return getDxDirectionMeaning(direction);
}
