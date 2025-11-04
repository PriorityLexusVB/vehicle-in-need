
import React from 'react';
import { OrderStatus } from '../types';
import { STATUS_COLORS } from '../constants';

interface StatusBadgeProps {
  status: OrderStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const colorClasses = STATUS_COLORS[status] || 'bg-slate-100 text-slate-800 border-slate-300';

  return (
    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${colorClasses}`}>
      {status}
    </span>
  );
};

export default StatusBadge;
