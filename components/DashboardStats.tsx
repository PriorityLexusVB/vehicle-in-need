import React from 'react';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { ClockIcon } from './icons/ClockIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import type { ModelSlotTotals } from '../src/utils/allocationModelTotals';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => (
  <div className="flex items-center gap-4 rounded-lg border border-stone-200 bg-white/90 p-5 shadow-sm">
    <div className={`rounded-lg p-3 ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-3xl font-bold leading-none text-stone-950">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase text-stone-500">{title}</p>
    </div>
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
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                    title="Total Active Orders"
                    value={totalActive}
                    icon={<BriefcaseIcon className="w-6 h-6 text-stone-950" />}
                    color="bg-amber-100"
                />
                <StatCard
                    title="Awaiting Action"
                    value={awaitingAction}
                    icon={<ClockIcon className="w-6 h-6 text-amber-700" />}
                    color="bg-amber-50"
                />
                 <StatCard
                    title="Secured (Last 30d)"
                    value={securedLast30Days}
                    icon={<CheckCircleIcon className="w-6 h-6 text-emerald-700" />}
                    color="bg-emerald-50"
                />
            </div>

            {modelTotals.length > 0 && (
                <div className="mb-8" data-testid="dashboard-model-totals">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">
                        Model Totals
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {modelTotals.map((total) => (
                            <div
                                key={total.model}
                                className="rounded-lg border border-stone-200 bg-white/90 px-3 py-2 shadow-sm"
                                data-testid="dashboard-model-total-card"
                            >
                                <p className="text-sm font-bold text-stone-900">{total.model}</p>
                                <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                                    <span className="font-semibold text-stone-700">{total.totalSlots} total</span>
                                    <span className="text-stone-300">&middot;</span>
                                    <span className="font-semibold text-stone-600">{total.availableSlots} open</span>
                                    <span className="text-stone-300">&middot;</span>
                                    <span className="font-semibold text-emerald-700">{total.linkedSlots} linked</span>
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

export default DashboardStats;
