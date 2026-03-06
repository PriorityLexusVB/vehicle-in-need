import React, { useEffect, useMemo, useState } from "react";
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

interface GroupedAllocationRow {
  key: string;
  arrivalBucket: string;
  category: string;
  grade: string;
  rank: string;
  totalUnits: number;
  totalValue: number;
  vehicles: AllocationVehicle[];
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

  const [boardView, setBoardView] = useState<BoardView>("strategy");
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
        vehicle.category,
        vehicle.grade,
        vehicle.rank,
        vehicle.type,
        vehicle.arrival,
        vehicle.color,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [vehicles, categoryFilter, rankFilter, searchQuery]);

  const groupedRows = useMemo<GroupedAllocationRow[]>(() => {
    const grouped = new Map<string, GroupedAllocationRow>();

    filteredVehicles.forEach((vehicle) => {
      const arrivalBucket = groupArrivalBucket(vehicle.arrival);
      const key = `${arrivalBucket}|${vehicle.category}|${vehicle.grade}|${vehicle.rank}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.totalUnits += vehicle.quantity;
        existing.totalValue += vehicle.totalValue;
        existing.vehicles.push(vehicle);
        return;
      }

      grouped.set(key, {
        key,
        arrivalBucket,
        category: vehicle.category,
        grade: vehicle.grade,
        rank: vehicle.rank,
        totalUnits: vehicle.quantity,
        totalValue: vehicle.totalValue,
        vehicles: [vehicle],
      });
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const rankDiff = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      const arrivalDiff = a.arrivalBucket.localeCompare(b.arrivalBucket);
      if (arrivalDiff !== 0) {
        return arrivalDiff;
      }

      return b.totalUnits - a.totalUnits;
    });
  }, [filteredVehicles]);

  const strategyTotals = useMemo(() => {
    return groupedRows.reduce(
      (accumulator, row) => {
        accumulator.units += row.totalUnits;
        accumulator.value += row.totalValue;
        return accumulator;
      },
      { units: 0, value: 0 },
    );
  }, [groupedRows]);

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
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Filtered Units</p>
                <p className="mt-1 text-2xl font-bold text-white">{strategyTotals.units}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Filtered Value</p>
                <p className="mt-1 text-2xl font-bold text-white">{formatCurrency(strategyTotals.value)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Live Hybrid Mix</p>
                <p className="mt-1 text-2xl font-bold text-white">{latestSnapshot?.summary.hybridMix ?? 0}%</p>
              </div>
            </div>

            {boardView === "strategy" ? (
              <div className="mt-5 space-y-3" data-testid="allocation-strategy-view">
                {groupedRows.map((row) => (
                  <article
                    key={row.key}
                    className="rounded-xl border border-slate-800 bg-slate-900/80 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                        {row.arrivalBucket}
                      </span>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                        {row.category}
                      </span>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                        {row.grade}
                      </span>
                      <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-300">
                        Priority: {row.rank}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-6 text-sm text-slate-300">
                      <p>Units: <span className="font-semibold text-white">{row.totalUnits}</span></p>
                      <p>Value: <span className="font-semibold text-white">{formatCurrency(row.totalValue)}</span></p>
                      <p>Lines: <span className="font-semibold text-white">{row.vehicles.length}</span></p>
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      {Array.from(new Set(row.vehicles.map((vehicle) => vehicle.code))).join(" • ")}
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
                      <th className="px-3 py-3">Arrival</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Grade</th>
                      <th className="px-3 py-3">Priority</th>
                      <th className="px-3 py-3">Qty</th>
                      <th className="px-3 py-3">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950">
                    {filteredVehicles.map((vehicle) => (
                      <tr key={vehicle.id} className="text-slate-200">
                        <td className="px-3 py-2 font-semibold text-white">{vehicle.code}</td>
                        <td className="px-3 py-2">{vehicle.arrival}</td>
                        <td className="px-3 py-2">{vehicle.category}</td>
                        <td className="px-3 py-2">{vehicle.grade}</td>
                        <td className="px-3 py-2">{vehicle.rank}</td>
                        <td className="px-3 py-2">{vehicle.quantity}</td>
                        <td className="px-3 py-2">{formatCurrency(vehicle.totalValue)}</td>
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
