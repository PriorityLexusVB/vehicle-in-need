import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppUser, Order } from "../types";
import {
  parseAllocationSource,
  groupArrivalBucket,
} from "../src/utils/allocationParser";
import { MODEL_CODE_TO_ALLOCATION } from "../src/utils/allocationReference";
import { matchExteriorColors, matchInteriorColors } from "../src/utils/colorReference";
import { extractAllocationTextFromPdf } from "../src/utils/pdfTextExtractor";
import {
  ParsedAllocationResult,
  AllocationSnapshot,
  AllocationVehicle,
} from "../src/utils/allocationTypes";
import {
  publishAllocationSnapshot,
  subscribeLatestAllocationSnapshot,
} from "../services/allocationService";
import { subscribeActiveOrders } from "../services/orderService";
import {
  linkVehicleToOrder,
  unlinkVehicleFromOrder,
} from "../services/orderLinkingService";
import { fetchDxSheet, DxTrade } from "../src/utils/dxSheetParser";

interface AllocationBoardProps {
  currentUser: AppUser;
}

type BoardView = "strategy" | "log" | "matches";
type ArrivalGroupingMode = "bucket" | "date";
type SortMode = "priority" | "arrival" | "units" | "model";
type BosFilter = "all" | "y" | "n";
type ParseConfidence = "High" | "Medium" | "Needs Review";

const RANK_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const ARRIVAL_BUCKET_ORDER: Record<string, number> = {
  "ARRIVING ≤ 7 DAYS": 0,
  "ARRIVING 8-30 DAYS": 1,
  "ARRIVING 30+ DAYS": 2,
  UNSCHEDULED: 3,
};

const BOARD_VIEW_OPTIONS: BoardView[] = ["strategy", "log", "matches"];
const ARRIVAL_GROUPING_OPTIONS: ArrivalGroupingMode[] = ["bucket", "date"];
const SORT_MODE_OPTIONS: SortMode[] = ["priority", "arrival", "units", "model"];
const BOS_FILTER_OPTIONS: BosFilter[] = ["all", "y", "n"];

const STORAGE_KEYS = {
  boardView: "allocation.boardView",
  searchQuery: "allocation.searchQuery",
  categoryFilter: "allocation.categoryFilter",
  modelFilter: "allocation.modelFilter",
  rankFilter: "allocation.rankFilter",
  bosFilter: "allocation.bosFilter",
  arrivalGrouping: "allocation.arrivalGrouping",
  sortMode: "allocation.sortMode",
} as const;

/** Normalize a model string for matching: strip spaces, uppercase, e.g. "RX 350" → "RX350" */
function normalizeModelForMatch(model: string): string {
  return model.replace(/\s+/g, "").toUpperCase();
}

/** Extract the 4-digit model number from a string like "9702" or "9702A" */
function extractFourDigitCode(value: string): string | null {
  const match = value.trim().match(/^(\d{4})/);
  return match?.[1] ?? null;
}

interface MatchedOrder {
  orderId: string;
  customerName: string;
  salesperson: string;
  model: string;
  modelNumber: string;
  exteriorColor1: string;
  interiorColor1: string;
  allocatedVehicleId?: string;
  colorMatch: "exact" | "partial" | null;
  interiorMatch: "exact" | "partial" | null;
  /** Which exterior choice matched (1, 2, 3) or null if no match */
  extChoiceMatched: number | null;
  /** The actual exterior color value that matched */
  extColorMatched: string | null;
  /** Which interior choice matched (1, 2, 3) or null if no match */
  intChoiceMatched: number | null;
  /** The actual interior color value that matched */
  intColorMatched: string | null;
  orderDate: string;
}

/** Score a match for sorting: higher = better match. Exact color > partial > none. */
function matchScore(m: MatchedOrder): number {
  let score = 0;
  if (m.colorMatch === "exact") score += 4;
  else if (m.colorMatch === "partial") score += 2;
  if (m.interiorMatch === "exact") score += 2;
  else if (m.interiorMatch === "partial") score += 1;
  return score;
}

/** Sort matched orders: best color match first, then oldest deposit (longest waiting). */
function sortMatchedOrders(matches: MatchedOrder[]): MatchedOrder[] {
  return [...matches].sort((a, b) => {
    const scoreDiff = matchScore(b) - matchScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.orderDate.localeCompare(b.orderDate);
  });
}

type ColorMatchResult = "exact" | "partial" | null;

interface ColorPreferenceResult {
  quality: ColorMatchResult;
  /** 1-based index of which choice matched (1st, 2nd, 3rd) */
  choiceNumber: number | null;
  /** The actual color value that matched */
  matchedValue: string | null;
}

/** Find the best color match across multiple order preferences against one vehicle color. */
function bestColorPreference(
  preferences: string[],
  vehicleColor: string,
  matchFn: (a: string, b: string) => ColorMatchResult,
): ColorPreferenceResult {
  let best: ColorPreferenceResult = { quality: null, choiceNumber: null, matchedValue: null };
  for (let i = 0; i < preferences.length; i++) {
    const result = matchFn(preferences[i], vehicleColor);
    if (result === "exact") return { quality: "exact", choiceNumber: i + 1, matchedValue: preferences[i] };
    if (result === "partial" && best.quality !== "partial") {
      best = { quality: "partial", choiceNumber: i + 1, matchedValue: preferences[i] };
    }
  }
  return best;
}

/** Pre-computed order fields to avoid redundant work in the O(V*O) matching loop. */
interface PrecomputedOrder {
  order: Order;
  normalizedModel: string;
  fourDigitCode: string | null;
  bridgedModel: string | null;
  extColors: string[];
  intColors: string[];
}

function getDisplayValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^(unknown|n\/a|na|tbd)$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function getDisplayCode(sourceCode?: string | null, code?: string | null): string {
  const codeCandidates = [getDisplayValue(sourceCode), getDisplayValue(code)].filter(
    Boolean,
  ) as string[];

  for (const candidate of codeCandidates) {
    const fourDigit = candidate.match(/\b(\d{4})[A-Z]?\b/);
    if (fourDigit?.[1]) {
      return fourDigit[1];
    }
  }

  return "----";
}

function getDisplayModel(model?: string | null, code?: string | null): string {
  const explicitModel = getDisplayValue(model);
  if (explicitModel) {
    return explicitModel;
  }

  const codeFallback = getDisplayValue(code);
  if (codeFallback && !/^\d{4}[A-Z]?$/i.test(codeFallback)) {
    return codeFallback;
  }

  return "Not listed";
}

function formatBuildBucketLabel(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === "ARRIVING ≤ 7 DAYS") {
    return "BUILD ≤ 7 DAYS";
  }
  if (normalized === "ARRIVING 8-30 DAYS") {
    return "BUILD 8-30 DAYS";
  }
  if (normalized === "ARRIVING 30+ DAYS") {
    return "BUILD 30+ DAYS";
  }
  return value;
}

function getStoredEnum<T extends string>(
  key: string,
  allowedValues: readonly T[],
  fallback: T,
): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const stored = window.localStorage.getItem(key);
  if (!stored || !allowedValues.includes(stored as T)) {
    return fallback;
  }

  return stored as T;
}

function getStoredText(key: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  return window.localStorage.getItem(key) ?? fallback;
}

function persistSetting(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value);
}

function parseArrivalDate(value: string): Date | null {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const fallbackParsed = new Date(trimmed);
  if (Number.isNaN(fallbackParsed.getTime())) {
    return null;
  }

  return fallbackParsed;
}

function compareArrivalValues(first: string, second: string): number {
  const firstDate = parseArrivalDate(first);
  const secondDate = parseArrivalDate(second);

  if (firstDate && secondDate) {
    return firstDate.getTime() - secondDate.getTime();
  }
  if (firstDate) {
    return -1;
  }
  if (secondDate) {
    return 1;
  }

  return first.localeCompare(second);
}

function formatRelativeArrival(value: string): string | null {
  const parsed = parseArrivalDate(value);
  if (!parsed) {
    return null;
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfParsed = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const dayMs = 1000 * 60 * 60 * 24;
  const dayDiff = Math.round((startOfParsed.getTime() - startOfToday.getTime()) / dayMs);

  if (dayDiff === 0) {
    return "today";
  }
  if (dayDiff > 0) {
    return `in ${dayDiff}d`;
  }
  return `${Math.abs(dayDiff)}d ago`;
}

function formatArrivalDisplay(value: string): { primary: string; secondary: string | null } {
  const normalized = value.trim();
  if (!normalized || normalized.toUpperCase() === "TBD") {
    return { primary: "UNSCHEDULED", secondary: null };
  }

  const parsed = parseArrivalDate(normalized);
  if (!parsed) {
    return { primary: normalized, secondary: null };
  }

  return {
    primary: parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    secondary: formatRelativeArrival(normalized),
  };
}

function formatColorDisplay(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  if (!normalized || normalized === "TBD") {
    return "COLOR TBD";
  }

  const withCode = normalized.match(/^([0-9A-Z]{3,4})\s+(.+)$/);
  if (withCode?.[1] && withCode[2] && /\d/.test(withCode[1])) {
    return `${withCode[1]} ${withCode[2].trim()}`;
  }

  const codeOnly = normalized.match(/^([0-9A-Z]{3,4})$/);
  if (codeOnly?.[1] && /\d/.test(codeOnly[1])) {
    return codeOnly[1];
  }

  return normalized;
}

function formatInteriorColorDisplay(value: string): string {
  const formatted = formatColorDisplay(value);
  return formatted === "COLOR TBD" ? "TBD" : formatted;
}

function isMeaningfulDetailValue(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return !/^(tbd|n\/a|na|none|unknown|-|--)$/i.test(normalized);
}

function normalizeDetailList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => isMeaningfulDetailValue(entry));
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!isMeaningfulDetailValue(normalized)) {
      return [];
    }

    return normalized
      .split(/\s*[|;,]\s*/)
      .map((entry) => entry.trim())
      .filter((entry) => isMeaningfulDetailValue(entry));
  }

  return [];
}

