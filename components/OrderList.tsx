import React, { useState, useMemo } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Order, OrderStatus, AppUser } from "../types";
import OrderCard from "./OrderCard";
import {
  ACTIVE_STATUS_OPTIONS,
  isSecuredStatus,
  isActiveStatus,
} from "../constants";
import { DownloadIcon } from "./icons/DownloadIcon";
import { OrderMatchSummary } from "../src/utils/orderMatchSummary";
import { AllocationVehicle } from "../src/utils/allocationTypes";
import { chipClasses } from "./ui/chipStyles";

interface OrderListProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onUpdateOrderDetails: (
    orderId: string,
    updates: Partial<Order>,
  ) => Promise<boolean>;
  onDeleteOrder: (orderId: string) => void;
  currentUser?: AppUser | null;
  variant?: "beta";
  highlightedOrderId?: string | null;
  orderMatchSummaries?: Map<string, OrderMatchSummary>;
  allocationVehicles?: AllocationVehicle[];
  linkedVehicleIds?: Set<string>;
}

const OrderList: React.FC<OrderListProps> = ({
  orders,
  onUpdateStatus,
  onUpdateOrderDetails,
  onDeleteOrder,
  currentUser,
  highlightedOrderId,
  orderMatchSummaries,
  allocationVehicles,
  linkedVehicleIds,
}) => {
  const [animateRef] = useAutoAnimate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"active" | "secured">("active");

  const filteredOrders = useMemo(() => {
    const lowercasedQuery = searchQuery.toLowerCase();
    return orders.filter((order) => {
      // Tab filter first - use isSecuredStatus to include legacy Received/Delivered
      const tabMatch =
        activeTab === "active"
          ? isActiveStatus(order.status)
          : isSecuredStatus(order.status);
      if (!tabMatch) return false;

      // Search filter
      const searchMatch =
        searchQuery === "" ||
        order.customerName.toLowerCase().includes(lowercasedQuery) ||
        (order.salesperson && order.salesperson.toLowerCase().includes(lowercasedQuery)) ||
        (order.model && order.model.toLowerCase().includes(lowercasedQuery)) ||
        (order.year && order.year.toLowerCase().includes(lowercasedQuery)) ||
        (order.modelNumber && order.modelNumber.toLowerCase().includes(lowercasedQuery)) ||
        (order.dealNumber && order.dealNumber.toLowerCase().includes(lowercasedQuery)) ||
        (order.stockNumber && order.stockNumber.toLowerCase().includes(lowercasedQuery)) ||
        (order.vin && order.vin.toLowerCase().includes(lowercasedQuery));
      if (!searchMatch) return false;

      // Status filter (only applies to active tab)
      if (activeTab === "active") {
        const statusMatch =
          statusFilter === "all" || order.status === statusFilter;
        if (!statusMatch) return false;
      }

      return true;
    });
  }, [orders, searchQuery, statusFilter, activeTab]);

  // Count active orders (not secured)
  const totalActiveOrders = useMemo(
    () => orders.filter((o) => isActiveStatus(o.status)).length,
    [orders],
  );
  // Count secured orders (includes legacy Received/Delivered)
  const totalSecuredOrders = useMemo(
    () => orders.filter((o) => isSecuredStatus(o.status)).length,
    [orders],
  );

  const handleExport = () => {
    if (filteredOrders.length === 0) {
      alert("No orders to export.");
      return;
    }

    const headers = [
      "ID",
      "Salesperson",
      "Manager",
      "Date",
      "Customer Name",
      "Deal #",
      "Stock #",
      "VIN",
      "Year",
      "Model",
      "Model #",
      "Exterior Color #1",
      "Exterior Color #2",
      "Exterior Color #3",
      "Interior Color #1",
      "Interior Color #2",
      "Interior Color #3",
      "MSRP",
      "Selling Price",
      "Gross",
      "Deposit Amount",
      "Status",
      "Options",
      "Notes",
    ];

    const escapeCsvCell = (
      cellData: string | number | null | undefined,
    ): string => {
      if (cellData === null || cellData === undefined) {
        return "";
      }
      const stringData = String(cellData);
      if (
        stringData.includes(",") ||
        stringData.includes('"') ||
        stringData.includes("\n")
      ) {
        return `"${stringData.replace(/"/g, '""')}"`;
      }
      return stringData;
    };

    const csvContent = [
      headers.join(","),
      ...filteredOrders.map((order) =>
        [
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
          order.exteriorColor1,
          order.exteriorColor2,
          order.exteriorColor3,
          order.interiorColor1,
          order.interiorColor2,
          order.interiorColor3,
          order.msrp,
          order.sellingPrice,
          order.gross,
          order.depositAmount,
          order.status,
          order.options,
          order.notes,
        ]
          .map(escapeCsvCell)
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      const today = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `pre-orders-export-${today}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white/95 p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-stone-500 mt-1">
            Showing {filteredOrders.length} of{" "}
            {activeTab === "active" ? totalActiveOrders : totalSecuredOrders}{" "}
            orders.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={filteredOrders.length === 0}
        >
          <DownloadIcon />
          Export Results
        </button>
      </div>

      <div className="mb-5 border-b border-stone-200">
        <div className="-mb-px flex flex-wrap gap-2" role="tablist" aria-label="Tabs">
          <button
            role="tab"
            aria-selected={activeTab === "active"}
            onClick={() => {
              setActiveTab("active");
              setStatusFilter("all");
            }}
            className={`whitespace-nowrap border-b-2 px-3 pb-3 text-sm font-semibold transition-colors ${
              activeTab === "active"
                ? "border-stone-950 text-stone-950"
                : "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300"
            }`}
          >
            Active Orders{" "}
            <span
              className={`ml-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${activeTab === "active" ? "bg-amber-100 text-stone-950" : "bg-stone-200 text-stone-700"}`}
            >
              {totalActiveOrders}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "secured"}
            onClick={() => setActiveTab("secured")}
            className={`whitespace-nowrap border-b-2 px-3 pb-3 text-sm font-semibold transition-colors ${
              activeTab === "secured"
                ? "border-stone-950 text-stone-950"
                : "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300"
            }`}
          >
            Secured History{" "}
            <span
              className={`ml-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${activeTab === "secured" ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"}`}
            >
              {totalSecuredOrders}
            </span>
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="searchQuery" className="sr-only">
          Search Orders
        </label>
        <div className="relative">
          <input
            type="text"
            id="searchQuery"
            placeholder="Search by Customer, Salesperson, Model, Deal #, Stock #, or VIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 pr-9 text-stone-900 shadow-sm outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {activeTab === "active" && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-semibold text-stone-600">
              Filter:
            </span>
            <button
              onClick={() => setStatusFilter("all")}
              className={chipClasses({ active: statusFilter === "all", tone: "brand" })}
            >
              All Active
            </button>
            {ACTIVE_STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={chipClasses({
                  active: statusFilter === status,
                  tone: status === OrderStatus.DealerExchange ? "warning" : "brand",
                })}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={animateRef} role="tabpanel" className="space-y-4">
        {filteredOrders.length > 0 ? (
          filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdateStatus={onUpdateStatus}
              onUpdateOrderDetails={onUpdateOrderDetails}
              onDeleteOrder={onDeleteOrder}
              currentUser={currentUser}
              highlighted={highlightedOrderId === order.id}
              matchSummary={orderMatchSummaries?.get(order.id)}
              allocationVehicles={allocationVehicles}
              linkedVehicleIds={linkedVehicleIds}
            />
          ))
        ) : (
          <div className="text-center py-16 px-6 border-2 border-dashed border-stone-200 rounded-lg">
            <svg
              className="mx-auto h-12 w-12 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-stone-900">
              {searchQuery
                ? "No matching orders"
                : activeTab === "active"
                  ? "No active orders"
                  : "No secured orders yet"}
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              {searchQuery
                ? `No results for "${searchQuery}". Try a different search term.`
                : activeTab === "active"
                  ? "Orders will appear here once created."
                  : "Completed orders will move here when marked as secured."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderList;
