import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { AppUser, Order } from "../types";
import { isActiveStatus } from "../constants";
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

interface AllocationBoardProps {
  currentUser: AppUser;
}

type BoardView = "strategy" | "log";
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

const BOARD_VIEW_OPTIONS: BoardView[] = ["strategy", "log"];
const ARRIVAL_GROUPING_OPTIONS: ArrivalGroupingMode[] = ["bucket", "date"];
const SORT_MODE_OPTIONS: SortMode[] = ["priority", "arrival", "units", "model"];
const BOS_FILTER_OPTIONS: BosFilter[] = ["all", "y", "n"];

const STORAGE_KEYS = {
  boardView: "allocation.boardView",
  searchQuery: "allocation.searchQuery",
  categoryFilter: "allocation.categoryFilter",
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
  matchType: "model" | "modelNumber" | "both";
  colorMatch: "exact" | "partial" | null;
  interiorMatch: "exact" | "partial" | null;
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
      tone: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    };
  }

  return {
    value: "N",
    detail: "Locked",
    tone: "border-slate-600 bg-slate-900 text-slate-200",
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
  const [latestSnapshot, setLatestSnapshot] = useState<AllocationSnapshot | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);

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
  const pdfInputRef = useRef<HTMLInputElement>(null);

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

  // Subscribe to all orders (read-only) so we can match them against allocation vehicles
  useEffect(() => {
    const ordersQuery = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribeOrders = onSnapshot(
      ordersQuery,
      (querySnapshot: QuerySnapshot<DocumentData>) => {
        const orders = querySnapshot.docs
          .map((docSnapshot) => ({ ...docSnapshot.data(), id: docSnapshot.id }) as Order)
          .filter((order) => isActiveStatus(order.status));
        setActiveOrders(orders);
      },
      (error) => {
        console.error("AllocationBoard: Failed to subscribe to orders:", error);
      },
    );

    return () => unsubscribeOrders();
  }, []);

  // Build a lookup: allocation vehicle id → matched orders
  // Match 3 ways:
  //   1. Order.model (normalized, spaces stripped) === AllocationVehicle.code
  //   2. Order.modelNumber (4-digit) === AllocationVehicle.sourceCode (4-digit)
  //   3. Bridge: Order.modelNumber → lookup base model via MODEL_CODE_TO_ALLOCATION → compare to AllocationVehicle.code
  const orderMatchesByVehicle = useMemo(() => {
    const matches = new Map<string, MatchedOrder[]>();
    if (activeOrders.length === 0) return matches;

    for (const vehicle of latestSnapshot?.vehicles ?? []) {
      const vehicleCode = normalizeModelForMatch(vehicle.code);
      const vehicleSourceCode = vehicle.sourceCode
        ? extractFourDigitCode(vehicle.sourceCode)
        : null;

      const vehicleMatches: MatchedOrder[] = [];

      for (const order of activeOrders) {
        const orderModel = normalizeModelForMatch(order.model);
        const orderModelNumber = extractFourDigitCode(order.modelNumber);

        // Path 1: direct model name match (e.g., "RX 350" → "RX350")
        const modelMatch = vehicleCode !== "" && orderModel === vehicleCode;

        // Path 2: direct 4-digit code match
        const modelNumberMatch =
          vehicleSourceCode !== null &&
          orderModelNumber !== null &&
          vehicleSourceCode === orderModelNumber;

        // Path 3: bridge via lookup table (e.g., order modelNumber "9400" → "RX350" → matches vehicle code "RX350")
        const bridgedModel = orderModelNumber
          ? MODEL_CODE_TO_ALLOCATION[orderModelNumber]
          : null;
        const bridgeMatch =
          bridgedModel !== null &&
          bridgedModel !== undefined &&
          vehicleCode !== "" &&
          normalizeModelForMatch(bridgedModel) === vehicleCode;

        if (modelMatch || modelNumberMatch || bridgeMatch) {
          // Check exterior color match across all 3 order color preferences
          const orderExtColors = [
            order.exteriorColor1,
            order.exteriorColor2,
            order.exteriorColor3,
          ].filter(Boolean) as string[];
          let bestColorMatch: "exact" | "partial" | null = null;
          for (const orderColor of orderExtColors) {
            const result = matchExteriorColors(orderColor, vehicle.color);
            if (result === "exact") {
              bestColorMatch = "exact";
              break;
            }
            if (result === "partial" && bestColorMatch !== "exact") {
              bestColorMatch = "partial";
            }
          }

          // Check interior color match across all 3 order interior preferences
          const orderIntColors = [
            order.interiorColor1,
            order.interiorColor2,
            order.interiorColor3,
          ].filter(Boolean) as string[];
          let bestInteriorMatch: "exact" | "partial" | null = null;
          for (const orderInt of orderIntColors) {
            const result = matchInteriorColors(orderInt, vehicle.interiorColor);
            if (result === "exact") {
              bestInteriorMatch = "exact";
              break;
            }
            if (result === "partial" && bestInteriorMatch !== "exact") {
              bestInteriorMatch = "partial";
            }
          }

          vehicleMatches.push({
            orderId: order.id,
            customerName: order.customerName,
            salesperson: order.salesperson,
            model: order.model,
            modelNumber: order.modelNumber,
            exteriorColor1: order.exteriorColor1,
            interiorColor1: order.interiorColor1,
            colorMatch: bestColorMatch,
            interiorMatch: bestInteriorMatch,
            matchType:
              modelMatch && (modelNumberMatch || bridgeMatch)
                ? "both"
                : modelMatch
                  ? "model"
                  : "modelNumber",
          });
        }
      }

      if (vehicleMatches.length > 0) {
        matches.set(vehicle.id, vehicleMatches);
      }
    }

    return matches;
  }, [latestSnapshot, activeOrders]);

  const matchSummary = useMemo(() => {
    const totalVehicles = latestSnapshot?.vehicles.length ?? 0;
    const matchedVehicleCount = orderMatchesByVehicle.size;
    const uniqueOrderIds = new Set<string>();
    for (const matched of orderMatchesByVehicle.values()) {
      for (const m of matched) {
        uniqueOrderIds.add(m.orderId);
      }
    }
    return {
      totalVehicles,
      matchedVehicleCount,
      matchedOrderCount: uniqueOrderIds.size,
    };
  }, [latestSnapshot, orderMatchesByVehicle]);

  const vehicles = useMemo(
    () => latestSnapshot?.vehicles ?? [],
    [latestSnapshot],
  );

  const categoryOptions = useMemo<string[]>(
    () =>
      Array.from(new Set(vehicles.map((vehicle) => vehicle.category))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [vehicles],
  );

  const rankOptions = useMemo<string[]>(
    () =>
      Array.from(new Set(vehicles.map((vehicle) => vehicle.rank))).sort((a, b) => {
        return (RANK_ORDER[a] ?? 99) - (RANK_ORDER[b] ?? 99);
      }),
    [vehicles],
  );

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

  const filteredVehicles = useMemo(() => {
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

      return [
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
    });
  }, [vehicles, categoryFilter, rankFilter, bosFilter, searchQuery]);

  const sortedVehicles = useMemo(() => {
    const sorted = [...filteredVehicles];

    sorted.sort((first, second) => {
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
  }, [filteredVehicles, sortMode]);

  const groupedRows = useMemo<GroupedAllocationRow[]>(() => {
    const grouped = new Map<string, GroupedAllocationRow>();

    filteredVehicles.forEach((vehicle) => {
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
          if (arrivalDiff !== 0) {
            return arrivalDiff;
          }
          return (RANK_ORDER[first.rank] ?? 99) - (RANK_ORDER[second.rank] ?? 99);
        }

        case "units": {
          const unitDiff = second.totalUnits - first.totalUnits;
          if (unitDiff !== 0) {
            return unitDiff;
          }
          return compareRowArrival(first, second);
        }

        case "model": {
          const modelDiff = getPrimaryModel(first).localeCompare(getPrimaryModel(second));
          if (modelDiff !== 0) {
            return modelDiff;
          }
          return compareRowArrival(first, second);
        }

        case "priority":
        default: {
          const rankDiff = (RANK_ORDER[first.rank] ?? 99) - (RANK_ORDER[second.rank] ?? 99);
          if (rankDiff !== 0) {
            return rankDiff;
          }
          const arrivalDiff = compareRowArrival(first, second);
          if (arrivalDiff !== 0) {
            return arrivalDiff;
          }
          return second.totalUnits - first.totalUnits;
        }
      }
    });
  }, [filteredVehicles, arrivalGroupingMode, sortMode]);

  const strategyTotals = useMemo(() => {
    return groupedRows.reduce(
      (accumulator, row) => {
        accumulator.units += row.totalUnits;
        return accumulator;
      },
      { units: 0 },
    );
  }, [groupedRows]);

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
      return "bg-slate-800 text-slate-200";
    }

    if (parseInsights.confidence === "High") {
      return "bg-emerald-500/20 text-emerald-300";
    }
    if (parseInsights.confidence === "Medium") {
      return "bg-amber-500/20 text-amber-300";
    }
    return "bg-rose-500/20 text-rose-300";
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

  const processPdfFile = async (file: File) => {
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

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
      <div className="border-b border-slate-800 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky-400">Live Allocation</p>
            <h2 className="text-2xl font-bold tracking-tight text-white">Allocation Board</h2>
            <p className="mt-1 text-sm text-slate-300">
              Snapshot source of truth for consultant strategy and live inventory visibility.
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm">
            <p className="text-slate-300">
              <span className="font-semibold text-slate-100">Published:</span>{" "}
              {formatTimestamp(latestSnapshot?.publishedAt)}
            </p>
            <p className="text-slate-300">
              <span className="font-semibold text-slate-100">Publisher:</span>{" "}
              {latestSnapshot?.publishedByEmail || "Not published yet"}
            </p>
            <p className="text-slate-300">
              <span className="font-semibold text-slate-100">Report Date:</span>{" "}
              {latestSnapshot?.reportDate || "Unknown"}
            </p>
          </div>
        </div>

        {currentUser.isManager && (
          <div className="mt-5 flex items-center justify-end">
            <button
              onClick={() => setIsManagerPanelOpen((previous) => !previous)}
              className="rounded-lg border border-sky-500/60 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
              data-testid="allocation-manager-toggle"
            >
              {isManagerPanelOpen ? "Hide Allocation Update" : "Update Allocation"}
            </button>
          </div>
        )}
      </div>

      {currentUser.isManager && isManagerPanelOpen && (
        <div className="border-b border-slate-800 bg-slate-900/40 px-6 py-5" data-testid="allocation-manager-panel">
          <h3 className="text-lg font-semibold text-white">Manager Update Panel</h3>
          <p className="mt-1 text-sm text-slate-300">
            Paste Lexus allocation source text, parse, validate, and publish the new snapshot.
          </p>

          <div
            className={`mt-4 rounded-xl border border-dashed p-3 transition-colors ${
              isPdfDragActive
                ? "border-sky-400 bg-sky-500/10"
                : "border-slate-700 bg-slate-900/30"
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
                className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-700"
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
              <p className="text-xs text-slate-400">
                Drag and drop a Toyota allocation PDF here, or use Upload PDF.
              </p>
            </div>
          </div>

          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            className="mt-4 min-h-44 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 shadow-inner outline-none ring-sky-500/50 transition focus:ring"
            placeholder="Paste allocation source text..."
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleParse}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
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
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {isPublishing ? "Publishing..." : "Publish Snapshot"}
            </button>
          </div>

          {parseStatus && <p className="mt-3 text-sm text-slate-200">{parseStatus}</p>}
          {publishStatus && <p className="mt-2 text-sm text-sky-300">{publishStatus}</p>}

          {parsedResult && (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/80 p-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Parse Preview
              </h4>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-200">
                  Parsed: {parsedResult.itemCount}
                </span>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-200">
                  Units: {parsedResult.summary.units}
                </span>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-200">
                  Hybrid: {parsedResult.summary.hybridMix}%
                </span>
                {parseInsights && (
                  <>
                    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-200">
                      Warnings: {parseInsights.warningCount}
                    </span>
                    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-200">
                      TBD Fields: {parseInsights.tbdArrivals + parseInsights.tbdDetails}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 ${parseConfidenceTone}`}>
                      Confidence: {parseInsights.confidence}
                    </span>
                  </>
                )}
              </div>

              {parsedResult.errors.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-300">
                  {parsedResult.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}

              {parsedResult.warnings.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-300">
                  {parsedResult.warnings.slice(0, 5).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                  {parsedResult.warnings.length > 5 && (
                    <li>{parsedResult.warnings.length - 5} more warnings</li>
                  )}
                </ul>
              )}

              {parseInsights && parseInsights.skippedWarnings.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      Skipped Lines: {parseInsights.skippedWarnings.length}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopySkippedWarnings}
                      className="rounded border border-amber-400/50 px-2 py-1 font-semibold text-amber-100 hover:bg-amber-500/20"
                    >
                      Copy
                    </button>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-amber-100">
                      Show skipped line details
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-200">
                      {parseInsights.skippedWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                  {skippedCopyStatus && <p className="mt-2 text-emerald-300">{skippedCopyStatus}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-6 py-5">
        <div className="sticky top-16 z-20">
          <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/85 p-4 backdrop-blur-sm lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setBoardView("strategy")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  boardView === "strategy"
                    ? "bg-sky-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                Strategy View
              </button>
              <button
                onClick={() => setBoardView("log")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  boardView === "log"
                    ? "bg-sky-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                Full Log View
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6 lg:gap-3">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search code, grade, category..."
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500/50 transition focus:ring"
              />
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                aria-label="Filter by category"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500/50 transition focus:ring"
              >
                <option value="all">All Categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                value={rankFilter}
                onChange={(event) => setRankFilter(event.target.value)}
                aria-label="Filter by priority"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500/50 transition focus:ring"
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
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500/50 transition focus:ring"
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
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500/50 transition focus:ring"
              >
                <option value="bucket">Build Date: Bucket</option>
                <option value="date">Build Date: Exact Date</option>
              </select>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                aria-label="Sort allocation rows"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500/50 transition focus:ring"
              >
                <option value="priority">Sort: Priority</option>
                <option value="arrival">Sort: Build Date</option>
                <option value="units">Sort: Units</option>
                <option value="model">Sort: Model</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading && <p className="mt-6 text-sm text-slate-300">Loading live allocation...</p>}
        {loadError && <p className="mt-6 text-sm text-rose-300">{loadError}</p>}

        {!isLoading && !loadError && vehicles.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center">
            <p className="text-sm text-slate-300">
              No published allocation snapshot yet. Managers can publish from Update Allocation.
            </p>
          </div>
        )}

        {!isLoading && !loadError && vehicles.length > 0 && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Filtered Units</p>
                <p className="mt-1 text-2xl font-bold text-white">{strategyTotals.units}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Live Hybrid Mix</p>
                <p className="mt-1 text-2xl font-bold text-white">{latestSnapshot?.summary.hybridMix ?? 0}%</p>
              </div>
              <div className={`rounded-xl border p-4 ${matchSummary.matchedOrderCount > 0 ? "border-amber-500/30 bg-amber-500/10" : "border-slate-800 bg-slate-900"}`}>
                <p className="text-xs uppercase tracking-wider text-slate-400">Order Matches</p>
                <p className={`mt-1 text-2xl font-bold ${matchSummary.matchedOrderCount > 0 ? "text-amber-300" : "text-white"}`}>
                  {matchSummary.matchedOrderCount}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {matchSummary.matchedOrderCount > 0
                    ? `${matchSummary.matchedOrderCount} active order${matchSummary.matchedOrderCount === 1 ? "" : "s"} matched to ${matchSummary.matchedVehicleCount} allocation vehicle${matchSummary.matchedVehicleCount === 1 ? "" : "s"}`
                    : "No active orders match current allocation"}
                </p>
              </div>
            </div>

            {boardView === "strategy" ? (
              <div className="mt-5 space-y-3" data-testid="allocation-strategy-view">
                {groupedRows.map((row) => (
                  <article
                    key={row.key}
                    className="grid gap-3"
                  >
                    <div className="grid gap-3">
                      {(() => {
                        const variants = Array.from(
                          row.vehicles.reduce((accumulator, vehicle) => {
                            const factoryAccessories = getFactoryAccessories(vehicle);
                            const postProductionOptions = getPostProductionOptions(vehicle);
                            const key = `${vehicle.sourceCode ?? ""}|${vehicle.code}|${vehicle.model ?? ""}|${vehicle.grade}|${vehicle.arrival}|${vehicle.color}|${vehicle.interiorColor}|${vehicle.bos}|${factoryAccessories.join(",")}|${postProductionOptions.join(",")}`;
                            const existing = accumulator.get(key);

                            if (existing) {
                              existing.units += vehicle.quantity;
                              existing.vehicleIds.push(vehicle.id);
                              existing.factoryAccessories = Array.from(
                                new Set([...existing.factoryAccessories, ...factoryAccessories]),
                              );
                              existing.postProductionOptions = Array.from(
                                new Set([...existing.postProductionOptions, ...postProductionOptions]),
                              );
                            } else {
                              accumulator.set(key, {
                                code: vehicle.code,
                                model: vehicle.model,
                                sourceCode: vehicle.sourceCode,
                                grade: vehicle.grade,
                                arrival: vehicle.arrival,
                                color: vehicle.color,
                                interiorColor: vehicle.interiorColor,
                                bos: vehicle.bos,
                                units: vehicle.quantity,
                                vehicleIds: [vehicle.id],
                                factoryAccessories,
                                postProductionOptions,
                              });
                            }

                            return accumulator;
                          },
                          new Map<
                            string,
                            {
                              code: string;
                              model?: string;
                              sourceCode?: string;
                              grade: string;
                              arrival: string;
                              color: string;
                              interiorColor: string;
                              bos: string;
                              units: number;
                              vehicleIds: string[];
                              factoryAccessories: string[];
                              postProductionOptions: string[];
                            }
                          >()),
                        )
                          .map((entry) => entry[1])
                          .sort((first, second) => {
                            const codeDiff = getDisplayCode(first.sourceCode, first.code).localeCompare(
                              getDisplayCode(second.sourceCode, second.code),
                            );
                            if (codeDiff !== 0) {
                              return codeDiff;
                            }

                            const modelDiff = getDisplayModel(first.model, first.code).localeCompare(
                              getDisplayModel(second.model, second.code),
                            );
                            if (modelDiff !== 0) {
                              return modelDiff;
                            }

                            const gradeDiff = first.grade.localeCompare(second.grade);
                            if (gradeDiff !== 0) {
                              return gradeDiff;
                            }

                            const arrivalDiff = compareArrivalValues(first.arrival, second.arrival);
                            if (arrivalDiff !== 0) {
                              return arrivalDiff;
                            }

                            const exteriorDiff = formatColorDisplay(first.color).localeCompare(
                              formatColorDisplay(second.color),
                            );
                            if (exteriorDiff !== 0) {
                              return exteriorDiff;
                            }

                            const interiorDiff = formatInteriorColorDisplay(first.interiorColor).localeCompare(
                              formatInteriorColorDisplay(second.interiorColor),
                            );
                            if (interiorDiff !== 0) {
                              return interiorDiff;
                            }

                            const bosDiff = normalizeBosValue(first.bos).localeCompare(
                              normalizeBosValue(second.bos),
                            );
                            if (bosDiff !== 0) {
                              return bosDiff;
                            }

                            const factoryDiff = first.factoryAccessories.join(" ").localeCompare(
                              second.factoryAccessories.join(" "),
                            );
                            if (factoryDiff !== 0) {
                              return factoryDiff;
                            }

                            const ppoDiff = first.postProductionOptions.join(" ").localeCompare(
                              second.postProductionOptions.join(" "),
                            );
                            if (ppoDiff !== 0) {
                              return ppoDiff;
                            }

                            return 0;
                          });

                        return variants.map((variant) => {
                          const arrivalDisplay = formatArrivalDisplay(variant.arrival);
                          const colorDisplay = formatColorDisplay(variant.color);
                          const interiorDisplay = formatInteriorColorDisplay(variant.interiorColor);
                          const daysOutDisplay = arrivalDisplay.secondary ?? "TBD";
                          const factoryAccessories = variant.factoryAccessories.join(", ");
                          const postProductionOptions = variant.postProductionOptions.join(", ");
                          const showBosDetail = normalizeBosValue(variant.bos) === "Y";
                          const detailRows: Array<{ label: string; value: string }> = [
                            { label: "Exterior", value: colorDisplay },
                            { label: "Interior", value: interiorDisplay },
                            { label: "Build / Port", value: arrivalDisplay.primary },
                            { label: "Days Out", value: daysOutDisplay },
                          ];

                          if (showBosDetail) {
                            detailRows.push({ label: "BOS", value: "Y (Changeable)" });
                          }

                          if (factoryAccessories) {
                            detailRows.push({ label: "Factory Accessories", value: factoryAccessories });
                          }

                          if (postProductionOptions) {
                            detailRows.push({ label: "Post-Production Options", value: postProductionOptions });
                          }

                          return (
                            <div
                              key={`${row.key}-${variant.sourceCode ?? ""}-${variant.code}-${variant.model ?? ""}-${variant.grade}-${variant.arrival}-${variant.color}-${variant.interiorColor}-${variant.bos}`}
                              className="rounded-xl border border-slate-700 bg-slate-950/80 p-4 lg:p-5"
                              data-testid="allocation-strategy-vehicle-card"
                            >
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="text-2xl font-black tracking-tight text-white">
                                    {getDisplayCode(variant.sourceCode, variant.code)}{" "}
                                    <span className="px-1 text-slate-500">·</span>
                                    <span className="text-slate-300">{getDisplayModel(variant.model, variant.code)}</span>
                                  </p>
                                  <p className="mt-1 text-sm text-slate-300">Trim: {variant.grade}</p>
                                </div>

                                {variant.units > 1 && (
                                  <div className="flex flex-wrap gap-1.5 text-xs text-slate-200">
                                    <span className="rounded-full border border-slate-600 bg-slate-900 px-2.5 py-1 font-semibold text-slate-100">
                                      Qty: {variant.units}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                {detailRows.map((detail) => (
                                  <div
                                    key={`${row.key}-${variant.code}-${detail.label}`}
                                    className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
                                  >
                                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">{detail.label}</dt>
                                    <dd className="mt-1 font-semibold text-slate-100">{detail.value}</dd>
                                  </div>
                                ))}
                              </dl>

                              {(() => {
                                const variantMatches = variant.vehicleIds.flatMap(
                                  (vid) => orderMatchesByVehicle.get(vid) ?? [],
                                );
                                const uniqueMatches = Array.from(
                                  new Map(variantMatches.map((m) => [m.orderId, m])).values(),
                                );
                                if (uniqueMatches.length === 0) return null;
                                return (
                                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                                      Matching Orders ({uniqueMatches.length})
                                    </p>
                                    <div className="mt-2 space-y-1.5">
                                      {uniqueMatches.map((m) => (
                                        <div
                                          key={m.orderId}
                                          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-100"
                                        >
                                          <span className="font-semibold text-white">{m.customerName}</span>
                                          <span className="text-amber-200">{m.salesperson}</span>
                                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                            {m.model} / {m.modelNumber}
                                          </span>
                                          {m.exteriorColor1 && (
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                              m.colorMatch === "exact"
                                                ? "bg-emerald-500/20 text-emerald-300"
                                                : m.colorMatch === "partial"
                                                  ? "bg-sky-500/20 text-sky-300"
                                                  : "bg-slate-700/50 text-slate-300"
                                            }`}>
                                              {m.colorMatch === "exact"
                                                ? `Ext: ${m.exteriorColor1}`
                                                : m.colorMatch === "partial"
                                                  ? `~Ext: ${m.exteriorColor1}`
                                                  : `Ext pref: ${m.exteriorColor1}`}
                                            </span>
                                          )}
                                          {m.interiorColor1 && (
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                              m.interiorMatch === "exact"
                                                ? "bg-emerald-500/20 text-emerald-300"
                                                : m.interiorMatch === "partial"
                                                  ? "bg-sky-500/20 text-sky-300"
                                                  : "bg-slate-700/50 text-slate-300"
                                            }`}>
                                              {m.interiorMatch === "exact"
                                                ? `Int: ${m.interiorColor1}`
                                                : m.interiorMatch === "partial"
                                                  ? `~Int: ${m.interiorColor1}`
                                                  : `Int pref: ${m.interiorColor1}`}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-sm" data-testid="allocation-log-view">
                  <thead className="bg-slate-900">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="px-3 py-3">Code</th>
                      <th className="px-3 py-3">Model</th>
                      <th className="px-3 py-3">Grade / Trim</th>
                      <th className="px-3 py-3">Build / Port</th>
                      <th className="px-3 py-3">BOS</th>
                      <th className="px-3 py-3">Qty</th>
                      <th className="px-3 py-3">Matched Orders</th>
                      <th className="px-3 py-3">Factory Accessories</th>
                      <th className="px-3 py-3">Post-Production Options</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950">
                    {sortedVehicles.map((vehicle) => {
                      const arrivalDisplay = formatArrivalDisplay(vehicle.arrival);
                      const bosDisplay = formatBosDisplay(vehicle.bos);
                      const factoryAccessories = getFactoryAccessories(vehicle).join(", ");
                      const postProductionOptions = getPostProductionOptions(vehicle).join(", ");
                      return (
                        <tr key={vehicle.id} className="text-slate-200">
                          <td className="px-3 py-2 font-semibold text-white">
                            {getDisplayCode(vehicle.sourceCode, vehicle.code)}
                          </td>
                          <td className="px-3 py-2">{getDisplayModel(vehicle.model, vehicle.code)}</td>
                          <td className="px-3 py-2">{vehicle.grade}</td>
                          <td className="px-3 py-2">
                            <p>{arrivalDisplay.primary}</p>
                            {arrivalDisplay.secondary && (
                              <p className="text-xs text-slate-400">{arrivalDisplay.secondary}</p>
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
                              const matched = orderMatchesByVehicle.get(vehicle.id);
                              if (!matched || matched.length === 0) return null;
                              return (
                                <div className="space-y-1">
                                  {matched.map((m) => (
                                    <div key={m.orderId} className="flex flex-wrap items-center gap-1 text-xs">
                                      <span className="font-semibold text-amber-300">{m.customerName}</span>
                                      <span className="text-amber-200/70">({m.salesperson})</span>
                                      {m.colorMatch === "exact" && (
                                        <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] font-semibold text-emerald-300">EXT</span>
                                      )}
                                      {m.colorMatch === "partial" && (
                                        <span className="rounded bg-sky-500/20 px-1 py-0.5 text-[10px] font-semibold text-sky-300">~EXT</span>
                                      )}
                                      {m.interiorMatch === "exact" && (
                                        <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] font-semibold text-emerald-300">INT</span>
                                      )}
                                      {m.interiorMatch === "partial" && (
                                        <span className="rounded bg-sky-500/20 px-1 py-0.5 text-[10px] font-semibold text-sky-300">~INT</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">{factoryAccessories}</td>
                          <td className="px-3 py-2">{postProductionOptions}</td>
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
    </section>
  );
};

export default AllocationBoard;
