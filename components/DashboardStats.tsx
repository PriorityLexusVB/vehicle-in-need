import React from 'react';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { ClockIcon } from './icons/ClockIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => (
  <div className={`bg-white p-5 rounded-xl shadow-md border border-slate-200 flex items-center gap-4`}>
    <div className={`p-3 rounded-full ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-3xl font-bold text-slate-800">{value}</p>
      <p className="text-sm font-medium text-slate-500">{title}</p>
    </div>
  </div>
);


interface DashboardStatsProps {
    totalActive: number;
    awaitingAction: number;
    readyForDelivery: number;
    securedLast30Days: number;
}

const DashboardStats: React.FC<DashboardStatsProps> = ({
    totalActive,
    awaitingAction,
    readyForDelivery,
    securedLast30Days
}) => {
    return (
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
                title="Total Active Orders" 
                value={totalActive}
                icon={<BriefcaseIcon className="w-6 h-6 text-sky-700" />}
                color="bg-sky-100"
            />
            <StatCard 
                title="Awaiting Action" 
                value={awaitingAction}
                icon={<ClockIcon className="w-6 h-6 text-amber-700" />}
                color="bg-amber-100"
            />
            <StatCard 
                title="Ready for Delivery" 
                value={readyForDelivery}
                icon={<CheckCircleIcon className="w-6 h-6 text-green-700" />}
                color="bg-green-100"
            />
             <StatCard 
                title="Secured (Last 30d)" 
                value={securedLast30Days}
                icon={<DocumentTextIcon className="w-6 h-6 text-purple-700" />}
                color="bg-purple-100"
            />
        </div>
    )
}

export default DashboardStats;
