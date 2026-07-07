import React from 'react';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { ClockIcon } from './icons/ClockIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';

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
}

const DashboardStats: React.FC<DashboardStatsProps> = ({
    totalActive,
    awaitingAction,
    securedLast30Days
}) => {
    return (
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
    )
}

export default DashboardStats;
