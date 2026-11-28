import React from 'react';
import type { ModelSlotTotals } from '../src/utils/allocationModelTotals';

interface KpiProps {
  title: string;
  value: number;
  /** Amber is reserved for genuine "needs attention" counts. */
  attention?: boolean;
}

const Kpi: React.FC<KpiProps> = ({ title, value, attention = false }) => (
  <div className="min-w-0 px-4 py-4 sm:px-6 sm:py-5">
    <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.16em] text-stone-500 sm:text-[11px]">{title}</p>
    <p
      className={`mt-2 text-3xl font-black leading-none tracking-tight tabular-nums sm:text-5xl ${
        attention ? 'text-amber-600' : 'text-stone-950'
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
                className="mb-5 grid grid-cols-3 divide-x divide-stone-100 rounded-2xl bg-white shadow-card ring-1 ring-stone-950/5"
                data-testid="dashboard-kpi-strip"
            >
                <Kpi title="Total Active" value={totalActive} />
                <Kpi title="Awaiting Action" value={awaitingAction} attention={awaitingAction > 0} />
                <Kpi title="Secured 30d" value={securedLast30Days} />
            </div>

            {modelTotals.length > 0 && (
                <div className="mb-6" data-testid="dashboard-model-totals">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">
                        Received by Model
                    </p>
                    {/* Scrolls inside its own container so the page never overflows on phones. */}
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable region (axe scrollable-region-focusable) */}
                    <div tabIndex={0} role="region" aria-label="Received by model, scrollable" className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-stone-950/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400">
                        <div className="flex min-w-max divide-x divide-stone-100 md:grid md:min-w-0 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:gap-y-1 md:divide-x-0 md:p-2">
                            {modelTotals.map((total) => (
                                <div
                                    key={total.model}
                                    className="px-4 py-3 md:px-3 md:py-2"
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
