import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppUser } from "../types";
import {
  parseAllocationSource,
  groupArrivalBucket,
} from "../src/utils/allocationParser";
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

const RANK_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTimestamp(date?: { toDate: () => Date }): string {
  if (!date) {
    return "Not published yet";
  }

  return date.toDate().toLocaleString();
}

interface StrategyArrivalGroup {
  key: string;
  arrivalBucket: string;
  vehicles: AllocationVehicle[];
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

function getDisplayCode(vehicle: AllocationVehicle): string {
  const codeCandidates = [getDisplayValue(vehicle.sourceCode), getDisplayValue(vehicle.code)].filter(
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

function getDisplayModel(vehicle: AllocationVehicle): string {
  const explicitModel = getDisplayValue(vehicle.model);
  if (explicitModel) {
    return explicitModel;
  }

  const codeFallback = getDisplayValue(vehicle.code);
  if (codeFallback && !/^\d{4}[A-Z]?$/i.test(codeFallback)) {
    return codeFallback;
  }

  return "Not listed";
}

function splitExteriorInterior(color: string): { exterior: string | null; interior: string | null } {
  const [rawExterior, rawInterior] = color
    .split("/")
    .map((part) => part.trim());

  return {
    exterior: getDisplayValue(rawExterior),
    interior: getDisplayValue(rawInterior),
  };
}

function getTimelineLabel(arrival: string): "Build" | "Port" {
  const normalized = arrival.toLowerCase();
  if (/(^|\b)(port|vpc|at port|port date|to port|from port)(\b|$)/.test(normalized)) {
    return "Port";
  }

  return "Build";
}

function getVehicleTimelineLabel(vehicle: AllocationVehicle): "Build" | "Port" {
  if (vehicle.timelineType === "port") {
    return "Port";
  }
  if (vehicle.timelineType === "build") {
    return "Build";
  }

  return getTimelineLabel(vehicle.arrival || "");
}

function formatDaysOut(arrival: string): string | null {
  const target = new Date(arrival);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} day(s) ago`;
  }

  return `${diffDays} day(s)`;
}

const AllocationBoard: React.FC<AllocationBoardProps> = ({ currentUser }) => {
  const [latestSnapshot, setLatestSnapshot] = useState<AllocationSnapshot | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isManagerPanelOpen, setIsManagerPanelOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [parsedResult, setParsedResult] = useState<ParsedAllocationResult | null>(
    null,
  );
  const [parseStatus, setParseStatus] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadDragActive, setIsUploadDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [boardView, setBoardView] = useState<BoardView>("strategy");
  const [groupStrategyCards, setGroupStrategyCards] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [rankFilter, setRankFilter] = useState("all");

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

  const filteredVehicles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      if (categoryFilter !== "all" && vehicle.category !== categoryFilter) {
        return false;
      }

      if (rankFilter !== "all" && vehicle.rank !== rankFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        vehicle.code,
        vehicle.sourceCode,
        vehicle.model,
        vehicle.category,
        vehicle.grade,
        vehicle.rank,
        vehicle.type,
        vehicle.arrival,
        vehicle.color,
        vehicle.interior,
        vehicle.factoryAccessories,
        vehicle.postProductionOptions,
        vehicle.bos,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [vehicles, categoryFilter, rankFilter, searchQuery]);

  const strategyGroups = useMemo<StrategyArrivalGroup[]>(() => {
    const grouped = new Map<string, StrategyArrivalGroup>();

    filteredVehicles.forEach((vehicle) => {
      const arrivalBucket = groupArrivalBucket(vehicle.arrival);
      const key = arrivalBucket;
      const existing = grouped.get(key);

      if (existing) {
        existing.vehicles.push(vehicle);
        return;
      }

      grouped.set(key, {
        key,
        arrivalBucket,
        vehicles: [vehicle],
      });
    });

    return Array.from(grouped.values())
      .sort((a, b) => {
        const arrivalDiff = a.arrivalBucket.localeCompare(b.arrivalBucket);
        if (arrivalDiff !== 0) {
          return arrivalDiff;
        }

        return b.vehicles.length - a.vehicles.length;
      })
      .map((group) => ({
        ...group,
        // Preserve priority ordering within each arrival section for fast scanning.
        vehicles: [...group.vehicles].sort((a, b) => {
          const rankDiff = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
          if (rankDiff !== 0) {
            return rankDiff;
          }

          return a.code.localeCompare(b.code);
        }),
      }));
  }, [filteredVehicles]);

  const strategyVehicles = useMemo(() => {
    return [...filteredVehicles].sort((a, b) => {
      const rankDiff = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      return getDisplayCode(a).localeCompare(getDisplayCode(b));
    });
  }, [filteredVehicles]);

  const strategyTotals = useMemo(() => {
    return filteredVehicles.reduce(
      (accumulator, row) => {
        accumulator.units += row.quantity;
        accumulator.value += row.totalValue;
        return accumulator;
      },
      { units: 0, value: 0 },
    );
  }, [filteredVehicles]);

  const hasMeaningfulValue = useMemo(() => {
    return filteredVehicles.some((vehicle) => vehicle.totalValue > 0);
  }, [filteredVehicles]);

  const handleParse = () => {
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

  const readAllocationFileText = async (file: File): Promise<string> => {
    const readAsText = async (): Promise<string> => {
      if (typeof file.text === "function") {
        return file.text();
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Unable to read uploaded file."));
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.readAsText(file);
      });
    };

    const lower = file.name.toLowerCase();

    if (lower.endsWith(".pdf")) {
      const raw = await readAsText();
      const printableRatio = raw.length
        ? raw.replace(/[\x20-\x7E\r\n\t]/g, "").length / raw.length
        : 1;

      if (printableRatio > 0.35) {
        throw new Error(
          "PDF upload loaded non-text content. Paste extracted PDF text or upload a .txt/.csv export.",
        );
      }

      return raw;
    }

    return readAsText();
  };

  const handleSourceFile = async (file: File) => {
    setUploadStatus(null);

    try {
      const text = await readAllocationFileText(file);
      const normalizedText = text.replace(/\r\n/g, "\n").trim();

      if (!normalizedText) {
        setUploadStatus("Uploaded file did not contain readable allocation text.");
        return;
      }

      setSourceText(normalizedText);
      setUploadStatus(`Loaded source from ${file.name}. Review text, then click Parse Source.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read uploaded file.";
      setUploadStatus(message);
    }
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
            Paste or upload allocation source text, parse, validate, and publish the new snapshot.
          </p>

          <input
            ref={uploadInputRef}
            type="file"
            accept=".txt,.csv,.tsv,.pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleSourceFile(file);
              }
              event.currentTarget.value = "";
            }}
            data-testid="allocation-source-file-input"
          />

          <div
            className={`mt-4 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors ${
              isUploadDragActive
                ? "border-sky-400 bg-sky-500/10 text-sky-200"
                : "border-slate-700 bg-slate-950/70 text-slate-300"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsUploadDragActive(true);
            }}
            onDragLeave={() => setIsUploadDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsUploadDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) {
                void handleSourceFile(file);
              }
            }}
            data-testid="allocation-source-dropzone"
          >
            <div className="flex flex-wrap items-center gap-3">
              <p>Drag and drop source file (.txt/.csv/.pdf) or</p>
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-200 hover:bg-slate-800"
              >
                Upload File
              </button>
            </div>
          </div>

          {uploadStatus && <p className="mt-2 text-sm text-slate-300">{uploadStatus}</p>}

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
              <div className="mt-2 grid gap-2 text-sm text-slate-200 sm:grid-cols-2 lg:grid-cols-4">
                <p>Rows: {parsedResult.itemCount}</p>
                <p>Units: {parsedResult.summary.units}</p>
                <p>Total Value: {formatCurrency(parsedResult.summary.value)}</p>
                <p>Hybrid Mix: {parsedResult.summary.hybridMix}%</p>
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
            </div>
          )}
        </div>
      )}

      <div className="px-6 py-5">
        <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 lg:flex-row lg:items-end lg:justify-between">
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
            {boardView === "strategy" && (
              <button
                onClick={() => setGroupStrategyCards((previous) => !previous)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-300 hover:bg-slate-800"
              >
                {groupStrategyCards ? "Grouped" : "Flat Scan"}
              </button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search code, grade, category..."
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500/50 transition focus:ring"
            />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
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
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500/50 transition focus:ring"
            >
              <option value="all">All Priorities</option>
              {rankOptions.map((rank) => (
                <option key={rank} value={rank}>
                  {rank}
                </option>
              ))}
            </select>
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
            <div className={`mt-5 grid gap-3 ${hasMeaningfulValue ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Filtered Units</p>
                <p className="mt-1 text-2xl font-bold text-white">{strategyTotals.units}</p>
              </div>
              {hasMeaningfulValue && (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-400">Filtered Value</p>
                  <p className="mt-1 text-2xl font-bold text-white">{formatCurrency(strategyTotals.value)}</p>
                </div>
              )}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Live Hybrid Mix</p>
                <p className="mt-1 text-2xl font-bold text-white">{latestSnapshot?.summary.hybridMix ?? 0}%</p>
              </div>
            </div>

            {boardView === "strategy" ? (
              <div className="mt-5 space-y-3" data-testid="allocation-strategy-view">
                {groupStrategyCards
                  ? strategyGroups.map((group) => (
                      <section key={group.key} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                            {group.arrivalBucket}
                          </h3>
                          <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                            {group.vehicles.length} line(s)
                          </span>
                        </div>

                        <div className="grid gap-2 lg:grid-cols-2">
                          {group.vehicles.map((vehicle) => {
                            const exterior = getDisplayValue(splitExteriorInterior(vehicle.color).exterior);
                            const interior = getDisplayValue(vehicle.interior) ?? getDisplayValue(splitExteriorInterior(vehicle.color).interior);
                            const optionalBos = getDisplayValue(vehicle.bos);
                            const timelineLabel = getVehicleTimelineLabel(vehicle);
                            const timelineValue = getDisplayValue(vehicle.arrival);
                            const daysOut = formatDaysOut(vehicle.arrival);
                            const factoryAccessories = getDisplayValue(vehicle.factoryAccessories);
                            const ppos = getDisplayValue(vehicle.postProductionOptions);

                            return (
                              <article
                                key={vehicle.id}
                                className="rounded-lg border border-slate-800/90 bg-slate-950/85 px-3 py-2.5"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[15px] font-semibold leading-tight text-white">
                                      {getDisplayCode(vehicle)} <span className="px-1 text-slate-500">·</span><span className="text-slate-300">{getDisplayModel(vehicle)}</span>
                                    </p>
                                    <p className="mt-0.5 text-sm font-medium leading-tight text-slate-100">
                                      {getDisplayValue(vehicle.grade) ?? "Not listed"}
                                    </p>
                                    <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                      {vehicle.category} | Priority {vehicle.rank}
                                    </p>
                                  </div>
                                  {vehicle.quantity > 1 && (
                                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                                      Qty {vehicle.quantity}
                                    </span>
                                  )}
                                </div>

                                <div className="mt-2 space-y-1.5 text-xs text-slate-300">
                                  <p className="leading-snug">
                                    <span className="text-slate-500">Exterior</span>{" "}
                                    <span className={exterior ? "text-slate-200" : "text-slate-500"}>
                                      {exterior ?? "Not listed"}
                                    </span>
                                    <span className="px-1 text-slate-600">|</span>
                                    <span className="text-slate-500">Interior</span>{" "}
                                    <span className={interior ? "text-slate-200" : "text-slate-500"}>
                                      {interior ?? "Not listed"}
                                    </span>
                                  </p>

                                  <p className="leading-snug">
                                    <span className="text-slate-500">{timelineLabel}</span>{" "}
                                    <span className={timelineValue ? "text-slate-200" : "text-slate-500"}>
                                      {timelineValue ?? "Not posted"}
                                    </span>
                                    <span className="px-1 text-slate-600">|</span>
                                    <span className="text-slate-500">Days Out</span>{" "}
                                    <span className={daysOut ? "text-slate-200" : "text-slate-500"}>
                                      {daysOut ?? "Not posted"}
                                    </span>
                                    {optionalBos && (
                                      <>
                                        <span className="px-1 text-slate-600">|</span>
                                        <span className="text-slate-500">BOS</span>{" "}
                                        <span className="text-slate-200">{optionalBos}</span>
                                      </>
                                    )}
                                  </p>

                                  {factoryAccessories && (
                                    <p className="leading-snug">
                                      <span className="text-slate-500">Factory Accy</span>{" "}
                                      <span className="text-slate-200">{factoryAccessories}</span>
                                    </p>
                                  )}

                                  {ppos && (
                                    <p className="leading-snug">
                                      <span className="text-slate-500">PPOs</span>{" "}
                                      <span className="text-slate-200">{ppos}</span>
                                    </p>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    ))
                  : (
                    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                          All Vehicles
                        </h3>
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                          {strategyVehicles.length} line(s)
                        </span>
                      </div>

                      <div className="grid gap-2 lg:grid-cols-2">
                        {strategyVehicles.map((vehicle) => {
                        const { exterior, interior } = splitExteriorInterior(vehicle.color);
                        const parsedInterior = getDisplayValue(vehicle.interior);
                        const finalInterior = parsedInterior ?? getDisplayValue(interior);
                        const optionalBos = getDisplayValue(vehicle.bos);
                        const timelineLabel = getVehicleTimelineLabel(vehicle);
                        const timelineValue = getDisplayValue(vehicle.arrival);
                        const daysOut = formatDaysOut(vehicle.arrival);
                        const factoryAccessories = getDisplayValue(vehicle.factoryAccessories);
                        const ppos = getDisplayValue(vehicle.postProductionOptions);

                        return (
                          <article
                            key={vehicle.id}
                            className="rounded-lg border border-slate-800/90 bg-slate-950/85 px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[15px] font-semibold leading-tight text-white">
                                  {getDisplayCode(vehicle)} <span className="px-1 text-slate-500">·</span><span className="text-slate-300">{getDisplayModel(vehicle)}</span>
                                </p>
                                <p className="mt-0.5 text-sm font-medium leading-tight text-slate-100">
                                  {getDisplayValue(vehicle.grade) ?? "Not listed"}
                                </p>
                                <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                  {vehicle.category} | Priority {vehicle.rank}
                                </p>
                              </div>
                              {vehicle.quantity > 1 && (
                                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                                  Qty {vehicle.quantity}
                                </span>
                              )}
                            </div>

                            <div className="mt-2 space-y-1.5 text-xs text-slate-300">
                              <p className="leading-snug">
                                <span className="text-slate-500">Exterior</span>{" "}
                                <span className={getDisplayValue(exterior) ? "text-slate-200" : "text-slate-500"}>
                                  {getDisplayValue(exterior) ?? "Not listed"}
                                </span>
                                <span className="px-1 text-slate-600">|</span>
                                <span className="text-slate-500">Interior</span>{" "}
                                <span className={finalInterior ? "text-slate-200" : "text-slate-500"}>
                                  {finalInterior ?? "Not listed"}
                                </span>
                              </p>

                              <p className="leading-snug">
                                <span className="text-slate-500">{timelineLabel}</span>{" "}
                                <span className={timelineValue ? "text-slate-200" : "text-slate-500"}>
                                  {timelineValue ?? "Not posted"}
                                </span>
                                <span className="px-1 text-slate-600">|</span>
                                <span className="text-slate-500">Days Out</span>{" "}
                                <span className={daysOut ? "text-slate-200" : "text-slate-500"}>
                                  {daysOut ?? "Not posted"}
                                </span>
                              </p>

                              {optionalBos && (
                                <p className="leading-snug">
                                  <span className="text-slate-500">BOS</span>{" "}
                                  <span className="text-slate-200">{optionalBos}</span>
                                </p>
                              )}

                              {factoryAccessories && (
                                <p className="leading-snug">
                                  <span className="text-slate-500">Factory Accy</span>{" "}
                                  <span className="text-slate-200">{factoryAccessories}</span>
                                </p>
                              )}

                              {ppos && (
                                <p className="leading-snug">
                                  <span className="text-slate-500">PPOs</span>{" "}
                                  <span className="text-slate-200">{ppos}</span>
                                </p>
                              )}
                            </div>
                          </article>
                        );
                        })}
                      </div>
                    </section>
                  )}
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
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Priority</th>
                      <th className="px-3 py-3">Qty</th>
                      <th className="px-3 py-3">Factory Accessories</th>
                      <th className="px-3 py-3">Post-Production Options</th>
                      {hasMeaningfulValue && <th className="px-3 py-3">Value</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950">
                    {filteredVehicles.map((vehicle) => (
                      <tr key={vehicle.id} className="text-slate-200">
                        <td className="px-3 py-2 font-semibold text-white">{getDisplayCode(vehicle)}</td>
                        <td className="px-3 py-2">{getDisplayModel(vehicle)}</td>
                        <td className="px-3 py-2">{getDisplayValue(vehicle.grade) ?? "Not listed"}</td>
                        <td className="px-3 py-2">
                          <span className="text-slate-400">{getVehicleTimelineLabel(vehicle)}</span>{" "}
                          <span>{getDisplayValue(vehicle.arrival) ?? "Not posted"}</span>
                        </td>
                        <td className="px-3 py-2">{getDisplayValue(vehicle.bos) ?? "Not listed"}</td>
                        <td className="px-3 py-2">{vehicle.category}</td>
                        <td className="px-3 py-2">{vehicle.rank}</td>
                        <td className="px-3 py-2">{vehicle.quantity}</td>
                        <td className="max-w-56 truncate px-3 py-2">
                          {getDisplayValue(vehicle.factoryAccessories) ?? "Not listed"}
                        </td>
                        <td className="max-w-56 truncate px-3 py-2">
                          {getDisplayValue(vehicle.postProductionOptions) ?? "Not listed"}
                        </td>
                        {hasMeaningfulValue && <td className="px-3 py-2 text-slate-300">{formatCurrency(vehicle.totalValue)}</td>}
                      </tr>
                    ))}
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
