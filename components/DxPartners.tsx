import { useMemo, useState } from "react";
import { Drawer } from "vaul";
import type { DxTrade } from "../src/utils/dxSheetParser";
import {
  aggregateDxRelationships,
  type DealerRelationship,
  type DxRelationshipMetrics,
} from "../src/utils/dxRelationships";

type RelationshipRange = "all" | "recent";

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

function metricsFor(relationship: DealerRelationship, range: RelationshipRange): DxRelationshipMetrics {
  return range === "recent" ? relationship.recent12Months : relationship.allTime;
}

function balanceLabel(balance: number): string {
  if (balance === 0) return "Even";
  if (balance > 0) return `They helped us +${balance}`;
  return `We helped them +${Math.abs(balance)}`;
}

function directionLabel(trade: DxTrade): string {
  if (trade.direction === "OURS") return "They helped us";
  if (trade.direction === "THEIRS") return "We helped them";
  return "Direction unknown";
}

function vehicleLabel(trade: DxTrade): string {
  return [trade.year, trade.description || trade.modelNumber]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ") || "Vehicle not recorded";
}

interface MetricProps {
  label: string;
  value: string | number;
  tone?: "amber" | "emerald" | "stone";
}

function Metric({ label, value, tone = "stone" }: MetricProps) {
  const toneClasses = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    stone: "border-stone-200 bg-stone-50 text-stone-900",
  }[tone];

  return (
    <div className={`rounded-xl border p-3 ${toneClasses}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
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
              <div className="flex items-start justify-between gap-3 border-b border-stone-100 p-4">
                <div className="min-w-0">
                  <Drawer.Title className="truncate text-lg font-semibold text-stone-900">
                    {relationship.displayName}
                  </Drawer.Title>
                  <p className="mt-0.5 text-sm text-stone-500">
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
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">All completed exchanges</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="They helped us" value={relationship.allTime.theyHelpedUs} tone="amber" />
                  <Metric label="We helped them" value={relationship.allTime.weHelpedThem} tone="emerald" />
                  <Metric label="Total completed" value={relationship.allTime.totalCompleted} />
                  <Metric label="Balance" value={balanceLabel(relationship.allTime.balance)} />
                </div>

                <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Recent 12 months</p>
                    <p className="text-xs text-stone-400">
                      {formatDate(relationship.recent12Months.startDate)}–{formatDate(relationship.recent12Months.endDate)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-stone-700">
                    <strong>{relationship.recent12Months.totalCompleted}</strong> completed · {relationship.recent12Months.theyHelpedUs} they helped us · {relationship.recent12Months.weHelpedThem} we helped them
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-stone-900">Completed vehicle history</h3>
                  <span className="text-xs text-stone-400">Newest first</span>
                </div>
                <div className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200">
                  {relationship.history.map((trade) => (
                    <article key={trade.id} className="p-3" data-testid="dx-history-event">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-stone-900">{vehicleLabel(trade)}</p>
                          <p className="mt-0.5 text-xs text-stone-500">
                            {[trade.colorCode, trade.color].filter(Boolean).join(" · ") || "Color not recorded"}
                            {trade.outgoingModelNumber ? ` · Other side ${trade.outgoingModelNumber}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-stone-700">{formatDate(trade.date)}</p>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            trade.direction === "OURS"
                              ? "bg-amber-100 text-amber-800"
                              : trade.direction === "THEIRS"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-stone-100 text-stone-600"
                          }`}>
                            {directionLabel(trade)}
                          </span>
                        </div>
                      </div>
                      <a
                        href={trade.sourceRowUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs font-medium text-amber-700 hover:text-amber-800 hover:underline"
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
  const [range, setRange] = useState<RelationshipRange>("all");
  const [query, setQuery] = useState("");
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const relationships = useMemo(() => aggregateDxRelationships(trades), [trades]);
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
      const firstMetrics = metricsFor(first, range);
      const secondMetrics = metricsFor(second, range);
      return secondMetrics.totalCompleted - firstMetrics.totalCompleted
        || (secondMetrics.lastActivity ?? "").localeCompare(firstMetrics.lastActivity ?? "")
        || first.displayName.localeCompare(second.displayName);
    });

  return (
    <section data-testid="dx-partners">
      <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Completed relationship history</p>
          <h4 className="mt-1 text-xl font-bold text-stone-900">Dealer Exchange Partners</h4>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            Factual completed exchanges only. No request, decline, response-rate, or black-box score is inferred.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="inline-flex self-start rounded-lg border border-stone-200 bg-stone-50 p-1" role="group" aria-label="Dealer relationship time range">
            <button
              type="button"
              onClick={() => setRange("all")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${range === "all" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              aria-pressed={range === "all"}
            >
              All time
            </button>
            <button
              type="button"
              onClick={() => setRange("recent")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${range === "recent" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              aria-pressed={range === "recent"}
            >
              Recent 12 months
            </button>
          </div>
          <label className="relative block">
            <span className="sr-only">Search DX partners</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find dealer or code"
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 sm:w-56"
            />
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">
          {relationships.length === 0 ? "No completed dealer relationships are available." : "No dealer matches that search."}
        </div>
      ) : (
        <>
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-stone-200 bg-white md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Dealer</th>
                  <th scope="col" className="px-3 py-3 text-right">They helped us</th>
                  <th scope="col" className="px-3 py-3 text-right">We helped them</th>
                  <th scope="col" className="px-3 py-3 text-right">Completed</th>
                  <th scope="col" className="px-3 py-3">Balance</th>
                  <th scope="col" className="px-4 py-3 text-right">Last DX</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visible.map((relationship) => {
                  const metrics = metricsFor(relationship, range);
                  return (
                    <tr key={relationship.id} className="hover:bg-amber-50/40">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedId(relationship.id)}
                          className="text-left font-semibold text-stone-900 hover:text-amber-700 hover:underline"
                        >
                          {relationship.displayName}
                        </button>
                        <p className="mt-0.5 text-xs text-stone-400">
                          {relationship.dealerCode ? `Dealer ${relationship.dealerCode}` : "Code not recorded"}
                          {relationship.aliases.length > 1 ? ` · ${relationship.aliases.length} source names merged` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-amber-800">{metrics.theyHelpedUs}</td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-emerald-700">{metrics.weHelpedThem}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-stone-800">{metrics.totalCompleted}</td>
                      <td className="px-3 py-3 text-xs font-medium text-stone-600">{balanceLabel(metrics.balance)}</td>
                      <td className="px-4 py-3 text-right text-stone-600">{formatDate(metrics.lastActivity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid gap-3 md:hidden">
            {visible.map((relationship) => {
              const metrics = metricsFor(relationship, range);
              return (
                <button
                  key={relationship.id}
                  type="button"
                  onClick={() => setSelectedId(relationship.id)}
                  className="rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-stone-900">{relationship.displayName}</p>
                      <p className="mt-0.5 text-xs text-stone-400">{relationship.dealerCode || "Code not recorded"}</p>
                    </div>
                    <p className="text-right text-xs text-stone-500">Last DX<br /><strong className="text-stone-800">{formatDate(metrics.lastActivity)}</strong></p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-amber-50 px-2 py-2">
                      <p className="font-bold text-amber-800">{metrics.theyHelpedUs}</p>
                      <p className="text-[10px] uppercase tracking-wide text-amber-700">Helped us</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-2 py-2">
                      <p className="font-bold text-emerald-700">{metrics.weHelpedThem}</p>
                      <p className="text-[10px] uppercase tracking-wide text-emerald-700">We helped</p>
                    </div>
                    <div className="rounded-lg bg-stone-100 px-2 py-2">
                      <p className="font-bold text-stone-800">{metrics.totalCompleted}</p>
                      <p className="text-[10px] uppercase tracking-wide text-stone-500">Completed</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-medium text-stone-500">{balanceLabel(metrics.balance)} · View history →</p>
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
