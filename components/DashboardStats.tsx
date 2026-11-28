import React from 'react';
import type { ModelSlotTotals } from '../src/utils/allocationModelTotals';

interface KpiProps {
  title: string;
  value: number;
  /** Amber is reserved for genuine "needs attention" counts. */
  attention?: boolean;
}

const Kpi: React.FC<KpiProps> = ({ title, value, attention = false }) => (
  <div className="min-w-0 px-4 py-3 sm:px-5">
    <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-stone-500">{title}</p>
    <p
      className={`mt-0.5 text-2xl font-bold leading-none tabular-nums ${
        attention ? 'text-amber-700' : 'text-stone-950'
      }`}
    >
      {value}
    </p>
  </div>
);

interface DashboardStatsProps {
    totalActive: number;
    awaitingAction: number;
    securedLast30Days: number;
    /** Per-model allocation slot totals (count-based). Strip is hidden when empty. */
    modelTotals?: ModelSlotTotals[];
}

const DashboardStats: React.FC<DashboardStatsProps> = ({
    totalActive,
    awaitingAction,
    securedLast30Days,
    modelTotals = []
}) => {
    return (
        <>
            {/* Compact KPI strip: one shell, three divided cells. */}
            <div
                className="mb-4 grid grid-cols-3 divide-x divide-stone-200 rounded-xl border border-stone-200 bg-white shadow-sm"
                data-testid="dashboard-kpi-strip"
            >
                <Kpi title="Total Active" value={totalActive} />
                <Kpi title="Awaiting Action" value={awaitingAction} attention={awaitingAction > 0} />
                <Kpi title="Secured 30d" value={securedLast30Days} />
            </div>

            {modelTotals.length > 0 && (
                <div className="mb-6" data-testid="dashboard-model-totals">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                        Received by Model
                    </p>
                    {/* Scrolls inside its own container so the page never overflows on phones. */}
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable region (axe scrollable-region-focusable) */}
                    <div tabIndex={0} role="region" aria-label="Received by model, scrollable" className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400">
                        <div className="flex min-w-max divide-x divide-stone-200 md:min-w-0 md:flex-wrap md:divide-x-0">
                            {modelTotals.map((total) => (
                                <div
                                    key={total.model}
                                    className="px-3.5 py-2 md:border-b md:border-r md:border-stone-100 md:flex-none"
                                    data-testid="dashboard-model-total-card"
                                >
                                    <p className="whitespace-nowrap text-sm font-bold text-stone-900">{total.model}</p>
                                    <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums">
                                        <span className="font-semibold text-stone-700">{total.totalSlots} received</span>
                                        <span className="text-stone-300" aria-hidden="true">&middot;</span>
                                        <span className="font-semibold text-emerald-700">{total.linkedSlots} linked</span>
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default DashboardStats;
