import { useMemo, useState } from "react";
import { Drawer } from "vaul";
import type { DxTrade } from "../src/utils/dxSheetParser";
import {
  aggregateDxRelationships,
  type DealerRelationship,
} from "../src/utils/dxRelationships";

import { currentFileDxTrades, DX_CURRENT_FILE_DATE_LABEL } from "../src/utils/dxCurrentFileScope";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: parsed.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function balanceLabel(balance: number): string {
  if (balance === 0) return "Even";
  if (balance > 0) return `We owe ${balance}`;
  return `They owe us ${Math.abs(balance)}`;
}

function initiatorLabel(trade: DxTrade): string {
  if (trade.direction === "OURS") return "Requested by us";
  if (trade.direction === "THEIRS") return "Requested by them";
  return "Requester not recorded";
}

function incomingVehicleLabel(trade: DxTrade): string {
  return [trade.year, trade.description || trade.modelNumber]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ") || "Vehicle not recorded";
}

function outgoingVehicleLabel(trade: DxTrade): string {
  return trade.outgoingModelNumber || trade.vinOutgoing || trade.outgoingStock || "Not recorded";
}

interface MetricProps {
  label: string;
  value: string | number;
  tone?: "platinum" | "white" | "muted";
}

function Metric({ label, value, tone = "white" }: MetricProps) {
  const toneClasses = {
    platinum: "text-platinum",
    white: "text-white",
    muted: "text-stone-300",
  }[tone];

  return (
    <div className="min-w-0 border-l border-white/15 p-3 first:border-l-0">
      <p className={`text-xl font-bold tabular-nums ${toneClasses}`}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
    </div>
  );
}

interface DealerHistoryDrawerProps {
  relationship: DealerRelationship | null;
  onClose: () => void;
}

