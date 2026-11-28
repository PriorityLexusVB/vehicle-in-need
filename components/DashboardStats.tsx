import React from 'react';
import type { CarStatusSummary } from '../src/utils/carStatus';
import { LONG_WAIT_DAYS } from '../src/utils/carStatus';

/*
 * Manager Dashboard headline: "Did we get the car?" (Rob, 2026-11-27/28).
 * Every active order is in exactly one bucket (see src/utils/carStatus.ts), so
 * the three numbers always add up to the active count and never repeat it.
 * The per-model received/linked strip lives on the Allocation Board.
 */

interface CellProps {
  label: string;
  value: number;
  valueClass: string;
  hint: React.ReactNode;
  testId: string;
}

const Cell: React.FC<CellProps> = ({ label, value, valueClass, hint, testId }) => (
  <div className="min-w-0 px-4 py-4 sm:px-6 sm:py-5" data-testid={testId}>
    <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.16em] text-stone-500 sm:text-[11px]">{label}</p>
    <p className={`mt-2 text-4xl font-black leading-none tracking-tight tabular-nums sm:text-6xl ${valueClass}`}>{value}</p>
    <p className="mt-2 text-xs leading-snug text-stone-500 sm:text-sm">{hint}</p>
  </div>
);

interface DashboardStatsProps {
  summary: CarStatusSummary;
  securedLast30Days: number;
}

const DashboardStats: React.FC<DashboardStatsProps> = ({ summary, securedLast30Days }) => {
  const { active, got, exchange, waiting, waitingLong } = summary;
  const pct = (n: number) => (active > 0 ? `${(n / active) * 100}%` : '0%');

  return (
    <section className="mb-6" aria-labelledby="dashboard-car-status-title" data-testid="dashboard-car-status">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="dashboard-car-status-title" className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">
          Did we get the car?
        </h2>
        <p className="text-xs tabular-nums text-stone-500 sm:text-sm">
          <span className="font-semibold text-stone-900">{active}</span> active orders ·{' '}
          <span className="font-semibold text-stone-900">{securedLast30Days}</span> delivered in the last 30 days
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-stone-950/5">
        {/* Share of active orders in each bucket: deeper green = closer to delivery. */}
        <div className="flex h-1.5 w-full bg-stone-100" aria-hidden="true" data-testid="dashboard-car-status-bar">
          <span className="h-full bg-emerald-600" style={{ width: pct(got) }} />
          <span className="h-full bg-emerald-300" style={{ width: pct(exchange) }} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-stone-100">
          <Cell
            testId="dashboard-got-car"
            label="Got the car"
            value={got}
            valueClass="text-emerald-700"
            hint="Car linked to the order"
          />
          <Cell
            testId="dashboard-exchange"
            label="Dealer exchange"
            value={exchange}
            valueClass="text-stone-950"
            hint="Sourcing from another dealer"
          />
          <Cell
            testId="dashboard-waiting"
            label="Still waiting"
            value={waiting}
            valueClass="text-stone-950"
            hint={
              waitingLong > 0 ? (
                <span className="font-bold text-amber-700">{waitingLong} over {LONG_WAIT_DAYS} days</span>
              ) : (
                <>None over {LONG_WAIT_DAYS} days</>
              )
            }
          />
        </div>
      </div>
    </section>
  );
};

export default DashboardStats;
