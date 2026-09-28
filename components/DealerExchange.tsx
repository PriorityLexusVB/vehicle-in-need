import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DxFeedState } from "../src/utils/dxFeedState";
import { aggregateDxRelationships } from "../src/utils/dxRelationships";
import DxPartners from "./DxPartners";

interface DealerExchangeProps {
  /** Single App-owned DX source state. This surface never fetches independently. */
  dxFeed: DxFeedState;
  /** Refreshes the App-owned DX source state. */
  onRefreshDx: () => void;
}

type DxPanelView = "partners" | "history";
type DxHistoryYear = "all" | "2024" | "2025" | "2026";

function formatDxBusinessDate(value: string | null): string {
  if (!value) return "No dated record";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDxFetchTime(value: Date | null): string {
  if (!value) return "Not fetched this session";
  return value.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function normalizeDxModel(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

const DealerExchange: React.FC<DealerExchangeProps> = ({ dxFeed, onRefreshDx }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDeepLink = useRef({
    model: searchParams.get("dxModel"),
    scrollTo: searchParams.get("scrollTo"),
  });
  const [dxPanelView, setDxPanelView] = useState<DxPanelView>(
    initialDeepLink.current.model ? "history" : "partners",
  );
  const [dxHistoryYear, setDxHistoryYear] = useState<DxHistoryYear>("2026");
  const [selectedDxDealerId, setSelectedDxDealerId] = useState<string | null>(null);
  const [highlightDxModel, setHighlightDxModel] = useState<string | null>(() => {
    const model = initialDeepLink.current.model;
    return model ? normalizeDxModel(model) : null;
  });
  const deepLinkScrollCompleted = useRef(false);

  const dxTrades = dxFeed.trades;
  const dxLoading = dxFeed.status === "syncing";
  const dxError = dxFeed.error;
  const dxRelationships = useMemo(
    () => dxTrades.length > 0 ? aggregateDxRelationships(dxTrades) : [],
    [dxTrades],
  );
  const dxRelationshipByTradeId = useMemo(() => {
    const byTradeId = new Map<string, string>();
    for (const relationship of dxRelationships) {
      for (const trade of relationship.history) byTradeId.set(trade.id, relationship.id);
    }
    return byTradeId;
  }, [dxRelationships]);
  const visibleDxTrades = useMemo(
    () => dxHistoryYear === "all"
      ? dxTrades
      : dxTrades.filter((trade) => trade.sourceYear === Number(dxHistoryYear)),
    [dxHistoryYear, dxTrades],
  );
  const dxTotals = useMemo(() => ({
    completed: dxTrades.length,
    theyHelpedUs: dxTrades.filter((trade) => trade.direction === "OURS").length,
    weHelpedThem: dxTrades.filter((trade) => trade.direction === "THEIRS").length,
    unknown: dxTrades.filter((trade) => !trade.direction).length,
    fees: dxTrades.reduce((sum, trade) => sum + (Number(trade.dxFee) || 0), 0),
  }), [dxTrades]);
  const dxStatusPresentation = {
    syncing: {
      label: "SYNCING",
      className: "border-amber-300 bg-amber-100 text-amber-800",
    },
    current: {
      label: "CURRENT",
      className: "border-emerald-300 bg-emerald-100 text-emerald-800",
    },
    stale: {
      label: "STALE",
      className: "border-orange-300 bg-orange-100 text-orange-800",
    },
    "source-error": {
      label: "SOURCE ERROR",
      className: "border-red-300 bg-red-100 text-red-800",
    },
    "no-data": {
      label: "NO CURRENT DATA",
      className: "border-stone-300 bg-stone-100 text-stone-700",
    },
  }[dxFeed.status];

  // Preserve the existing one-shot DX focus link. The model highlight is
  // applied before the legacy query parameters are consumed and cleared.
  useEffect(() => {
    const { model, scrollTo } = initialDeepLink.current;
    if (!model && !scrollTo) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("dxModel");
    nextParams.delete("scrollTo");
    nextParams.delete("view");
    setSearchParams(nextParams, { replace: true });

    const clearHighlightTimer = model
      ? window.setTimeout(() => setHighlightDxModel(null), 30_000)
      : null;

    return () => {
      if (clearHighlightTimer !== null) window.clearTimeout(clearHighlightTimer);
    };
    // This is intentionally a one-shot deep link, matching the prior Allocation Board behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wait for the App-owned refresh to settle before focusing a live result.
  // This avoids consuming a valid deep link before current-source rows render.
  useEffect(() => {
    const { model, scrollTo } = initialDeepLink.current;
    if (deepLinkScrollCompleted.current || (!model && !scrollTo)) return;

    const highlightedRow = model
      ? document.querySelector('#dx-pipeline tr[data-dx-highlight="true"]') as HTMLElement
      : null;
    if (model && !highlightedRow && dxFeed.status === "syncing") return;

    const scrollTimer = window.setTimeout(() => {
      const currentHighlightedRow = model
        ? document.querySelector('#dx-pipeline tr[data-dx-highlight="true"]') as HTMLElement
        : null;
      const target = currentHighlightedRow
        ?? (scrollTo ? document.getElementById(scrollTo) : document.getElementById("dx-pipeline"));
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      deepLinkScrollCompleted.current = true;
    }, 100);

    return () => window.clearTimeout(scrollTimer);
  }, [dxFeed.status, dxPanelView, highlightDxModel, visibleDxTrades]);

  return (
    <section aria-labelledby="dealer-exchange-page-title">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase text-amber-700">Manager Workspace</p>
        <h2 id="dealer-exchange-page-title" className="mt-1 text-3xl font-bold text-stone-950">
          Dealer Exchange
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Completed exchange history, dealer relationships, and the current DX source in one place.
        </p>
      </div>

      <div id="dx-pipeline" className="pb-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-amber-800">Dealer Exchange Pipeline</h3>
                <span
                  data-testid="dx-feed-status"
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${dxStatusPresentation.className}`}
                >
                  {dxStatusPresentation.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-600">
                Completed exchanges from the 2024–2026 DX history.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-2.5 py-1 font-bold text-stone-800 shadow-sm">
                {dxTotals.completed} completed
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">
                {dxTotals.theyHelpedUs} they helped us
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">
                {dxTotals.weHelpedThem} we helped them
              </span>
              {dxTotals.unknown > 0 && (
                <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-600">
                  {dxTotals.unknown} direction unknown
                </span>
              )}
              {dxTotals.fees > 0 && (
                <span className="rounded-full bg-white px-2.5 py-1 text-stone-600 shadow-sm">
                  ${dxTotals.fees.toLocaleString()} current-sheet fees
                </span>
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
              <div className="text-right text-xs text-stone-500">
                <p>
                  Latest DX record <strong className="text-stone-700">{formatDxBusinessDate(dxFeed.latestBusinessDate)}</strong>
                </p>
                <p>
                  Browser fetched <strong className="text-stone-700">{formatDxFetchTime(dxFeed.lastSuccessAt)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshDx}
                disabled={dxLoading}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dxLoading ? "Syncing..." : "Refresh current source"}
              </button>
            </div>
          </div>

          {dxError && (
            <div
              className={`mt-3 rounded-lg border p-3 text-sm ${
                dxFeed.status === "stale"
                  ? "border-orange-200 bg-orange-50 text-orange-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              <strong>{dxFeed.status === "stale" ? "Showing last successful data." : "Current 2026 source unavailable."}</strong>{" "}
              {dxError}
            </div>
          )}

          {dxFeed.status === "no-data" && (
            <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-600">
              No current 2026 DX rows were returned. Closed-year history remains available below.
            </div>
          )}

          {dxFeed.rejectedRows.length > 0 && (
            <div
              data-testid="dx-rejected-source-rows"
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <strong>
                {dxFeed.rejectedRows.length} non-transaction source {dxFeed.rejectedRows.length === 1 ? "row was" : "rows were"} excluded from completed metrics.
              </strong>{" "}
              No vehicle-record evidence was present.
              <span className="ml-2 inline-flex flex-wrap gap-2">
                {dxFeed.rejectedRows.slice(0, 3).map((rejected) => (
                  <a
                    key={`${rejected.sourceYear}-${rejected.sourceRowNumber}-${rejected.sourceFingerprint}`}
                    href={rejected.sourceRowUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-950"
                  >
                    Source row {rejected.sourceRowNumber} ↗
                  </a>
                ))}
              </span>
            </div>
          )}

          {dxLoading && dxTrades.length === 0 && (
            <div
              className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white"
              aria-busy="true"
              aria-label="Loading dealer exchange source"
            >
              <div className="flex flex-wrap gap-3 bg-amber-50 px-3 py-3">
                <div className="h-3 w-16 animate-pulse rounded bg-amber-200/70" />
                <div className="h-3 w-24 animate-pulse rounded bg-amber-200/70" />
                <div className="h-3 w-20 animate-pulse rounded bg-amber-200/70" />
                <div className="h-3 w-28 animate-pulse rounded bg-amber-200/70" />
              </div>
              <div className="divide-y divide-stone-100">
                {[1, 2, 3].map((row) => (
                  <div key={row} className="flex items-center gap-3 px-3 py-4">
                    <div className="h-4 w-32 animate-pulse rounded bg-stone-200" />
                    <div className="h-4 w-20 animate-pulse rounded bg-stone-100" />
                    <div className="h-4 w-24 animate-pulse rounded bg-stone-100" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 border-b border-stone-200">
          <div className="flex gap-1" role="tablist" aria-label="Dealer Exchange views">
            <button
              type="button"
              role="tab"
              aria-selected={dxPanelView === "partners"}
              onClick={() => setDxPanelView("partners")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                dxPanelView === "partners"
                  ? "border border-b-white border-stone-200 bg-white text-amber-800"
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
              }`}
            >
              DX Partners
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dxPanelView === "history"}
              onClick={() => setDxPanelView("history")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                dxPanelView === "history"
                  ? "border border-b-white border-stone-200 bg-white text-amber-800"
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
              }`}
            >
              Completed exchanges
            </button>
          </div>
        </div>

        <div className="mt-3">
          {dxPanelView === "partners" ? (
            <DxPartners
              trades={dxTrades}
              selectedDealerId={selectedDxDealerId}
              onSelectedDealerChange={setSelectedDxDealerId}
            />
          ) : (
            <section data-testid="dx-completed-history">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-stone-500">
                  Source-addressable completed exchange evidence. Newest records first.
                </p>
                <label className="flex items-center gap-2 text-xs font-semibold text-stone-500">
                  Year
                  <select
                    value={dxHistoryYear}
                    onChange={(event) => setDxHistoryYear(event.target.value as DxHistoryYear)}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700"
                  >
                    <option value="2026">2026 current</option>
                    <option value="2025">2025 history</option>
                    <option value="2024">2024 history</option>
                    <option value="all">All years</option>
                  </select>
                </label>
              </div>

              {visibleDxTrades.length === 0 ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">
                  No completed DX records are available for that year.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-amber-50 text-left text-xs font-semibold uppercase tracking-wide text-amber-800">
                      <tr>
                        <th scope="col" className="px-3 py-3">Date</th>
                        <th scope="col" className="px-3 py-3">Vehicle</th>
                        <th scope="col" className="px-3 py-3">Color</th>
                        <th scope="col" className="px-3 py-3">Trading dealer</th>
                        <th scope="col" className="px-3 py-3">Completed relationship</th>
                        <th scope="col" className="px-3 py-3">Stock / VIN</th>
                        <th scope="col" className="px-3 py-3">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {visibleDxTrades.map((trade) => {
                        const relationshipId = dxRelationshipByTradeId.get(trade.id);
                        const normalizedTradeModel = normalizeDxModel(trade.description);
                        const highlighted = Boolean(
                          highlightDxModel
                          && normalizedTradeModel
                          && (
                            normalizedTradeModel.includes(highlightDxModel)
                            || highlightDxModel.includes(normalizedTradeModel)
                          )
                        );
                        return (
                          <tr
                            key={trade.id}
                            data-dx-highlight={highlighted ? "true" : undefined}
                            className={`text-stone-700 transition-colors ${
                              highlighted
                                ? "bg-amber-100 ring-2 ring-inset ring-amber-400"
                                : "hover:bg-stone-50"
                            }`}
                          >
                            <td className="whitespace-nowrap px-3 py-3 text-stone-500">{formatDxBusinessDate(trade.date || null)}</td>
                            <td className="px-3 py-3">
                              <span className="font-semibold text-stone-900">{trade.description || trade.modelNumber || "Not recorded"}</span>
                              {trade.year && <span className="ml-1 text-xs text-stone-400">{trade.year}</span>}
                              {trade.outgoingModelNumber && (
                                <p className="mt-0.5 text-xs text-stone-400">Other side: {trade.outgoingModelNumber}</p>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {[trade.colorCode, trade.color].filter(Boolean).join(" · ") || "—"}
                            </td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                disabled={!relationshipId}
                                onClick={() => {
                                  if (!relationshipId) return;
                                  setSelectedDxDealerId(relationshipId);
                                  setDxPanelView("partners");
                                }}
                                className="text-left font-medium text-stone-900 enabled:hover:text-amber-700 enabled:hover:underline disabled:cursor-default"
                              >
                                {trade.tradingDealer || "Unknown dealer"}
                              </button>
                              {trade.dealerCode && <p className="mt-0.5 text-xs text-stone-400">Dealer {trade.dealerCode}</p>}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  trade.direction === "OURS"
                                    ? "bg-amber-100 text-amber-800"
                                    : trade.direction === "THEIRS"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-stone-100 text-stone-600"
                                }`}
                              >
                                {trade.direction === "OURS"
                                  ? "They helped us"
                                  : trade.direction === "THEIRS"
                                    ? "We helped them"
                                    : "Direction unknown"}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-stone-500">
                              {trade.stockNumber || trade.vinIncoming || (trade.sourceDataKind === "SANITIZED_HISTORY" ? "Private historical source" : "—")}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <a
                                href={trade.sourceRowUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-amber-700 hover:underline"
                              >
                                {trade.sourceYear} row {trade.sourceRowNumber} ↗
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  );
};

export default DealerExchange;