function getFactoryAccessories(vehicle: AllocationVehicle): string[] {
  const value = vehicle as AllocationVehicle & Record<string, unknown>;
  const candidates = [
    value.factoryAccessories,
    value.factoryAccessory,
    value.factoryAccy,
    value.factoryOptions,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDetailList(candidate);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

function getPostProductionOptions(vehicle: AllocationVehicle): string[] {
  const value = vehicle as AllocationVehicle & Record<string, unknown>;
  const candidates = [
    value.postProductionOptions,
    value.postProductionOption,
    value.ppos,
    value.ppo,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDetailList(candidate);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

function normalizeBosValue(value: string): "Y" | "N" {
  const normalized = value.trim().toUpperCase();
  return normalized === "Y" ? "Y" : "N";
}

function formatBosDisplay(value: string): {
  value: "Y" | "N";
  detail: string | null;
  tone: string;
} {
  const normalized = normalizeBosValue(value);

  if (normalized === "Y") {
    return {
      value: "Y",
      detail: "Changeable",
      tone: "border-emerald-300 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    value: "N",
    detail: "Locked",
    tone: "border-stone-300 bg-stone-100 text-stone-600",
  };
}

function deriveParseConfidence(result: ParsedAllocationResult): ParseConfidence {
  if (result.errors.length > 0) {
    return "Needs Review";
  }

  const tbdCount = result.vehicles.reduce((count, vehicle) => {
    let next = count;
    if (vehicle.arrival.trim().toUpperCase() === "TBD") {
      next += 1;
    }
    if (vehicle.color.trim().toUpperCase() === "TBD") {
      next += 1;
    }
    if (vehicle.interiorColor.trim().toUpperCase() === "TBD") {
      next += 1;
    }
    return next;
  }, 0);

  if (result.warnings.length === 0 && tbdCount === 0) {
    return "High";
  }

  if (result.warnings.length <= 2 && tbdCount <= 3) {
    return "Medium";
  }

  return "Needs Review";
}

function formatTimestamp(date?: { toDate: () => Date }): string {
  if (!date) {
    return "Not published yet";
  }

  return date.toDate().toLocaleString();
}

interface GroupedAllocationRow {
  key: string;
  arrivalKey: string;
  arrivalLabel: string;
  arrivalRelative: string | null;
  category: string;
  grade: string;
  rank: string;
  totalUnits: number;
  vehicles: AllocationVehicle[];
}

const AllocationBoard: React.FC<AllocationBoardProps> = ({ currentUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [latestSnapshot, setLatestSnapshot] = useState<AllocationSnapshot | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);

  const [dxTrades, setDxTrades] = useState<DxTrade[]>([]);
  const [dxLoading, setDxLoading] = useState(false);
  const [dxError, setDxError] = useState<string | null>(null);
  const [dxLastFetched, setDxLastFetched] = useState<Date | null>(null);

  const [isManagerPanelOpen, setIsManagerPanelOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [parsedResult, setParsedResult] = useState<ParsedAllocationResult | null>(
    null,
  );
  const [parseStatus, setParseStatus] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [isPdfDragActive, setIsPdfDragActive] = useState(false);
  const [skippedCopyStatus, setSkippedCopyStatus] = useState<string | null>(null);

  const [boardView, setBoardView] = useState<BoardView>(() =>
    getStoredEnum(STORAGE_KEYS.boardView, BOARD_VIEW_OPTIONS, "strategy"),
  );
  const [searchQuery, setSearchQuery] = useState(() =>
    getStoredText(STORAGE_KEYS.searchQuery, ""),
  );
  const [categoryFilter, setCategoryFilter] = useState(() =>
    getStoredText(STORAGE_KEYS.categoryFilter, "all"),
  );
  const [modelFilter, setModelFilter] = useState(() =>
    getStoredText(STORAGE_KEYS.modelFilter, "all"),
  );
  const [rankFilter, setRankFilter] = useState(() =>
    getStoredText(STORAGE_KEYS.rankFilter, "all"),
  );
  const [bosFilter, setBosFilter] = useState<BosFilter>(() =>
    getStoredEnum(STORAGE_KEYS.bosFilter, BOS_FILTER_OPTIONS, "all"),
  );
  const [arrivalGroupingMode, setArrivalGroupingMode] = useState<ArrivalGroupingMode>(
    () =>
      getStoredEnum(
        STORAGE_KEYS.arrivalGrouping,
        ARRIVAL_GROUPING_OPTIONS,
        "bucket",
      ),
  );
  const [sortMode, setSortMode] = useState<SortMode>(() =>
    getStoredEnum(STORAGE_KEYS.sortMode, SORT_MODE_OPTIONS, "priority"),
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [linkingOrderId, setLinkingOrderId] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const urlModelApplied = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeLatestAllocationSnapshot(
      (snapshot) => {
        setLatestSnapshot(snapshot);
        setLoadError(null);
        setIsLoading(false);
      },
      (error) => {
        setLoadError(error.message || "Unable to load allocation board.");
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Only managers subscribe to all orders for matching — non-managers lack
  // Firestore permissions for the full orders collection and shouldn't see PII.
  useEffect(() => {
    if (!currentUser.isManager) {
      setActiveOrders([]);
      return;
    }
    return subscribeActiveOrders((orders) => setActiveOrders(orders));
  }, [currentUser.isManager]);

  // Fetch DX sheet data (managers only)
  useEffect(() => {
    if (!currentUser.isManager) return;
    let cancelled = false;

    const loadDx = async () => {
      setDxLoading(true);
      setDxError(null);
      try {
        const trades = await fetchDxSheet();
        if (!cancelled) {
          setDxTrades(trades);
          setDxLastFetched(new Date());
        }
      } catch (err) {
        if (!cancelled) {
          setDxError(err instanceof Error ? err.message : "Failed to load DX sheet");
        }
      } finally {
        if (!cancelled) setDxLoading(false);
      }
    };

    void loadDx();
    return () => { cancelled = true; };
  }, [currentUser.isManager]);

  // Pre-compute order fields once so the O(V*O) loop doesn't repeat work
  const precomputedOrders = useMemo<PrecomputedOrder[]>(() => {
    return activeOrders.map((order) => {
      const fourDigitCode = extractFourDigitCode(order.modelNumber);
      const bridged = fourDigitCode ? MODEL_CODE_TO_ALLOCATION[fourDigitCode] : null;
      return {
        order,
        normalizedModel: normalizeModelForMatch(order.model),
        fourDigitCode,
        bridgedModel: bridged ? normalizeModelForMatch(bridged) : null,
        extColors: [order.exteriorColor1, order.exteriorColor2, order.exteriorColor3].filter(Boolean) as string[],
        intColors: [order.interiorColor1, order.interiorColor2, order.interiorColor3].filter(Boolean) as string[],
      };
    });
  }, [activeOrders]);

  // Match allocation vehicles to active orders via model name, 4-digit code, or bridge lookup
  const orderMatchesByVehicle = useMemo(() => {
    const matches = new Map<string, MatchedOrder[]>();
    if (precomputedOrders.length === 0) return matches;

    for (const vehicle of latestSnapshot?.vehicles ?? []) {
      const vehicleCode = normalizeModelForMatch(vehicle.code);
      const vehicleSourceCode = vehicle.sourceCode ? extractFourDigitCode(vehicle.sourceCode) : null;

      const vehicleMatches: MatchedOrder[] = [];

      for (const pc of precomputedOrders) {
        const modelMatch = vehicleCode !== "" && pc.normalizedModel === vehicleCode;
        const codeMatch = vehicleSourceCode !== null && pc.fourDigitCode !== null && vehicleSourceCode === pc.fourDigitCode;
        const bridgeMatch = pc.bridgedModel !== null && vehicleCode !== "" && pc.bridgedModel === vehicleCode;

        if (modelMatch || codeMatch || bridgeMatch) {
          vehicleMatches.push({
            orderId: pc.order.id,
            customerName: pc.order.customerName,
            salesperson: pc.order.salesperson,
            model: pc.order.model,
            modelNumber: pc.order.modelNumber,
            exteriorColor1: pc.order.exteriorColor1,
            interiorColor1: pc.order.interiorColor1,
            allocatedVehicleId: pc.order.allocatedVehicleId,
            ...(() => {
              const ext = bestColorPreference(pc.extColors, vehicle.color, matchExteriorColors);
              const int = bestColorPreference(pc.intColors, vehicle.interiorColor, matchInteriorColors);
              return {
                colorMatch: ext.quality,
                interiorMatch: int.quality,
                extChoiceMatched: ext.choiceNumber,
                extColorMatched: ext.matchedValue,
                intChoiceMatched: int.choiceNumber,
                intColorMatched: int.matchedValue,
              };
            })(),
            orderDate: pc.order.date,
          });
        }
      }

      if (vehicleMatches.length > 0) {
        matches.set(vehicle.id, vehicleMatches);
      }
    }

    return matches;
  }, [latestSnapshot, precomputedOrders]);

  const matchedVehicleIds = useMemo(
    () => new Set(orderMatchesByVehicle.keys()),
    [orderMatchesByVehicle],
  );

  // Vehicles with at least one color match (exact or partial ext/int) — excludes model-only
  const colorMatchedVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [vehicleId, matches] of orderMatchesByVehicle) {
      if (matches.some((m) => m.colorMatch || m.interiorMatch)) {
        ids.add(vehicleId);
      }
    }
    return ids;
  }, [orderMatchesByVehicle]);

  const matchSummary = useMemo(() => {
    const uniqueOrderIds = new Set<string>();
    for (const matched of orderMatchesByVehicle.values()) {
      for (const m of matched) {
        if (m.colorMatch || m.interiorMatch) {
          uniqueOrderIds.add(m.orderId);
        }
      }
    }
    return { matchedVehicleCount: colorMatchedVehicleIds.size, matchedOrderCount: uniqueOrderIds.size };
  }, [orderMatchesByVehicle, colorMatchedVehicleIds]);

  const vehicles = useMemo<AllocationVehicle[]>(
    () => latestSnapshot?.vehicles ?? [],
    [latestSnapshot],
  );

  const categoryOptions = useMemo<string[]>(() => {
    const cats: string[] = vehicles.map((vehicle) => vehicle.category);
    return [...new Set(cats)].sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const rankOptions = useMemo<string[]>(() => {
    const ranks: string[] = vehicles.map((vehicle) => vehicle.rank);
    return [...new Set(ranks)].sort((a, b) => {
      return (RANK_ORDER[a] ?? 99) - (RANK_ORDER[b] ?? 99);
    });
  }, [vehicles]);

  useEffect(() => {
    persistSetting(STORAGE_KEYS.boardView, boardView);
  }, [boardView]);

  useEffect(() => {
    persistSetting(STORAGE_KEYS.searchQuery, searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    persistSetting(STORAGE_KEYS.categoryFilter, categoryFilter);
  }, [categoryFilter]);

  useEffect(() => {
    persistSetting(STORAGE_KEYS.modelFilter, modelFilter);
  }, [modelFilter]);

  useEffect(() => {
    persistSetting(STORAGE_KEYS.rankFilter, rankFilter);
  }, [rankFilter]);

  useEffect(() => {
    persistSetting(STORAGE_KEYS.bosFilter, bosFilter);
  }, [bosFilter]);

  useEffect(() => {
    persistSetting(STORAGE_KEYS.arrivalGrouping, arrivalGroupingMode);
  }, [arrivalGroupingMode]);

  useEffect(() => {
    persistSetting(STORAGE_KEYS.sortMode, sortMode);
  }, [sortMode]);

  useEffect(() => {
    if (categoryFilter !== "all" && !categoryOptions.includes(categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categoryOptions]);

  useEffect(() => {
    if (rankFilter !== "all" && !rankOptions.includes(rankFilter)) {
      setRankFilter("all");
    }
  }, [rankFilter, rankOptions]);

  useEffect(() => {
    if (!skippedCopyStatus) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSkippedCopyStatus(null);
    }, 1800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [skippedCopyStatus]);

  /** Vehicles filtered by everything except the model dropdown. Used to derive
   *  dynamic model options so the dropdown only shows models visible under
   *  the current category / rank / BOS / search constraints. */
  const preModelFilteredVehicles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      if (categoryFilter !== "all" && vehicle.category !== categoryFilter) {
        return false;
      }

      if (rankFilter !== "all" && vehicle.rank !== rankFilter) {
        return false;
      }

      const normalizedBos = normalizeBosValue(vehicle.bos);
      if (bosFilter === "y" && normalizedBos !== "Y") {
        return false;
      }
      if (bosFilter === "n" && normalizedBos !== "N") {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const vehicleFieldsMatch = [
        vehicle.code,
        vehicle.model,
        vehicle.sourceCode,
        vehicle.category,
        vehicle.grade,
        vehicle.rank,
        vehicle.type,
        vehicle.arrival,
        vehicle.color,
        vehicle.interiorColor,
        vehicle.bos,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

      if (vehicleFieldsMatch) {
        return true;
      }

      const vehicleMatches = orderMatchesByVehicle.get(vehicle.id) ?? [];
      const orderFieldsMatch = vehicleMatches.some(
        (m) =>
          m.customerName.toLowerCase().includes(normalizedQuery) ||
          m.salesperson.toLowerCase().includes(normalizedQuery),
      );

      return orderFieldsMatch;
    });
  }, [vehicles, categoryFilter, rankFilter, bosFilter, searchQuery, orderMatchesByVehicle]);

  const filteredVehicles = useMemo(() => {
    if (modelFilter === "all") {
      return preModelFilteredVehicles;
    }
    return preModelFilteredVehicles.filter(
      (vehicle) => getDisplayModel(vehicle.model, vehicle.code) === modelFilter,
    );
  }, [preModelFilteredVehicles, modelFilter]);

  const modelOptions = useMemo<{ value: string; label: string }[]>(() => {
    const counts = new Map<string, number>();
    for (const vehicle of preModelFilteredVehicles) {
      const model = getDisplayModel(vehicle.model, vehicle.code);
      counts.set(model, (counts.get(model) ?? 0) + vehicle.quantity);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([model, count]) => ({ value: model, label: `${model} (${count})` }));
  }, [preModelFilteredVehicles]);

  useEffect(() => {
    if (modelFilter !== "all" && !modelOptions.some((opt) => opt.value === modelFilter)) {
      setModelFilter("all");
    }
  }, [modelFilter, modelOptions]);

  // Apply URL params (e.g., ?model=RX350&view=matches from dashboard badge click)
  // Stashes params on first render, applies model filter once modelOptions load
  const [highlightDxModel, setHighlightDxModel] = useState<string | null>(null);
  const stashedUrlParams = useRef<{ model: string | null; view: string | null; scrollTo: string | null; dxModel: string | null } | null>(null);
  useEffect(() => {
    if (urlModelApplied.current) return;
    // On first run, stash the URL params before they get cleared by navigation
    if (!stashedUrlParams.current) {
      const urlModel = searchParams.get("model");
      const urlView = searchParams.get("view");
      const urlScrollTo = searchParams.get("scrollTo");
      const urlDxModel = searchParams.get("dxModel");
      if (urlModel || urlView || urlScrollTo || urlDxModel) {
        stashedUrlParams.current = { model: urlModel, view: urlView, scrollTo: urlScrollTo, dxModel: urlDxModel };
        // Apply view immediately (no dependency on data loading)
        if (urlView && BOARD_VIEW_OPTIONS.includes(urlView as BoardView)) {
          setBoardView(urlView as BoardView);
        }
        // Highlight DX model matches
        if (urlDxModel) {
          setHighlightDxModel(urlDxModel.replace(/\s+/g, "").toUpperCase());
          // Auto-clear highlight after 30 seconds
          setTimeout(() => setHighlightDxModel(null), 30000);
        }
        // Scroll to target after a short delay (let DOM render)
        if (urlScrollTo) {
          setTimeout(() => {
            const el = document.getElementById(urlScrollTo);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 500);
        }
        // Clean URL params
        searchParams.delete("model");
        searchParams.delete("view");
        searchParams.delete("scrollTo");
        searchParams.delete("dxModel");
        setSearchParams(searchParams, { replace: true });
      }
    }
    // Apply model filter once options are available
    const stashed = stashedUrlParams.current;
    if (stashed?.model && modelOptions.length > 0) {
      urlModelApplied.current = true;
      const normalizedUrl = stashed.model.replace(/\s+/g, "").toUpperCase();
      const exactOption = modelOptions.find((opt) => opt.value === stashed.model);
      const fuzzyOption = !exactOption
        ? modelOptions.find((opt) => opt.value.replace(/\s+/g, "").toUpperCase() === normalizedUrl)
        : null;
      const matchedModel = exactOption?.value ?? fuzzyOption?.value;
      if (matchedModel) {
        setModelFilter(matchedModel);
      }
    }
  }, [modelOptions]); // eslint-disable-line react-hooks/exhaustive-deps -- one-time when options load

  const matchedFilteredVehicles = useMemo(
    () => filteredVehicles.filter((v) => colorMatchedVehicleIds.has(v.id)),
    [filteredVehicles, colorMatchedVehicleIds],
  );

  const unmatchedFilteredVehicles = useMemo(
    () => filteredVehicles.filter((v) => !matchedVehicleIds.has(v.id)),
    [filteredVehicles, matchedVehicleIds],
  );

  const sortedVehicles = useMemo(() => {
    const sorted = [...filteredVehicles];

    sorted.sort((first, second) => {
      // Sort by best match quality: exact color (6) > partial (2) > model-only (0) > no match (-1)
      const firstMatches = orderMatchesByVehicle.get(first.id) ?? [];
      const secondMatches = orderMatchesByVehicle.get(second.id) ?? [];
      const firstBestScore = firstMatches.length > 0 ? Math.max(...firstMatches.map(matchScore)) : -1;
      const secondBestScore = secondMatches.length > 0 ? Math.max(...secondMatches.map(matchScore)) : -1;
      if (firstBestScore !== secondBestScore) return secondBestScore - firstBestScore;

      // Within same match tier, group by model code
      if (firstBestScore >= 0 && secondBestScore >= 0) {
        const codeDiff = first.code.localeCompare(second.code);
        if (codeDiff !== 0) return codeDiff;
      }

      switch (sortMode) {
        case "arrival": {
          const arrivalDiff = compareArrivalValues(first.arrival, second.arrival);
          if (arrivalDiff !== 0) {
            return arrivalDiff;
          }
          return first.code.localeCompare(second.code);
        }

        case "units": {
          const unitDiff = second.quantity - first.quantity;
          if (unitDiff !== 0) {
            return unitDiff;
          }
          return first.code.localeCompare(second.code);
        }

        case "model": {
          const codeDiff = first.code.localeCompare(second.code);
          if (codeDiff !== 0) {
            return codeDiff;
          }
          return compareArrivalValues(first.arrival, second.arrival);
        }

        case "priority":
        default: {
          const rankDiff = (RANK_ORDER[first.rank] ?? 99) - (RANK_ORDER[second.rank] ?? 99);
          if (rankDiff !== 0) {
            return rankDiff;
          }
          const arrivalDiff = compareArrivalValues(first.arrival, second.arrival);
          if (arrivalDiff !== 0) {
            return arrivalDiff;
          }
          return first.code.localeCompare(second.code);
        }
      }
    });

    return sorted;
  }, [filteredVehicles, sortMode, orderMatchesByVehicle]);

  const buildGroupedRows = (vehicleList: AllocationVehicle[]): GroupedAllocationRow[] => {
    const grouped = new Map<string, GroupedAllocationRow>();

    vehicleList.forEach((vehicle) => {
      const arrivalKey =
        arrivalGroupingMode === "bucket"
          ? groupArrivalBucket(vehicle.arrival)
          : vehicle.arrival.trim().toUpperCase() === "TBD"
            ? "UNSCHEDULED"
            : vehicle.arrival;
      const arrivalDisplay =
        arrivalGroupingMode === "bucket"
          ? { primary: formatBuildBucketLabel(arrivalKey), secondary: null }
          : formatArrivalDisplay(arrivalKey);
      const key = `${arrivalKey}|${vehicle.category}|${vehicle.grade}|${vehicle.rank}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.totalUnits += vehicle.quantity;
        existing.vehicles.push(vehicle);
        return;
      }

      grouped.set(key, {
        key,
        arrivalKey,
        arrivalLabel: arrivalDisplay.primary,
        arrivalRelative: arrivalDisplay.secondary,
        category: vehicle.category,
        grade: vehicle.grade,
        rank: vehicle.rank,
        totalUnits: vehicle.quantity,
        vehicles: [vehicle],
      });
    });

    const compareRowArrival = (first: GroupedAllocationRow, second: GroupedAllocationRow) => {
      if (arrivalGroupingMode === "bucket") {
        const bucketDiff =
          (ARRIVAL_BUCKET_ORDER[first.arrivalKey] ?? 99) -
          (ARRIVAL_BUCKET_ORDER[second.arrivalKey] ?? 99);
        if (bucketDiff !== 0) {
          return bucketDiff;
        }
      }

      return compareArrivalValues(first.arrivalKey, second.arrivalKey);
    };

    const getPrimaryModel = (row: GroupedAllocationRow): string => {
      const models = Array.from(
        new Set(row.vehicles.map((vehicle) => getDisplayModel(vehicle.model, vehicle.code))),
      ).sort((a, b) => a.localeCompare(b));
      return models[0] ?? "";
    };

    return Array.from(grouped.values()).sort((first, second) => {
      switch (sortMode) {
        case "arrival": {
          const arrivalDiff = compareRowArrival(first, second);
          if (arrivalDiff !== 0) return arrivalDiff;
          return (RANK_ORDER[first.rank] ?? 99) - (RANK_ORDER[second.rank] ?? 99);
        }
        case "units": {
          const unitDiff = second.totalUnits - first.totalUnits;
          if (unitDiff !== 0) return unitDiff;
          return compareRowArrival(first, second);
        }
        case "model": {
          const modelDiff = getPrimaryModel(first).localeCompare(getPrimaryModel(second));
          if (modelDiff !== 0) return modelDiff;
          return compareRowArrival(first, second);
        }
        case "priority":
        default: {
          const rankDiff = (RANK_ORDER[first.rank] ?? 99) - (RANK_ORDER[second.rank] ?? 99);
          if (rankDiff !== 0) return rankDiff;
          const arrivalDiff = compareRowArrival(first, second);
          if (arrivalDiff !== 0) return arrivalDiff;
          return second.totalUnits - first.totalUnits;
        }
      }
    });
  };

  const matchedGroupedRows = useMemo<GroupedAllocationRow[]>(
    () => buildGroupedRows(matchedFilteredVehicles),
    [matchedFilteredVehicles, arrivalGroupingMode, sortMode],
  );

  const unmatchedGroupedRows = useMemo<GroupedAllocationRow[]>(
    () => buildGroupedRows(unmatchedFilteredVehicles),
    [unmatchedFilteredVehicles, arrivalGroupingMode, sortMode],
  );

  const parseInsights = useMemo(() => {
    if (!parsedResult) {
      return null;
    }

    const skippedWarnings = parsedResult.warnings.filter((warning) =>
      warning.toLowerCase().includes("skipped"),
    );
    const tbdArrivals = parsedResult.vehicles.filter(
      (vehicle) => vehicle.arrival.trim().toUpperCase() === "TBD",
    ).length;
    const tbdDetails = parsedResult.vehicles.reduce((next, vehicle) => {
      let tbdFields = next;
      if (vehicle.color.trim().toUpperCase() === "TBD") {
        tbdFields += 1;
      }
      if (vehicle.interiorColor.trim().toUpperCase() === "TBD") {
        tbdFields += 1;
      }
      return tbdFields;
    }, 0);
    const confidence = deriveParseConfidence(parsedResult);

    return {
      warningCount: parsedResult.warnings.length,
      skippedWarnings,
      tbdArrivals,
      tbdDetails,
      confidence,
    };
  }, [parsedResult]);

  const parseConfidenceTone = useMemo(() => {
    if (!parseInsights) {
      return "bg-stone-100 text-stone-600";
    }

    if (parseInsights.confidence === "High") {
      return "bg-emerald-100 text-emerald-700";
    }
    if (parseInsights.confidence === "Medium") {
      return "bg-amber-100 text-amber-700";
    }
    return "bg-red-100 text-red-700";
  }, [parseInsights]);

  const handleParse = () => {
    setSkippedCopyStatus(null);
    const result = parseAllocationSource(sourceText);
    setParsedResult(result);

    if (result.errors.length > 0) {
      setParseStatus(result.errors[0]);
      return;
    }

    const warningMessage =
      result.warnings.length > 0
        ? `Parsed ${result.itemCount} rows with ${result.warnings.length} warning(s).`
        : `Parsed ${result.itemCount} rows successfully.`;

    setParseStatus(warningMessage);
  };

  const handleCopySkippedWarnings = async () => {
    if (!parseInsights || parseInsights.skippedWarnings.length === 0) {
      return;
    }

    const textToCopy = parseInsights.skippedWarnings.join("\n");
    try {
      await navigator.clipboard.writeText(textToCopy);
      setSkippedCopyStatus("Skipped lines copied.");
    } catch {
      setSkippedCopyStatus("Copy not available in this browser.");
    }
  };

  const PDF_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  const processPdfFile = async (file: File) => {
    if (file.size > PDF_MAX_BYTES) {
      alert(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`);
      return;
    }

    setIsExtractingPdf(true);
    setSkippedCopyStatus(null);
    setParseStatus(`Extracting text from ${file.name}...`);

    try {
      const extractedText = await extractAllocationTextFromPdf(file);
      setSourceText(extractedText);
      setParsedResult(null);
      setParseStatus(`Loaded ${file.name}. Click Parse Source to validate and preview rows.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to extract text from the uploaded PDF.";
      if (/failed to fetch dynamically imported module/i.test(message)) {
        setParseStatus(
          "PDF parser module was stale after a dev-server reload. Hard refresh the page (Ctrl+Shift+R) and upload again.",
        );
        return;
      }
      setParseStatus(message);
    } finally {
      setIsExtractingPdf(false);
    }
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await processPdfFile(file);
    event.target.value = "";
  };

  const handlePdfDrag = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isExtractingPdf) {
      return;
    }

    if (event.type === "dragenter" || event.type === "dragover") {
      setIsPdfDragActive(true);
      return;
    }

    if (event.type === "dragleave") {
      setIsPdfDragActive(false);
    }
  };

  const handlePdfDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsPdfDragActive(false);

    if (isExtractingPdf) {
      return;
    }

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    await processPdfFile(file);
  };

  const handlePublish = async () => {
    if (!currentUser.isManager || !parsedResult || parsedResult.errors.length > 0) {
      return;
    }

    setIsPublishing(true);
    setPublishStatus(null);

    try {
      await publishAllocationSnapshot(
        {
          reportDate: parsedResult.reportDate,
          itemCount: parsedResult.itemCount,
          summary: parsedResult.summary,
          vehicles: parsedResult.vehicles,
        },
        currentUser.uid,
        currentUser.email ?? "unknown@priorityautomotive.com",
      );

      setPublishStatus("Allocation snapshot published successfully.");
      setSourceText("");
      setParsedResult(null);
      setParseStatus(null);
      setIsManagerPanelOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to publish allocation snapshot.";
      setPublishStatus(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleLinkOrder = async (
    orderId: string,
    vehicleId: string,
    vehicleInfo: string,
  ) => {
    setLinkingOrderId(orderId);
    try {
      await linkVehicleToOrder(orderId, vehicleId, vehicleInfo, currentUser.uid);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to link vehicle";
      console.error("Link failed:", msg);
      alert(msg);
    } finally {
      setLinkingOrderId(null);
    }
  };

  const handleUnlinkOrder = async (orderId: string) => {
    setLinkingOrderId(orderId);
    try {
      await unlinkVehicleFromOrder(orderId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to unlink vehicle";
      console.error("Unlink failed:", msg);
      alert(msg);
    } finally {
      setLinkingOrderId(null);
    }
  };

  const renderVariantCards = (row: GroupedAllocationRow) => {
    const variants = Array.from(
      row.vehicles.reduce((accumulator, vehicle) => {
        const fa = getFactoryAccessories(vehicle);
        const ppo = getPostProductionOptions(vehicle);
        const key = `${vehicle.sourceCode ?? ""}|${vehicle.code}|${vehicle.model ?? ""}|${vehicle.grade}|${vehicle.arrival}|${vehicle.color}|${vehicle.interiorColor}|${vehicle.bos}|${fa.join(",")}|${ppo.join(",")}`;
        const existing = accumulator.get(key);

        if (existing) {
          existing.units += vehicle.quantity;
          existing.vehicleIds.push(vehicle.id);
          existing.factoryAccessories = Array.from(new Set([...existing.factoryAccessories, ...fa]));
          existing.postProductionOptions = Array.from(new Set([...existing.postProductionOptions, ...ppo]));
        } else {
          accumulator.set(key, {
            code: vehicle.code, model: vehicle.model, sourceCode: vehicle.sourceCode,
            grade: vehicle.grade, arrival: vehicle.arrival, color: vehicle.color,
            interiorColor: vehicle.interiorColor, bos: vehicle.bos,
            units: vehicle.quantity, vehicleIds: [vehicle.id],
            factoryAccessories: fa, postProductionOptions: ppo,
          });
        }
        return accumulator;
      }, new Map<string, { code: string; model?: string; sourceCode?: string; grade: string; arrival: string; color: string; interiorColor: string; bos: string; units: number; vehicleIds: string[]; factoryAccessories: string[]; postProductionOptions: string[] }>()),
    )
      .map((entry) => entry[1])
      .sort((a, b) => {
        return getDisplayCode(a.sourceCode, a.code).localeCompare(getDisplayCode(b.sourceCode, b.code))
          || getDisplayModel(a.model, a.code).localeCompare(getDisplayModel(b.model, b.code))
          || a.grade.localeCompare(b.grade)
          || compareArrivalValues(a.arrival, b.arrival)
          || formatColorDisplay(a.color).localeCompare(formatColorDisplay(b.color))
          || formatInteriorColorDisplay(a.interiorColor).localeCompare(formatInteriorColorDisplay(b.interiorColor));
      });

    return variants.map((variant) => {
      const arrivalDisplay = formatArrivalDisplay(variant.arrival);
      const colorDisplay = formatColorDisplay(variant.color);
      const interiorDisplay = formatInteriorColorDisplay(variant.interiorColor);
      const daysOutDisplay = arrivalDisplay.secondary ?? "TBD";
      const fa = variant.factoryAccessories.join(", ");
      const ppo = variant.postProductionOptions.join(", ");
      const showBos = normalizeBosValue(variant.bos) === "Y";
      const detailRows: Array<{ label: string; value: string }> = [
        { label: "Exterior", value: colorDisplay },
        { label: "Interior", value: interiorDisplay },
        { label: "Build / Port", value: arrivalDisplay.primary },
        { label: "Days Out", value: daysOutDisplay },
      ];
      if (showBos) detailRows.push({ label: "BOS", value: "Y (Changeable)" });
      if (fa) detailRows.push({ label: "Factory Accessories", value: fa });
      if (ppo) detailRows.push({ label: "Post-Production Options", value: ppo });

      // Vehicle ID and info for linking
      const variantVehicleId = variant.vehicleIds[0];
      const variantVehicleInfo = [
        getDisplayModel(variant.model, variant.code),
        formatColorDisplay(variant.color),
        variant.grade,
        variant.arrival ? `Arriving ${variant.arrival}` : null,
      ].filter(Boolean).join(" — ");

      const variantMatches = variant.vehicleIds.flatMap((vid) => orderMatchesByVehicle.get(vid) ?? []);
      const uniqueMatches = sortMatchedOrders(Array.from(new Map(variantMatches.map((m) => [m.orderId, m])).values()));
      const exactMatches = uniqueMatches.filter((m) => m.colorMatch === "exact" || m.interiorMatch === "exact");
      const partialMatches = uniqueMatches.filter((m) => (m.colorMatch === "partial" || m.interiorMatch === "partial") && m.colorMatch !== "exact" && m.interiorMatch !== "exact");
      const modelOnlyMatches = uniqueMatches.filter((m) => !m.colorMatch && !m.interiorMatch);

      return (
        <div
          key={`${row.key}-${variant.sourceCode ?? ""}-${variant.code}-${variant.grade}-${variant.arrival}-${variant.color}-${variant.bos}`}
          className="group rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-stone-300 transition-colors lg:p-5"
          data-testid="allocation-strategy-vehicle-card"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-lg font-bold tracking-tight text-stone-900">
                {getDisplayCode(variant.sourceCode, variant.code)}{" "}
                <span className="px-1 text-stone-300">·</span>
                <span className="text-stone-500">{getDisplayModel(variant.model, variant.code)}</span>
              </p>
              <p className="mt-1 text-sm text-stone-500">Trim: {variant.grade}</p>
            </div>
            {variant.units > 1 && (
              <span className="rounded-full border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-800">
                Qty: {variant.units}
              </span>
            )}
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4 lg:gap-3">
            {detailRows.map((detail) => (
              <div key={`${row.key}-${variant.code}-${detail.label}`} className="rounded-md bg-stone-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-stone-400">{detail.label}</dt>
                <dd className="mt-1 font-semibold text-stone-800">{detail.value}</dd>
              </div>
            ))}
          </dl>

          {uniqueMatches.length > 0 && currentUser.isManager && (
            <div className="mt-4 space-y-2 border-t border-stone-100 pt-3">
              {exactMatches.length > 0 && (
                <div className="border-l-2 border-emerald-500 bg-emerald-50/50 rounded-r-md pl-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Color Match ({exactMatches.length})</p>
                  <div className="mt-2 space-y-1">
                    {exactMatches.map((m, index) => (
                      <div key={m.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-600">{index + 1}</span>
                        <span className="text-sm font-semibold text-stone-900">{m.customerName}</span>
                        {m.orderDate?.trim() && <span className="font-medium text-xs text-stone-500">({new Date(m.orderDate.trim()).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>}
                        <span className="text-sm text-stone-500">{m.salesperson || "TBD"}</span>
                        <span className="text-xs text-stone-500">{m.model} / {m.modelNumber}</span>
                        <a href={`/#/?highlight=${m.orderId}`} className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors" title="View order">View</a>
                        {m.allocatedVehicleId === variantVehicleId ? (
                          <button
                            onClick={() => void handleUnlinkOrder(m.orderId)}
                            disabled={linkingOrderId === m.orderId}
                            aria-label={`Unlink ${m.customerName} from this vehicle`}
                            className="rounded bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                          >
                            {linkingOrderId === m.orderId ? "..." : "Linked ✓"}
                          </button>
                        ) : m.allocatedVehicleId ? (
                          <span className="rounded bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">Linked elsewhere</span>
                        ) : (
                          <button
                            onClick={() => void handleLinkOrder(m.orderId, variantVehicleId, variantVehicleInfo)}
                            disabled={linkingOrderId === m.orderId}
                            aria-label={`Link ${m.customerName} to this vehicle`}
                            className="rounded bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200 transition-colors disabled:opacity-50"
                          >
                            {linkingOrderId === m.orderId ? "Linking..." : "Link"}
                          </button>
                        )}
                        {m.extColorMatched && <span className={`rounded px-2 py-0.5 text-xs font-semibold ${m.colorMatch === "exact" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>Ext{m.extChoiceMatched && m.extChoiceMatched > 1 ? ` (${m.extChoiceMatched}${m.extChoiceMatched === 2 ? "nd" : "rd"} choice)` : ""}: {m.extColorMatched}</span>}
                        {m.intColorMatched && <span className={`rounded px-2 py-0.5 text-xs font-semibold ${m.interiorMatch === "exact" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>Int{m.intChoiceMatched && m.intChoiceMatched > 1 ? ` (${m.intChoiceMatched}${m.intChoiceMatched === 2 ? "nd" : "rd"} choice)` : ""}: {m.intColorMatched}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {partialMatches.length > 0 && (
                <details className="border-l-2 border-indigo-400 bg-indigo-50/50 rounded-r-md">
                  <summary className="cursor-pointer pl-3 py-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">Similar Color ({partialMatches.length})</summary>
                  <div className="pl-3 pb-2 mt-1.5 space-y-1">
                    {partialMatches.map((m, index) => (
                      <div key={m.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-indigo-800">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-600">{index + 1}</span>
                        <span className="text-sm font-semibold text-stone-900">{m.customerName}</span>
                        {m.orderDate?.trim() && <span className="font-medium text-xs text-stone-500">({new Date(m.orderDate.trim()).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>}
                        <span className="text-sm text-stone-500">{m.salesperson || "TBD"}</span>
                        <span className="text-xs text-stone-500">{m.model} / {m.modelNumber}</span>
                        <a href={`/#/?highlight=${m.orderId}`} className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors" title="View order">View</a>
                        {m.allocatedVehicleId === variantVehicleId ? (
                          <button
                            onClick={() => void handleUnlinkOrder(m.orderId)}
                            disabled={linkingOrderId === m.orderId}
                            aria-label={`Unlink ${m.customerName} from this vehicle`}
                            className="rounded bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                          >
                            {linkingOrderId === m.orderId ? "..." : "Linked ✓"}
                          </button>
                        ) : m.allocatedVehicleId ? (
                          <span className="rounded bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">Linked elsewhere</span>
                        ) : (
                          <button
                            onClick={() => void handleLinkOrder(m.orderId, variantVehicleId, variantVehicleInfo)}
                            disabled={linkingOrderId === m.orderId}
                            aria-label={`Link ${m.customerName} to this vehicle`}
                            className="rounded bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200 transition-colors disabled:opacity-50"
                          >
                            {linkingOrderId === m.orderId ? "Linking..." : "Link"}
                          </button>
                        )}
                        {(m.extColorMatched || m.exteriorColor1) && <span className="text-indigo-600">Ext{m.extChoiceMatched && m.extChoiceMatched > 1 ? ` (${m.extChoiceMatched}${m.extChoiceMatched === 2 ? "nd" : "rd"} choice)` : ""}: {m.extColorMatched || m.exteriorColor1}</span>}
                        {(m.intColorMatched || m.interiorColor1) && <span className="text-indigo-600">Int{m.intChoiceMatched && m.intChoiceMatched > 1 ? ` (${m.intChoiceMatched}${m.intChoiceMatched === 2 ? "nd" : "rd"} choice)` : ""}: {m.intColorMatched || m.interiorColor1}</span>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {modelOnlyMatches.length > 0 && (
                <details className="rounded-lg border border-stone-200 bg-stone-50">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-stone-400 hover:text-stone-500">+{modelOnlyMatches.length} model-only match{modelOnlyMatches.length === 1 ? "" : "es"}</summary>
                  <div className="space-y-1 px-3 pb-2">
                    {modelOnlyMatches.map((m, index) => (
                      <div key={m.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-600">{index + 1}</span>
                        <span className="text-sm font-semibold text-stone-900">{m.customerName}</span>
                        {m.orderDate?.trim() && <span className="font-medium text-xs text-stone-500">({new Date(m.orderDate.trim()).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>}
                        <span className="text-sm text-stone-500">{m.salesperson || "TBD"}</span>
                        <span className="text-xs text-stone-500">{m.model} / {m.modelNumber}</span>
                        <a href={`/#/?highlight=${m.orderId}`} className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors" title="View order">View</a>
                        {m.allocatedVehicleId === variantVehicleId ? (
                          <button
                            onClick={() => void handleUnlinkOrder(m.orderId)}
                            disabled={linkingOrderId === m.orderId}
                            aria-label={`Unlink ${m.customerName} from this vehicle`}
                            className="rounded bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                          >
                            {linkingOrderId === m.orderId ? "..." : "Linked ✓"}
                          </button>
                        ) : m.allocatedVehicleId ? (
                          <span className="rounded bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">Linked elsewhere</span>
                        ) : (
                          <button
                            onClick={() => void handleLinkOrder(m.orderId, variantVehicleId, variantVehicleInfo)}
                            disabled={linkingOrderId === m.orderId}
                            aria-label={`Link ${m.customerName} to this vehicle`}
                            className="rounded bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200 transition-colors disabled:opacity-50"
                          >
                            {linkingOrderId === m.orderId ? "Linking..." : "Link"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {uniqueMatches.length > 0 && !currentUser.isManager && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                {uniqueMatches.length} matching order{uniqueMatches.length === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <section className="rounded-xl border border-stone-200 bg-white text-stone-800 shadow-sm">
      <div className="border-b border-stone-200 px-4 sm:px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-indigo-600">Live Allocation</p>
            <h2 className="text-2xl font-bold tracking-tight text-stone-900">Allocation Board</h2>
            <p className="mt-1 text-sm text-stone-500">
              Snapshot source of truth for consultant strategy and live inventory visibility.
            </p>
          </div>

          <div className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm">
            <p className="text-stone-500">
              <span className="font-semibold text-stone-800">Published:</span>{" "}
              {formatTimestamp(latestSnapshot?.publishedAt)}
            </p>
            <p className="text-stone-500">
              <span className="font-semibold text-stone-800">Publisher:</span>{" "}
              {latestSnapshot?.publishedByEmail || "Not published yet"}
            </p>
            <p className="text-stone-500">
              <span className="font-semibold text-stone-800">Report Date:</span>{" "}
              {latestSnapshot?.reportDate || "Unknown"}
            </p>
          </div>
        </div>

        {currentUser.isManager && (
          <div className="mt-5 flex items-center justify-end">
            <button
              onClick={() => setIsManagerPanelOpen((previous) => !previous)}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
              data-testid="allocation-manager-toggle"
            >
              {isManagerPanelOpen ? "Hide Allocation Update" : "Update Allocation"}
            </button>
          </div>
        )}
      </div>

      {currentUser.isManager && isManagerPanelOpen && (
        <div className="overflow-hidden transition-all duration-300 max-h-[2000px] opacity-100" style={{ animation: "slideDown 300ms ease-out" }}>
        <div className="border-b border-stone-200 bg-stone-50 px-6 py-5" data-testid="allocation-manager-panel">
          <h3 className="text-lg font-semibold text-stone-900">Manager Update Panel</h3>
          <p className="mt-1 text-sm text-stone-500">
            Paste Lexus allocation source text, parse, validate, and publish the new snapshot.
          </p>

          <div
            className={`mt-4 rounded-xl border border-dashed p-3 transition-colors ${
              isPdfDragActive
                ? "border-indigo-400 bg-indigo-50"
                : "border-stone-300 bg-stone-50"
            }`}
            onDragEnter={handlePdfDrag}
            onDragOver={handlePdfDrag}
            onDragLeave={handlePdfDrag}
            onDrop={handlePdfDrop}
            data-testid="allocation-pdf-dropzone"
          >
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                disabled={isExtractingPdf}
                className="rounded-lg border border-stone-300 bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:bg-stone-200"
                data-testid="allocation-pdf-upload"
              >
                {isExtractingPdf ? "Extracting PDF..." : "Upload PDF"}
              </button>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePdfUpload}
                className="hidden"
                aria-label="Upload allocation PDF"
                data-testid="allocation-pdf-input"
              />
              <p className="text-xs text-stone-400">
                Drag and drop a Lexus allocation PDF here, or use Upload PDF.
              </p>
            </div>
          </div>

          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            className="mt-4 min-h-44 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 shadow-sm outline-none ring-indigo-500 transition focus:ring"
            placeholder="Paste allocation source text..."
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleParse}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Parse Source
            </button>
            <button
              onClick={handlePublish}
              disabled={
                isPublishing ||
                !parsedResult ||
                parsedResult.errors.length > 0 ||
                parsedResult.vehicles.length === 0
              }
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-stone-200"
            >
              {isPublishing ? "Publishing..." : "Publish Snapshot"}
            </button>
          </div>

          {parseStatus && <p className="mt-3 text-sm text-stone-700">{parseStatus}</p>}
          {publishStatus && <p className="mt-2 text-sm text-indigo-700">{publishStatus}</p>}

          {parsedResult && (
            <div className="mt-4 rounded-xl border border-stone-300 bg-white/80 p-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
                Parse Preview
              </h4>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                  Parsed: {parsedResult.itemCount}
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                  Units: {parsedResult.summary.units}
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                  Hybrid: {parsedResult.summary.hybridMix}%
                </span>
                {parseInsights && (
                  <>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                      Warnings: {parseInsights.warningCount}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                      TBD Fields: {parseInsights.tbdArrivals + parseInsights.tbdDetails}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 ${parseConfidenceTone}`}>
                      Confidence: {parseInsights.confidence}
                    </span>
                  </>
                )}
              </div>

              {parsedResult.errors.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-600">
                  {parsedResult.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}

              {parsedResult.warnings.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700">
                  {parsedResult.warnings.slice(0, 5).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                  {parsedResult.warnings.length > 5 && (
                    <li>{parsedResult.warnings.length - 5} more warnings</li>
                  )}
                </ul>
              )}

              {parseInsights && parseInsights.skippedWarnings.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-600">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      Skipped Lines: {parseInsights.skippedWarnings.length}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopySkippedWarnings}
                      className="rounded border border-amber-400 px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      Copy
                    </button>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-amber-800">
                      Show skipped line details
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-600">
                      {parseInsights.skippedWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                  {skippedCopyStatus && <p className="mt-2 text-emerald-700">{skippedCopyStatus}</p>}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      <div className="px-4 sm:px-6 py-5">
        <div className="sticky top-16 z-20">
          <div className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white/90 p-4 backdrop-blur-sm lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-center gap-2" role="tablist">
              <button
                onClick={() => setBoardView("strategy")}
                role="tab"
                aria-selected={boardView === "strategy"}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  boardView === "strategy"
                    ? "bg-indigo-600 text-white"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                Strategy View
              </button>
              <button
                onClick={() => setBoardView("log")}
                role="tab"
                aria-selected={boardView === "log"}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  boardView === "log"
                    ? "bg-indigo-600 text-white"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                Full Log View
              </button>
              {currentUser.isManager && matchSummary.matchedVehicleCount > 0 && (
                <button
                  onClick={() => setBoardView("matches")}
                  role="tab"
                  aria-selected={boardView === "matches"}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    boardView === "matches"
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  Matches ({matchSummary.matchedOrderCount})
                </button>
              )}
            </div>

            {/* Mobile: show filter toggle button */}
            <button
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className="flex w-full items-center justify-between rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 lg:hidden"
            >
              {(() => {
                const activeCount = [categoryFilter !== "all", modelFilter !== "all", rankFilter !== "all", bosFilter !== "all", searchQuery.trim() !== ""].filter(Boolean).length;
                return <span>Filters{activeCount > 0 ? ` (${activeCount})` : ""}</span>;
              })()}
              <svg className={`h-4 w-4 transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className={`${mobileFiltersOpen ? "grid" : "hidden"} gap-2 sm:grid-cols-2 lg:grid lg:grid-cols-7 lg:gap-3`}>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search code, model, customer, salesperson..."
                aria-label="Search allocation vehicles"
                className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none ring-indigo-500 transition focus:ring"
              />
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                aria-label="Filter by category"
                className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none ring-indigo-500 transition focus:ring"
              >
                <option value="all">All Categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                value={modelFilter}
                onChange={(event) => setModelFilter(event.target.value)}
                aria-label="Filter by model"
                className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none ring-indigo-500 transition focus:ring"
              >
                <option value="all">All Models</option>
                {modelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={rankFilter}
                onChange={(event) => setRankFilter(event.target.value)}
                aria-label="Filter by priority"
                className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none ring-indigo-500 transition focus:ring"
              >
                <option value="all">All Priorities</option>
                {rankOptions.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
              <select
                value={bosFilter}
                onChange={(event) => setBosFilter(event.target.value as BosFilter)}
                aria-label="Filter by BOS"
                className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none ring-indigo-500 transition focus:ring"
              >
                <option value="all">All BOS</option>
                <option value="y">BOS: Y (Changeable)</option>
                <option value="n">BOS: N (Locked)</option>
              </select>
              <select
                value={arrivalGroupingMode}
                onChange={(event) =>
                  setArrivalGroupingMode(event.target.value as ArrivalGroupingMode)
                }
                aria-label="Build date grouping mode"
                className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none ring-indigo-500 transition focus:ring"
              >
                <option value="bucket">Build Date: Bucket</option>
                <option value="date">Build Date: Exact Date</option>
              </select>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                aria-label="Sort allocation rows"
                className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none ring-indigo-500 transition focus:ring"
              >
                <option value="priority">Sort: Priority</option>
                <option value="arrival">Sort: Build Date</option>
                <option value="units">Sort: Units</option>
                <option value="model">Sort: Model</option>
              </select>
            </div>
            {(categoryFilter !== "all" || modelFilter !== "all" || rankFilter !== "all" || bosFilter !== "all" || searchQuery) && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("all");
                  setModelFilter("all");
                  setRankFilter("all");
                  setBosFilter("all");
                }}
                className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors lg:mt-0 lg:ml-auto"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading allocation data">
            <div className="flex gap-6">
              <div className="h-6 w-20 animate-pulse rounded bg-stone-200" />
              <div className="h-6 w-24 animate-pulse rounded bg-stone-200" />
              <div className="h-6 w-32 animate-pulse rounded bg-stone-200" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-stone-200 p-4 space-y-3">
                <div className="h-5 w-48 animate-pulse rounded bg-stone-200" />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="h-12 animate-pulse rounded bg-stone-100" />
                  <div className="h-12 animate-pulse rounded bg-stone-100" />
                  <div className="h-12 animate-pulse rounded bg-stone-100" />
                  <div className="h-12 animate-pulse rounded bg-stone-100" />
                </div>
              </div>
            ))}
          </div>
        )}
        {loadError && <p className="mt-6 text-sm text-red-600">{loadError}</p>}

        {!isLoading && !loadError && vehicles.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
            <p className="text-sm text-stone-500">
              No published allocation snapshot yet. Managers can publish from Update Allocation.
            </p>
          </div>
        )}

        {!isLoading && !loadError && vehicles.length > 0 && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-stone-500 mt-5">
              <span><span className="text-lg font-semibold text-stone-900">{filteredVehicles.length}</span> units</span>
              <span className="text-stone-300">&middot;</span>
              <span><span className="text-lg font-semibold text-stone-900">{latestSnapshot?.summary.hybridMix ?? 0}%</span> hybrid</span>
              <span className="text-stone-300">&middot;</span>
              <span>
                <span className="sr-only">Order Matches</span>
                <span className={`text-lg font-semibold ${matchSummary.matchedOrderCount > 0 ? "text-indigo-600" : "text-stone-900"}`}>{matchSummary.matchedOrderCount}</span> order match{matchSummary.matchedOrderCount === 1 ? "" : "es"}
                {matchSummary.matchedOrderCount > 0 && (
                  <span className="ml-1 text-xs text-stone-400">
                    ({matchSummary.matchedOrderCount} active order{matchSummary.matchedOrderCount === 1 ? "" : "s"} matched to {matchSummary.matchedVehicleCount} allocation vehicle{matchSummary.matchedVehicleCount === 1 ? "" : "s"})
                  </span>
                )}
              </span>
            </div>

            {boardView === "matches" && currentUser.isManager ? (
              <div className="mt-5 space-y-4" data-testid="allocation-matches-view">
                <p className="text-sm text-stone-500">
                  Showing only vehicles that match customer pre-orders — {matchSummary.matchedVehicleCount} vehicle{matchSummary.matchedVehicleCount !== 1 ? "s" : ""} matching {matchSummary.matchedOrderCount} order{matchSummary.matchedOrderCount !== 1 ? "s" : ""}.
                </p>
                {matchedGroupedRows.length > 0 ? (
                  <div className="space-y-3">
                    {matchedGroupedRows.map((row) => (
                      <div key={row.key}>
                        {renderVariantCards(row)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-stone-400">No matching vehicles found with current filters.</p>
                )}
              </div>
            ) : boardView === "strategy" ? (
              <div className="mt-5 space-y-6" data-testid="allocation-strategy-view">
                {matchedGroupedRows.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center gap-3 border-b border-emerald-200 pb-2">
                      <h3 className="text-lg font-bold text-emerald-700">Customer Matches</h3>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                        {matchSummary.matchedOrderCount} order{matchSummary.matchedOrderCount === 1 ? "" : "s"} / {matchSummary.matchedVehicleCount} vehicle{matchSummary.matchedVehicleCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {matchedGroupedRows.map((row) => (
                        <article key={`matched-${row.key}`} className="grid gap-3">
                          <div className="grid gap-3">
                            {renderVariantCards(row)}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {unmatchedGroupedRows.length > 0 && (
                  <details className="group" open={matchedGroupedRows.length === 0}>
                    <summary className="mb-3 flex cursor-pointer items-center gap-3 border-b border-stone-200 pb-2">
                      <h3 className="text-lg font-bold text-stone-500 group-open:text-stone-700">Available Inventory</h3>
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-500">
                        {unmatchedFilteredVehicles.length} vehicle{unmatchedFilteredVehicles.length === 1 ? "" : "s"}
                      </span>
                    </summary>
                    <div className="space-y-3">
                      {unmatchedGroupedRows.map((row) => (
                        <article key={`unmatched-${row.key}`} className="grid gap-3">
                          <div className="grid gap-3">
                            {renderVariantCards(row)}
                          </div>
                        </article>
                      ))}
                    </div>
                  </details>
                )}

                {/* Fallback: no vehicles at all after filtering */}
                {matchedGroupedRows.length === 0 && unmatchedGroupedRows.length === 0 && (
                  <p className="mt-4 text-center text-sm text-stone-400">No vehicles match current filters.</p>
                )}
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-xl border border-stone-200">
                <table className="min-w-full divide-y divide-stone-200 text-sm" data-testid="allocation-log-view">
                  <thead className="bg-stone-50">
                    <tr className="text-left text-xs uppercase tracking-wider text-stone-400">
                      <th scope="col" className="px-3 py-3">Code</th>
                      <th scope="col" className="px-3 py-3">Model</th>
                      <th scope="col" className="px-3 py-3">Grade / Trim</th>
                      <th scope="col" className="px-3 py-3">Exterior</th>
                      <th scope="col" className="px-3 py-3">Interior</th>
                      <th scope="col" className="px-3 py-3">Build / Port</th>
                      <th scope="col" className="px-3 py-3">BOS</th>
                      <th scope="col" className="px-3 py-3">Qty</th>
                      <th scope="col" className="px-3 py-3">Matched Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 bg-white">
                    {sortedVehicles.map((vehicle) => {
                      const arrivalDisplay = formatArrivalDisplay(vehicle.arrival);
                      const bosDisplay = formatBosDisplay(vehicle.bos);
                      return (
                        <tr key={vehicle.id} className="text-stone-700 hover:bg-stone-50 transition-colors">
                          <td className="px-3 py-2 font-semibold text-stone-900">
                            {getDisplayCode(vehicle.sourceCode, vehicle.code)}
                          </td>
                          <td className="px-3 py-2">{getDisplayModel(vehicle.model, vehicle.code)}</td>
                          <td className="px-3 py-2">{vehicle.grade}</td>
                          <td className="px-3 py-2">{formatColorDisplay(vehicle.color)}</td>
                          <td className="px-3 py-2">{formatInteriorColorDisplay(vehicle.interiorColor)}</td>
                          <td className="px-3 py-2">
                            <p>{arrivalDisplay.primary}</p>
                            {arrivalDisplay.secondary && (
                              <p className="text-xs text-stone-400">{arrivalDisplay.secondary}</p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${bosDisplay.tone}`}>
                              {bosDisplay.value}
                            </span>
                          </td>
                          <td className="px-3 py-2">{vehicle.quantity > 1 ? vehicle.quantity : null}</td>
                          <td className="px-3 py-2">
                            {(() => {
                              const rawMatched = orderMatchesByVehicle.get(vehicle.id);
                              if (!rawMatched || rawMatched.length === 0) return null;
                              if (!currentUser.isManager) {
                                return <span className="text-xs text-amber-700">{rawMatched.length}</span>;
                              }
                              const matched = sortMatchedOrders(rawMatched);
                              const logVehicleInfo = [
                                getDisplayModel(vehicle.model, vehicle.code),
                                formatColorDisplay(vehicle.color),
                                vehicle.grade,
                                vehicle.arrival ? `Arriving ${vehicle.arrival}` : null,
                              ].filter(Boolean).join(" — ");
                              return (
                                <div className="space-y-1">
                                  {matched.map((m) => (
                                    <div key={m.orderId} className="flex flex-wrap items-center gap-1 text-xs">
                                      <span className="font-semibold text-stone-900">{m.customerName}</span>
                                      {m.orderDate?.trim() && <span className="font-medium text-xs text-stone-500">({new Date(m.orderDate.trim()).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>}
                                      <span className="text-stone-500">({m.salesperson || "TBD"})</span>
                                      {m.colorMatch === "exact" && (
                                        <span className="rounded bg-emerald-100 px-1 py-0.5 text-xs font-semibold text-emerald-700">EXT</span>
                                      )}
                                      {m.colorMatch === "partial" && (
                                        <span className="rounded bg-indigo-100 px-1 py-0.5 text-xs font-semibold text-indigo-700">~EXT</span>
                                      )}
                                      {m.interiorMatch === "exact" && (
                                        <span className="rounded bg-emerald-100 px-1 py-0.5 text-xs font-semibold text-emerald-700">INT</span>
                                      )}
                                      {m.interiorMatch === "partial" && (
                                        <span className="rounded bg-indigo-100 px-1 py-0.5 text-xs font-semibold text-indigo-700">~INT</span>
                                      )}
                                      {m.allocatedVehicleId === vehicle.id ? (
                                        <button
                                          onClick={() => void handleUnlinkOrder(m.orderId)}
                                          disabled={linkingOrderId === m.orderId}
                                          className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                                        >
                                          {linkingOrderId === m.orderId ? "..." : "✓"}
                                        </button>
                                      ) : m.allocatedVehicleId ? (
                                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-400" title="Linked to another vehicle">⊘</span>
                                      ) : (
                                        <button
                                          onClick={() => void handleLinkOrder(m.orderId, vehicle.id, logVehicleInfo)}
                                          disabled={linkingOrderId === m.orderId}
                                          className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-200 transition-colors disabled:opacity-50"
                                        >
                                          {linkingOrderId === m.orderId ? "..." : "Link"}
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* DX Pipeline — live data from Google Sheet */}
      {currentUser.isManager && (dxTrades.length > 0 || dxLoading || dxError) && (
        <div id="dx-pipeline" className="mt-8 px-6 pb-6">
          <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-amber-200 pb-2">
            <h3 className="text-lg font-bold text-amber-700">Dealer Exchange Pipeline</h3>
            {dxTrades.length > 0 && (() => {
              const incoming = dxTrades.filter(t => t.direction === "OURS").length;
              const outgoing = dxTrades.filter(t => t.direction === "THEIRS").length;
              const totalFee = dxTrades.reduce((sum, t) => sum + (Number(t.dxFee) || 0), 0);
              return (
                <>
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                    {dxTrades.length}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-600">
                    {incoming} in / {outgoing} out
                  </span>
                  {totalFee > 0 && (
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
                      ${totalFee.toLocaleString()} fees
                    </span>
                  )}
                </>
              );
            })()}
            {dxLastFetched && (
              <span className="ml-auto text-xs text-stone-400">
                Sheet synced {dxLastFetched.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => {
                void (async () => {
                  setDxLoading(true);
                  setDxError(null);
                  try {
                    const trades = await fetchDxSheet();
                    setDxTrades(trades);
                    setDxLastFetched(new Date());
                  } catch (err) {
                    setDxError(err instanceof Error ? err.message : "Failed to refresh");
                  } finally {
                    setDxLoading(false);
                  }
                })();
              }}
              disabled={dxLoading}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              {dxLoading ? "Syncing..." : "Refresh"}
            </button>
          </div>

          {dxError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {dxError}
            </div>
          )}

          {dxLoading && dxTrades.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-400">Loading DX sheet...</p>
          )}

          {dxTrades.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="min-w-full text-sm">
                <thead className="bg-amber-50 text-left text-xs font-semibold uppercase tracking-wide text-amber-700">
                  <tr>
                    <th scope="col" className="px-3 py-3">Date</th>
                    <th scope="col" className="px-3 py-3">Model</th>
                    <th scope="col" className="px-3 py-3">Color</th>
                    <th scope="col" className="px-3 py-3">VIN</th>
                    <th scope="col" className="px-3 py-3">Trading Dealer</th>
                    <th scope="col" className="px-3 py-3">Stock #</th>
                    <th scope="col" className="px-3 py-3">Direction</th>
                    <th scope="col" className="px-3 py-3">Sales</th>
                    <th scope="col" className="px-3 py-3">Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {dxTrades.map((trade) => (
                    <tr key={trade.id} className={`text-stone-700 transition-colors ${
                      highlightDxModel && trade.description.replace(/\s+/g, "").toUpperCase() === highlightDxModel
                        ? "bg-amber-100 ring-2 ring-amber-400 ring-inset"
                        : "hover:bg-stone-50"
                    }`}>
                      <td className="whitespace-nowrap px-3 py-2 text-stone-500">{trade.date}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold text-stone-900">{trade.description || trade.modelNumber}</span>
                        <span className="ml-1 text-xs text-stone-400">{trade.year}</span>
                      </td>
                      <td className="px-3 py-2">
                        {trade.colorCode && <span className="mr-1 text-xs text-stone-400">{trade.colorCode}</span>}
                        {trade.color}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-stone-500">
                        {trade.vinIncoming || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{trade.tradingDealer}</span>
                        {trade.dealerCode && <span className="ml-1 text-xs text-stone-400">({trade.dealerCode})</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{trade.stockNumber}</td>
                      <td className="px-3 py-2">
                        {trade.direction && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            trade.direction === "OURS"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-stone-100 text-stone-600"
                          }`}>
                            {trade.direction}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-stone-600">{trade.salesConsultant || "—"}</td>
                      <td className="px-3 py-2 text-stone-500">
                        {trade.dxFee ? `$${trade.dxFee}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default AllocationBoard;
