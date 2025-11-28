
import React from 'react';
import { OrderStatus } from '../types';
import { STATUS_COLORS, normalizeStatusForUI } from '../constants';

interface StatusBadgeProps {
  status: OrderStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  // Normalize status for UI display (maps Received/Delivered to Secured)
  const displayStatus = normalizeStatusForUI(status);
  const colorClasses = STATUS_COLORS[displayStatus] || 'bg-slate-100 text-slate-800 border-slate-300';

  return (
    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${colorClasses}`}>
      {displayStatus}
    </span>
  );
};

export default StatusBadge;
