
import React, { useState, useMemo } from 'react';
import { Order, OrderStatus, AppUser, VehicleOption } from '../types';
import OrderCard from './OrderCard';
import { STATUS_OPTIONS } from '../constants';
import { DownloadIcon } from './icons/DownloadIcon';

interface OrderListProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onDeleteOrder: (orderId: string) => void;
  currentUser?: AppUser | null;
  vehicleOptions?: VehicleOption[];
}

const OrderList: React.FC<OrderListProps> = ({ orders, onUpdateStatus, onDeleteOrder, currentUser, vehicleOptions = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'active' | 'delivered'>('active');

  const filteredOrders = useMemo(() => {
    const lowercasedQuery = searchQuery.toLowerCase();
    return orders.filter(order => {
      // Tab filter first
      const tabMatch = activeTab === 'active'
        ? order.status !== OrderStatus.Delivered
        : order.status === OrderStatus.Delivered;
      if (!tabMatch) return false;

      // Search filter
      const searchMatch = searchQuery === '' ||
        order.customerName.toLowerCase().includes(lowercasedQuery) ||
        (order.dealNumber && order.dealNumber.toLowerCase().includes(lowercasedQuery)) ||
        (order.stockNumber && order.stockNumber.toLowerCase().includes(lowercasedQuery)) ||
        (order.vin && order.vin.toLowerCase().includes(lowercasedQuery));
      if (!searchMatch) return false;

      // Status filter (only applies to active tab)
      if (activeTab === 'active') {
        const statusMatch = statusFilter === 'all' || order.status === statusFilter;
        if (!statusMatch) return false;
      }
      
      return true;
    });
  }, [orders, searchQuery, statusFilter, activeTab]);
  
  const totalActiveOrders = useMemo(() => orders.filter(o => o.status !== OrderStatus.Delivered).length, [orders]);
  const totalDeliveredOrders = useMemo(() => orders.filter(o => o.status === OrderStatus.Delivered).length, [orders]);

  const handleExport = () => {
    if (filteredOrders.length === 0) {
      alert("No orders to export.");
      return;
    }

    const headers = [
      'ID', 'Salesperson', 'Manager', 'Date', 'Customer Name', 'Deal #', 'Stock #', 'VIN',
      'Year', 'Model', 'Model #', 'Exterior Color #', 'Interior Color #',
      'Ext. Option 1 #', 'Ext. Option 2 #',
      'Int. Option 1 #', 'Int. Option 2 #',
      'MSRP', 'Selling Price', 'Gross',
      'Deposit Amount', 'Status', 'Options', 'Notes'
    ];

    const escapeCsvCell = (cellData: string | number | null | undefined): string => {
      if (cellData === null || cellData === undefined) {
        return '';
      }
      const stringData = String(cellData);
      if (stringData.includes(',') || stringData.includes('"') || stringData.includes('\n')) {
        return `"${stringData.replace(/"/g, '""')}"`;
      }
      return stringData;
    };

    const csvContent = [
      headers.join(','),
      ...filteredOrders.map(order => [
        order.id,
        order.salesperson,
        order.manager,
        order.date,
        order.customerName,
        order.dealNumber,
        order.stockNumber,
        order.vin,
        order.year,
        order.model,
        order.modelNumber,
        order.color,
        order.interiorColor,
        order.extOption1,
        order.extOption2,
        order.intOption1,
        order.intOption2,
        order.msrp,
        order.sellingPrice,
        order.gross,
        order.depositAmount,
        order.status,
        order.options,
        order.notes,
      ].map(escapeCsvCell).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      const today = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `pre-orders-export-${today}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };
  
  const activeStatusOptions = STATUS_OPTIONS.filter(s => s !== OrderStatus.Delivered && s !== OrderStatus.Received);

  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
            <p className="text-sm text-slate-500 mt-1">Showing {filteredOrders.length} of {activeTab === 'active' ? totalActiveOrders : totalDeliveredOrders} orders.</p>
        </div>
        <button
            onClick={handleExport}
            className="mt-4 sm:mt-0 flex-shrink-0 flex items-center justify-center gap-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors duration-200 disabled:bg-slate-300 disabled:cursor-not-allowed"
            disabled={filteredOrders.length === 0}
        >
            <DownloadIcon />
            Export Results
        </button>
      </div>
      
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          <button
            onClick={() => {
              setActiveTab('active');
              setStatusFilter('all');
            }}
            className={`whitespace-nowrap pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${
              activeTab === 'active'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Active Orders <span className={`ml-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${activeTab === 'active' ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'}`}>{totalActiveOrders}</span>
          </button>
          <button
            onClick={() => setActiveTab('delivered')}
            className={`whitespace-nowrap pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${
              activeTab === 'delivered'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Delivered History <span className={`ml-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${activeTab === 'delivered' ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'}`}>{totalDeliveredOrders}</span>
          </button>
        </nav>
      </div>
      
       <div className="mb-4">
            <label htmlFor="searchQuery" className="sr-only">Search Orders</label>
            <input 
                type="text" 
                id="searchQuery" 
                placeholder="Search by Customer, Deal #, Stock #, or VIN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="block w-full p-2.5 border border-slate-300 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
            />
      </div>

      {activeTab === 'active' && (
        <div className="mb-6">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-600 mr-2">Filter:</span>
                <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 text-xs rounded-full border-2 font-semibold ${statusFilter === 'all' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                >
                    All Active
                </button>
                {activeStatusOptions.map(status => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-3 py-1.5 text-xs rounded-full border-2 font-semibold ${statusFilter === status ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                    >
                        {status}
                    </button>
                ))}
            </div>
        </div>
      )}

      <div className="space-y-4">
        {filteredOrders.length > 0 ? (
          filteredOrders.map(order => (
            <OrderCard 
              key={order.id} 
              order={order} 
              onUpdateStatus={onUpdateStatus}
              onDeleteOrder={onDeleteOrder}
              currentUser={currentUser}
              vehicleOptions={vehicleOptions}
            />
          ))
        ) : (
          <div className="text-center py-16 px-6 border-2 border-dashed border-slate-200 rounded-lg">
            <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-slate-900">No Orders Found</h3>
            <p className="mt-1 text-sm text-slate-500">
              {activeTab === 'active' 
                ? 'No active orders match your current search and filters.' 
                : 'There are no delivered orders to display.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};


export default OrderList;
