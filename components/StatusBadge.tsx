
import React from 'react';
import { OrderStatus } from '../types';
import { normalizeStatusForUI } from '../constants';
import { chipClasses, type ChipTone } from './ui/chipStyles';

interface StatusBadgeProps {
  status: OrderStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  // Normalize status for UI display (maps Received/Delivered to Secured)
  const displayStatus = normalizeStatusForUI(status);
  const toneByStatus: Partial<Record<OrderStatus, ChipTone>> = {
    [OrderStatus.FactoryOrder]: "brand",
    [OrderStatus.Locate]: "warning",
    [OrderStatus.DealerExchange]: "warning",
    [OrderStatus.Received]: "success",
    [OrderStatus.Delivered]: "success",
    [OrderStatus.Secured]: "success",
  };

  return (
    <span className={chipClasses({ tone: toneByStatus[displayStatus] ?? "neutral" })}>
      {displayStatus}
    </span>
  );
};

export default StatusBadge;