function DealerHistoryDrawer({ relationship, onClose }: DealerHistoryDrawerProps) {
  return (
    <Drawer.Root
      direction="right"
      open={relationship !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col bg-white shadow-xl outline-none sm:max-w-xl sm:rounded-l-2xl"
          aria-describedby={undefined}
          data-testid="dx-dealer-history-drawer"
        >
          {relationship && (
            <>
              <div className="flex items-start justify-between gap-3 bg-graphite p-4 text-white sm:rounded-tl-2xl">
                <div className="min-w-0">
                  <Drawer.Title className="truncate text-lg font-semibold text-white">
                    {relationship.displayName}
                  </Drawer.Title>
                  <p className="mt-0.5 text-sm text-stone-300">
                    {relationship.dealerCode ? `Dealer ${relationship.dealerCode}` : "Dealer code not recorded"}
                  </p>
                  {relationship.aliases.length > 1 && (
                    <p className="mt-1 text-xs text-stone-400">
                      Source names: {relationship.aliases.join(" · ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dealer history"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-platinum"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Spreadsheet ledger records</p>
                <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-lg bg-graphite sm:grid-cols-4">
                  <Metric label="Vehicles received" value={relationship.allTime.vehiclesReceived} tone="platinum" />
                  <Metric label="Vehicles sent" value={relationship.allTime.vehiclesSent} />
                  <Metric label="Ledger records" value={relationship.allTime.totalCompleted} />
                  <Metric label="Vehicle balance" value={balanceLabel(relationship.allTime.vehicleBalance)} tone="muted" />
                </div>

                <p className="mt-2 text-xs text-stone-500">
                  Who requested it: us {relationship.allTime.oursRequested} · them {relationship.allTime.theirsRequested}
                  {relationship.allTime.unknownInitiator > 0 ? ` · not recorded ${relationship.allTime.unknownInitiator}` : ""}
                </p>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-stone-900">Vehicle movement records</h3>
                  <span className="text-xs text-stone-400">Newest first</span>
                </div>
                <div className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200">
                  {relationship.history.map((trade) => (
                    <article key={trade.id} className="p-3" data-testid="dx-history-event">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-stone-900">Received: {incomingVehicleLabel(trade)}</p>
                          <p className="mt-0.5 text-xs text-stone-500">Sent: {outgoingVehicleLabel(trade)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-stone-700">{formatDate(trade.date)}</p>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            trade.direction === "OURS"
                              ? "bg-platinum text-graphite"
                              : trade.direction === "THEIRS"
                                ? "bg-stone-200 text-stone-800"
                                : "bg-stone-100 text-stone-600"
                          }`}>
                            {initiatorLabel(trade)}
                          </span>
                        </div>
                      </div>
                      <a
                        href={trade.sourceRowUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-stone-700 underline decoration-stone-300 underline-offset-2 hover:text-stone-950"
                      >
                        Source: {trade.sourceYear} row {trade.sourceRowNumber} ↗
                      </a>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export interface DxPartnersProps {
  trades: readonly DxTrade[];
  selectedDealerId?: string | null;
  onSelectedDealerChange?: (dealerId: string | null) => void;
}

export default function DxPartners({
  trades,
  selectedDealerId,
  onSelectedDealerChange,
}: DxPartnersProps) {
  const [query, setQuery] = useState("");
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const relationships = useMemo(() => aggregateDxRelationships(currentFileDxTrades(trades)), [trades]);
  const activeSelectedId = selectedDealerId === undefined ? internalSelectedId : selectedDealerId;
  const setSelectedId = (next: string | null) => {
    if (onSelectedDealerChange) onSelectedDealerChange(next);
    if (selectedDealerId === undefined) setInternalSelectedId(next);
  };
  const selected = relationships.find((relationship) => relationship.id === activeSelectedId) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const visible = relationships
    .filter((relationship) => {
      if (!normalizedQuery) return true;
      return [relationship.displayName, relationship.dealerCode, ...relationship.aliases]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort((first, second) => {
      const firstMetrics = first.allTime;
      const secondMetrics = second.allTime;
      return secondMetrics.totalCompleted - firstMetrics.totalCompleted
        || (secondMetrics.lastActivity ?? "").localeCompare(firstMetrics.lastActivity ?? "")
        || first.displayName.localeCompare(second.displayName);
    });

  return (
    <section data-testid="dx-partners">
      <div className="flex flex-col gap-3 border-b border-stone-300 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Spreadsheet movements</p>
          <h4 className="mt-1 text-xl font-bold text-stone-900">Dealer Exchange Partners</h4>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            Only the accepted spreadsheet dates: {DX_CURRENT_FILE_DATE_LABEL}. Vehicles received and sent are counted separately from who requested the exchange.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <label className="relative block">
            <span className="sr-only">Search DX partners</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find dealer or code"
              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-stone-600 focus:ring-2 focus:ring-stone-200 sm:w-56"
            />
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">
          {relationships.length === 0 ? "No spreadsheet dealer relationships are available." : "No dealer matches that search."}
        </div>
      ) : (
        <>
          <div className="mt-3 hidden overflow-hidden rounded-lg border border-stone-300 bg-white md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Dealer</th>
                  <th scope="col" className="px-3 py-3 text-right">Vehicles received</th>
                  <th scope="col" className="px-3 py-3 text-right">Vehicles sent</th>
                  <th scope="col" className="px-3 py-3 text-right">Ledger records</th>
                  <th scope="col" className="px-3 py-3">Vehicle balance</th>
                  <th scope="col" className="px-3 py-3">Requested by</th>
                  <th scope="col" className="px-4 py-3 text-right">Last DX</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visible.map((relationship) => {
                  const metrics = relationship.allTime;
                  return (
                    <tr key={relationship.id} className="hover:bg-stone-50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedId(relationship.id)}
                          className="text-left font-semibold text-stone-900 hover:underline"
                        >
                          {relationship.displayName}
                        </button>
                        <p className="mt-0.5 text-xs text-stone-400">
                          {relationship.dealerCode ? `Dealer ${relationship.dealerCode}` : "Code not recorded"}
                          {relationship.aliases.length > 1 ? ` · ${relationship.aliases.length} source names merged` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-stone-950">{metrics.vehiclesReceived}</td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-stone-700">{metrics.vehiclesSent}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-stone-800">{metrics.totalCompleted}</td>
                      <td className="px-3 py-3 text-xs font-medium text-stone-600">{balanceLabel(metrics.vehicleBalance)}</td>
                      <td className="px-3 py-3 text-xs text-stone-600">Us {metrics.oursRequested} · Them {metrics.theirsRequested}</td>
                      <td className="px-4 py-3 text-right text-stone-600">{formatDate(metrics.lastActivity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid gap-3 md:hidden">
            {visible.map((relationship) => {
              const metrics = relationship.allTime;
              return (
                <button
                  key={relationship.id}
                  type="button"
                  onClick={() => setSelectedId(relationship.id)}
                  className="overflow-hidden rounded-lg border border-stone-300 bg-white text-left transition hover:border-stone-500"
                >
                  <div className="flex items-start justify-between gap-3 bg-graphite p-4 text-white">
                    <div>
                      <p className="font-semibold text-white">{relationship.displayName}</p>
                      <p className="mt-0.5 text-xs text-stone-300">{relationship.dealerCode || "Code not recorded"}</p>
                    </div>
                    <p className="text-right text-xs text-stone-400">Last DX<br /><strong className="text-platinum">{formatDate(metrics.lastActivity)}</strong></p>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-stone-200 text-center">
                    <div className="px-2 py-3">
                      <p className="font-bold text-stone-950">{metrics.vehiclesReceived}</p>
                      <p className="text-[10px] uppercase tracking-wide text-stone-500">Vehicles received</p>
                    </div>
                    <div className="px-2 py-3">
                      <p className="font-bold text-stone-800">{metrics.vehiclesSent}</p>
                      <p className="text-[10px] uppercase tracking-wide text-stone-500">Vehicles sent</p>
                    </div>
                    <div className="px-2 py-3">
                      <p className="font-bold text-stone-800">{metrics.totalCompleted}</p>
                      <p className="text-[10px] uppercase tracking-wide text-stone-500">Ledger records</p>
                    </div>
                  </div>
                  <p className="border-t border-stone-200 px-4 py-3 text-xs font-semibold text-stone-600">
                    {balanceLabel(metrics.vehicleBalance)} · Requested by us {metrics.oursRequested}, them {metrics.theirsRequested} · View history →
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}

      <DealerHistoryDrawer relationship={selected} onClose={() => setSelectedId(null)} />
    </section>
  );
}
