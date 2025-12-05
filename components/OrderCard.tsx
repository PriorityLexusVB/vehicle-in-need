import React, { useState } from 'react';
import { Order, OrderStatus, AppUser } from '../types';
import { ACTIVE_STATUS_OPTIONS, isSecuredStatus } from '../constants';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import StatusBadge from './StatusBadge';
import { TrashIcon } from './icons/TrashIcon';
import { UndoIcon } from './icons/UndoIcon';
import { formatSalesperson, formatDeposit, formatExtColor, formatModelNumber } from '../src/utils/orderCardFormatters';

interface OrderCardProps {
  order: Order;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onDeleteOrder: (orderId: string) => void;
  currentUser?: AppUser | null;
}

const DetailItem: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div>
        <strong className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</strong>
        <span className="text-sm text-slate-800">{children || 'N/A'}</span>
    </div>
);

const OrderCard: React.FC<OrderCardProps> = ({ order, onUpdateStatus, onDeleteOrder, currentUser }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showUnsecureConfirm, setShowUnsecureConfirm] = useState(false);

  // Display color codes directly (no longer looking up from vehicleOptions)
  const exteriorColors = [
    order.exteriorColor1,
    order.exteriorColor2,
    order.exteriorColor3
  ].filter(Boolean);
  
  const interiorColors = [
    order.interiorColor1,
    order.interiorColor2,
    order.interiorColor3
  ].filter(Boolean);
  
  // Check if order is secured (includes legacy Received/Delivered states)
  const isSecured = isSecuredStatus(order.status);
  const isActive = !isSecured;

  // Format model number once for conditional rendering
  const modelNumberDisplay = formatModelNumber(order);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as OrderStatus;
    onUpdateStatus(order.id, newStatus);
  };

  /**
   * Handle the unsecure action with confirmation.
   * Only managers can unsecure orders.
   * 
   * Design Decision: When unsecuring, orders always return to 'Factory Order' status
   * because it's the default initial status for new orders. This provides a consistent
   * baseline from which managers can then manually set the appropriate status if needed.
   * Alternative approaches like remembering the previous status would add complexity
   * without clear benefit for the typical "accidental secure" use case.
   */
  const handleUnsecureConfirm = () => {
    // Transition from Secured/Delivered/Received to Factory Order (initial active status)
    onUpdateStatus(order.id, OrderStatus.FactoryOrder);
    setShowUnsecureConfirm(false);
  };

  return (
    <div className={`rounded-xl shadow-sm transition-all duration-300 ${isSecured ? 'bg-slate-100/70 border-slate-200' : 'bg-white border-slate-200 hover:shadow-md hover:border-slate-300'} border`}>
      <div 
        className="p-4 cursor-pointer" 
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <div className="flex justify-between items-start">
            <div>
            <h3 className={`text-lg font-bold ${isSecured ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                {order.customerName}
            </h3>
            <p className="text-sm text-slate-500 font-medium">
                {order.year} {order.model}
            </p>
            {/* Summary row for at-a-glance details */}
            <p 
              className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1"
              data-testid="order-card-summary-row"
            >
              <span data-testid="order-card-summary-salesperson">{formatSalesperson(order)}</span>
              <span aria-hidden="true">•</span>
              <span data-testid="order-card-summary-deposit">Deposit: {formatDeposit(order)}</span>
              <span aria-hidden="true">•</span>
              <span data-testid="order-card-summary-ext-color">{formatExtColor(order)}</span>
              {modelNumberDisplay && (
                <>
                  <span aria-hidden="true">•</span>
                  <span data-testid="order-card-summary-model">{modelNumberDisplay}</span>
                </>
              )}
            </p>
            <div className="mt-2">
                <StatusBadge status={order.status} />
            </div>
            </div>
            <div className="flex items-center space-x-3 text-right flex-shrink-0 ml-4">
                <span className="text-sm font-medium text-slate-500">{order.date}</span>
                <button className="text-slate-400 hover:text-sky-600" aria-label="Toggle order details">
                    <ChevronDownIcon className={`w-6 h-6 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
            </div>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="mt-2 pt-4 border-t border-slate-200">
            <div className="p-3 mb-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
                    {currentUser?.isManager && isActive ? (
                    <>
                        <label htmlFor={`status-select-${order.id}`} className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                           Change Status:
                        </label>
                        <select 
                          id={`status-select-${order.id}`} 
                          value={order.status} 
                          onChange={handleStatusChange}
                          className="p-1.5 border border-slate-300 rounded-md shadow-sm text-sm focus:ring-sky-500 focus:border-sky-500"
                        >
                          {ACTIVE_STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </>
                    ) : (isSecured ? (
                        <div className="text-sm font-medium text-green-700">Order Secured</div>
                    ) : (
                        <div className="text-sm font-medium text-slate-700">Status: {order.status}</div>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    {/* Single "Mark Secured" button replaces the two-step Received/Delivered flow */}
                    {currentUser?.isManager && isActive && (
                        <button 
                          onClick={() => onUpdateStatus(order.id, OrderStatus.Delivered)} 
                          className="flex items-center gap-1.5 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-3 rounded-lg shadow-sm transition-colors"
                        >
                           Mark Secured
                        </button>
                    )}
                    {/* "Mark as Unsecured" button for managers on secured orders - reverts to active status */}
                    {currentUser?.isManager && isSecured && (
                        <button 
                          onClick={() => setShowUnsecureConfirm(true)}
                          className="flex items-center gap-1.5 text-sm border-2 border-amber-500 text-amber-700 hover:bg-amber-50 font-semibold py-2 px-3 rounded-lg transition-colors"
                        >
                           <UndoIcon className="w-4 h-4" />
                           Mark as Unsecured
                        </button>
                    )}
                    {currentUser?.isManager && (
                        <button onClick={() => onDeleteOrder(order.id)} className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium py-2 px-3 rounded-lg hover:bg-red-50 transition-colors">
                            <TrashIcon className="w-4 h-4 text-red-500" />
                            Delete
                        </button>
                    )}
                </div>
                </div>
            </div>
          
            <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-5 text-sm">
                    <DetailItem label="Salesperson">{order.salesperson}</DetailItem>
                    <DetailItem label="Manager">{order.manager}</DetailItem>
                    <DetailItem label="Deposit">{typeof order.depositAmount === 'number' ? `$${order.depositAmount.toFixed(2)}` : 'N/A'}</DetailItem>
                    <DetailItem label="Deal #">{order.dealNumber}</DetailItem>
                    <DetailItem label="Stock #">{order.stockNumber}</DetailItem>
                    <DetailItem label="VIN (Last 8)">{order.vin}</DetailItem>
                    <DetailItem label="Model #">{order.modelNumber}</DetailItem>
                    <DetailItem label="Ext. Color #1">{order.exteriorColor1}</DetailItem>
                    <DetailItem label="Int. Color #1">{order.interiorColor1}</DetailItem>
                    <DetailItem label="MSRP">{typeof order.msrp === 'number' ? `$${order.msrp.toFixed(2)}` : 'N/A'}</DetailItem>
                    <DetailItem label="Selling Price">{order.sellingPrice ? `$${order.sellingPrice.toFixed(2)}` : 'N/A'}</DetailItem>
                    <DetailItem label="Gross">{order.gross ? `$${order.gross.toFixed(2)}` : 'N/A'}</DetailItem>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(exteriorColors.length > 1 || interiorColors.length > 1) ? (
                        <>
                         {exteriorColors.length > 1 && <DetailItem label="Additional Ext. Color #'s">{exteriorColors.slice(1).join(', ')}</DetailItem>}
                         {interiorColors.length > 1 && <DetailItem label="Additional Int. Color #'s">{interiorColors.slice(1).join(', ')}</DetailItem>}
                        </>
                    ) : null}
                </div>

                {(order.options || order.notes) && (
                    <div className="space-y-4">
                        {order.options && (
                            <div className="bg-slate-50 p-3 rounded-lg border">
                            <strong className="block text-slate-500 text-sm font-semibold mb-1">Options</strong>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{order.options}</p>
                            </div>
                        )}
                        {order.notes && (
                            <div className="bg-slate-50 p-3 rounded-lg border">
                            <strong className="block text-slate-500 text-sm font-semibold mb-1">Internal Notes</strong>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{order.notes}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
          </div>
        </div>
      )}
      {/* Confirmation dialog for unsecure action */}
      {showUnsecureConfirm && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsecure-dialog-title"
        >
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md mx-4">
            <h3 id="unsecure-dialog-title" className="text-lg font-bold text-slate-800 mb-3">
              Confirm Unsecure Action
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to mark this order as unsecured?
            </p>
            <ul className="text-sm text-slate-600 mb-4 list-disc list-inside space-y-1">
              <li>The order will move back to <strong>Active Orders</strong></li>
              <li>Status will change to <strong>Factory Order</strong></li>
              <li>Dashboard metrics will update accordingly</li>
            </ul>
            <p className="text-xs text-amber-600 font-medium mb-4">
              This action is typically used when an order was marked as secured by mistake.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowUnsecureConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUnsecureConfirm}
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
              >
                Yes, Mark as Unsecured
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default OrderCard;
