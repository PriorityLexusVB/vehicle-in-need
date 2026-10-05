import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DxFeedState } from "../src/utils/dxFeedState";
import {
  aggregateDxRelationships,
  hasIncomingDxVehicle,
  hasOutgoingDxVehicle,
} from "../src/utils/dxRelationships";
import DxPartners from "./DxPartners";
import { currentFileDxTrades, DX_CURRENT_FILE_DATE_LABEL } from "../src/utils/dxCurrentFileScope";

interface DealerExchangeProps {
  /** Single App-owned DX source state. This surface never fetches independently. */
  dxFeed: DxFeedState;
  /** Refreshes the App-owned DX source state. */
  onRefreshDx: () => void;
}

type DxPanelView = "partners" | "history";

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
  const [selectedDxDealerId, setSelectedDxDealerId] = useState<string | null>(null);
  const [highlightDxModel, setHighlightDxModel] = useState<string | null>(() => {
    const model = initialDeepLink.current.model;
    return model ? normalizeDxModel(model) : null;
  });
  const deepLinkScrollCompleted = useRef(false);

  const dxTrades = useMemo(() => currentFileDxTrades(dxFeed.trades), [dxFeed.trades]);
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
  const visibleDxTrades = dxTrades;
  const dxTotals = useMemo(() => ({
    completed: dxTrades.length,
    vehiclesReceived: dxTrades.filter(hasIncomingDxVehicle).length,
    vehiclesSent: dxTrades.filter(hasOutgoingDxVehicle).length,
    oursRequested: dxTrades.filter((trade) => trade.direction === "OURS").length,
    theirsRequested: dxTrades.filter((trade) => trade.direction === "THEIRS").length,
    unknownInitiator: dxTrades.filter((trade) => !trade.direction).length,
    fees: dxTrades.reduce((sum, trade) => sum + (Number(trade.dxFee) || 0), 0),
  }), [dxTrades]);
  const vehicleBalance = dxTotals.vehiclesReceived - dxTotals.vehiclesSent;
  const vehicleBalanceLabel = vehicleBalance === 0
    ? "Even"
    : vehicleBalance > 0
      ? `We owe ${vehicleBalance}`
      : `They owe us ${Math.abs(vehicleBalance)}`;
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
      <div className="mb-4 border-b border-stone-300 pb-3 sm:mb-5 sm:pb-4">
        <p className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 sm:block">Manager command desk</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="dealer-exchange-page-title" className="text-3xl font-bold tracking-tight text-stone-950">
              Dealer Exchange
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Track vehicles received and sent, who requested each exchange, and the evidence behind every spreadsheet record.
            </p>
          </div>
          <p className="hidden text-xs font-medium text-stone-500 sm:block">
            {dxRelationships.length} {dxRelationships.length === 1 ? "partner" : "partners"} on record
          </p>
        </div>
      </div>

      <div id="dx-pipeline" className="pb-6">
        <div className="overflow-hidden rounded-xl bg-graphite text-white">
          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-platinum">Relationship ledger</p>
                <span
                  data-testid="dx-feed-status"
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${dxStatusPresentation.className}`}
                >
                  {dxStatusPresentation.label}
                </span>
              </div>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">
                {dxTotals.completed} ledger {dxTotals.completed === 1 ? "record" : "records"}
              </h3>
              <p className="mt-1 hidden text-sm text-stone-300 sm:block">
                Vehicle movement and who requested the exchange are counted separately.
              </p>
              <dl className="mt-5 grid grid-cols-4 border-y border-white/15">
                <div className="border-r border-white/15 py-3 pr-2 sm:pr-3">
                  <dt className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-stone-400 sm:text-[11px]">Vehicles received</dt>
                  <dd className="mt-1 text-xl font-bold tabular-nums text-white sm:text-2xl">{dxTotals.vehiclesReceived}</dd>
                </div>
                <div className="border-r border-white/15 px-2 py-3 sm:px-3">
                  <dt className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-stone-400 sm:text-[11px]">Vehicles sent</dt>
                  <dd className="mt-1 text-xl font-bold tabular-nums text-white sm:text-2xl">{dxTotals.vehiclesSent}</dd>
                </div>
                <div className="border-r border-white/15 px-2 py-3 sm:px-3">
                  <dt className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-stone-400 sm:text-[11px]">Vehicle balance</dt>
                  <dd className="mt-1 text-xs font-semibold text-platinum sm:text-sm">{vehicleBalanceLabel}</dd>
                </div>
                <div className="py-3 pl-2 sm:pl-3">
                  <dt className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-stone-400 sm:text-[11px]">Current fees</dt>
                  <dd className="mt-1 text-xs font-semibold text-white sm:text-sm">
                    {dxTotals.fees > 0 ? `$${dxTotals.fees.toLocaleString()}` : "None recorded"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid min-w-56 grid-cols-2 gap-3 border-t border-white/15 pt-4 lg:flex lg:flex-col lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Latest spreadsheet DX</p>
                <p className="mt-1 font-semibold text-white">{formatDxBusinessDate(dxFeed.latestBusinessDate)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Source checked</p>
                <p className="mt-1 font-semibold text-white">{formatDxFetchTime(dxFeed.lastSuccessAt)}</p>
              </div>
              <button
                type="button"
                onClick={onRefreshDx}
                disabled={dxLoading}
                className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-lg bg-platinum px-4 py-2 text-sm font-semibold text-graphite transition-colors hover:bg-canvas-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dxLoading ? "Syncing..." : "Refresh current source"}
              </button>
              <p className="col-span-2 text-xs text-stone-300">Requested by us {dxTotals.oursRequested} · by them {dxTotals.theirsRequested}</p>
              {dxTotals.unknownInitiator > 0 && (
                <p className="col-span-2 text-xs text-stone-300">{dxTotals.unknownInitiator} ledger {dxTotals.unknownInitiator === 1 ? "record has" : "records have"} no requester recorded.</p>
              )}
            </div>
          </div>

          {dxError && (
            <div
              className={`border-t p-3 text-sm sm:px-5 ${
                dxFeed.status === "stale"
                  ? "border-orange-300/40 bg-orange-950/40 text-orange-100"
                  : "border-red-300/40 bg-red-950/40 text-red-100"
              }`}
            >
              <strong>{dxFeed.status === "stale" ? "Showing last successful data." : "Current 2026 source unavailable."}</strong>{" "}
              {dxError}
            </div>
          )}

          {dxFeed.status === "no-data" && (
            <div className="border-t border-white/15 bg-white/5 p-3 text-sm text-stone-200 sm:px-5">
              No current 2026 DX rows were returned for the accepted spreadsheet dates.
            </div>
          )}

          {dxFeed.rejectedRows.length > 0 && (
            <div
              data-testid="dx-rejected-source-rows"
              className="border-t border-amber-300/40 bg-amber-950/30 p-3 text-sm text-amber-100 sm:px-5"
            >
              <strong>
                {dxFeed.rejectedRows.length} non-transaction source {dxFeed.rejectedRows.length === 1 ? "row was" : "rows were"} excluded from ledger metrics.
              </strong>{" "}
              No vehicle-record evidence was present.
              <span className="ml-2 inline-flex flex-wrap gap-2">
                {dxFeed.rejectedRows.slice(0, 3).map((rejected) => (
                  <a
                    key={`${rejected.sourceYear}-${rejected.sourceRowNumber}-${rejected.sourceFingerprint}`}
                    href={rejected.sourceRowUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-amber-100 underline decoration-amber-300 underline-offset-2 hover:text-white"
                  >
                    Source row {rejected.sourceRowNumber} ↗
                  </a>
                ))}
              </span>
            </div>
          )}

          {dxLoading && dxTrades.length === 0 && (
            <div
              className="border-t border-white/15 bg-white"
              aria-busy="true"
              aria-label="Loading dealer exchange source"
            >
              <div className="flex flex-wrap gap-3 bg-stone-100 px-3 py-3">
                <div className="h-3 w-16 animate-pulse rounded bg-stone-300" />
                <div className="h-3 w-24 animate-pulse rounded bg-stone-300" />
                <div className="h-3 w-20 animate-pulse rounded bg-stone-300" />
                <div className="h-3 w-28 animate-pulse rounded bg-stone-300" />
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

        <div className="mt-4 rounded-lg border border-stone-300 bg-white p-1">
          <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Dealer Exchange views">
            <button
              type="button"
              role="tab"
              aria-selected={dxPanelView === "partners"}
              onClick={() => setDxPanelView("partners")}
              className={`min-h-11 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                dxPanelView === "partners"
                  ? "bg-graphite text-white"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              DX Partners
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dxPanelView === "history"}
              onClick={() => setDxPanelView("history")}
              className={`min-h-11 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                dxPanelView === "history"
                  ? "bg-graphite text-white"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              Ledger records
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
                <p className="max-w-2xl text-sm text-stone-600">
                  Every spreadsheet record links back to its source row. Newest records first.
                </p>
                <p className="text-xs font-semibold text-stone-500">{DX_CURRENT_FILE_DATE_LABEL} · spreadsheet only</p>
              </div>

              {visibleDxTrades.length === 0 ? (
                <div className="rounded-lg border border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
                  No DX records are available for the accepted spreadsheet dates.
                </div>
              ) : (
                <>
                <div className="hidden overflow-hidden rounded-lg border border-stone-300 bg-white md:block">
                  <table className="min-w-full text-sm">
                    <thead className="bg-graphite text-left text-[11px] font-semibold uppercase tracking-wide text-stone-200">
                      <tr>
                        <th scope="col" className="px-3 py-3">Date</th>
                        <th scope="col" className="px-3 py-3">Vehicle</th>
                        <th scope="col" className="px-3 py-3">Color</th>
                        <th scope="col" className="px-3 py-3">Trading dealer</th>
                        <th scope="col" className="px-3 py-3">Requested by</th>
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
                                ? "bg-platinum/50 ring-2 ring-inset ring-stone-500"
                                : "hover:bg-stone-50"
                            }`}
                          >
                            <td className="whitespace-nowrap px-3 py-3 text-stone-500">{formatDxBusinessDate(trade.date || null)}</td>
                            <td className="px-3 py-3">
                              <span className="font-semibold text-stone-900">{trade.description || trade.modelNumber || "Not recorded"}</span>
                              {trade.year && <span className="ml-1 text-xs text-stone-400">{trade.year}</span>}
                              <p className="mt-0.5 text-xs text-stone-400">Sent: {trade.outgoingModelNumber || trade.vinOutgoing || trade.outgoingStock || "Not recorded"}</p>
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
                                className="text-left font-medium text-stone-900 enabled:hover:underline disabled:cursor-default"
                              >
                                {trade.tradingDealer || "Unknown dealer"}
                              </button>
                              {trade.dealerCode && <p className="mt-0.5 text-xs text-stone-400">Dealer {trade.dealerCode}</p>}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  trade.direction === "OURS"
                                    ? "bg-platinum text-graphite"
                                    : trade.direction === "THEIRS"
                                      ? "bg-stone-200 text-stone-800"
                                      : "bg-stone-100 text-stone-600"
                                }`}
                              >
                                {trade.direction === "OURS"
                                  ? "Us"
                                  : trade.direction === "THEIRS"
                                    ? "Them"
                                    : "Not recorded"}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-stone-500">
                              {trade.stockNumber || trade.vinIncoming || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <a
                                href={trade.sourceRowUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-stone-700 underline decoration-stone-300 underline-offset-2 hover:text-stone-950"
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
                <div className="grid gap-3 md:hidden">
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
                      <article
                        key={trade.id}
                        data-testid="dx-mobile-history-record"
                        data-dx-highlight={highlighted ? "true" : undefined}
                        className={`overflow-hidden rounded-lg border bg-white ${highlighted ? "border-stone-600 ring-2 ring-stone-300" : "border-stone-300"}`}
                      >
                        <div className="flex items-start justify-between gap-3 bg-graphite px-4 py-3 text-white">
                          <div>
                            <p className="text-lg font-bold">{trade.description || trade.modelNumber || "Vehicle not recorded"}</p>
                            <p className="mt-0.5 text-xs text-stone-300">{[trade.year, trade.colorCode, trade.color].filter(Boolean).join(" · ")}</p>
                          </div>
                          <p className="whitespace-nowrap text-xs font-semibold text-platinum">{formatDxBusinessDate(trade.date || null)}</p>
                        </div>
                        <dl className="grid grid-cols-2 gap-px bg-stone-200">
                          <div className="bg-white p-3">
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Trading dealer</dt>
                            <dd className="mt-1 text-sm font-semibold text-stone-900">{trade.tradingDealer || "Unknown dealer"}</dd>
                            {trade.dealerCode && <p className="mt-0.5 text-xs text-stone-500">Dealer {trade.dealerCode}</p>}
                          </div>
                          <div className="bg-white p-3">
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Requested by</dt>
                            <dd className="mt-1 text-sm font-semibold text-stone-900">
                              {trade.direction === "OURS" ? "Us" : trade.direction === "THEIRS" ? "Them" : "Not recorded"}
                            </dd>
                          </div>
                          <div className="bg-white p-3">
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Stock / VIN</dt>
                            <dd className="mt-1 break-all font-mono text-xs text-stone-700">
                              {trade.stockNumber || trade.vinIncoming || "Not recorded"}
                            </dd>
                          </div>
                          <div className="bg-white p-3">
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Evidence</dt>
                            <dd className="mt-1">
                              <a
                                href={trade.sourceRowUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-11 items-center text-xs font-semibold text-stone-800 underline decoration-stone-300 underline-offset-2"
                              >
                                {trade.sourceYear} row {trade.sourceRowNumber} ↗
                              </a>
                            </dd>
                          </div>
                        </dl>
                        {relationshipId && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDxDealerId(relationshipId);
                              setDxPanelView("partners");
                            }}
                            className="min-h-11 w-full border-t border-stone-200 px-4 text-left text-sm font-semibold text-stone-800 hover:bg-stone-50"
                          >
                            View dealer relationship →
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  );
};

export default DealerExchange;
