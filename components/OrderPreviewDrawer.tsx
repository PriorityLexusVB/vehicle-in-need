import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { Order, OrderStatus } from "../types";

/**
 * OrderPreviewDrawer — K3 side-panel order preview.
 *
 * Replaces the old "View ↗" new-tab navigation (`/#/?highlight=<id>`) with an
 * in-place right-side drawer so a manager can inspect a matched order's full
 * detail WITHOUT leaving the allocation board. Controlled (no Drawer.Trigger):
 * the board owns `previewOrderId` state and opens the drawer by setting it.
 *
 * vaul `direction="right"` = true side panel on desktop; on mobile the content
 * is full-width so it reads as a near-full-screen slide-in. Pattern mirrors the
 * existing bottom-sheet usage in VehicleLinkSelector.tsx (same vaul dep, already
 * bundled).
 */

const STATUS_STYLES: Record<string, string> = {
  [OrderStatus.FactoryOrder]: "bg-indigo-100 text-indigo-700",
  [OrderStatus.DealerExchange]: "bg-amber-100 text-amber-700",
  [OrderStatus.Received]: "bg-emerald-100 text-emerald-700",
  [OrderStatus.Delivered]: "bg-emerald-100 text-emerald-700",
  [OrderStatus.Secured]: "bg-emerald-100 text-emerald-700",
  [OrderStatus.Locate]: "bg-stone-100 text-stone-600",
};

function formatCurrency(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function joinColors(...parts: (string | undefined)[]): string {
  const filled = parts.map((p) => p?.trim()).filter(Boolean);
  return filled.length > 0 ? filled.join(" / ") : "—";
}

interface DetailRowProps {
  label: string;
  value: ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</span>
      <span className="text-right text-sm font-medium text-stone-800">{value}</span>
    </div>
  );
}

export interface OrderPreviewDrawerProps {
  /** The order to preview, or null when closed. The board resolves this from activeOrders. */
  order: Order | null;
  /** Called when the drawer requests close (overlay click / Esc / drag-dismiss). */
  onClose: () => void;
}

export default function OrderPreviewDrawer({ order, onClose }: OrderPreviewDrawerProps) {
  const open = order !== null;

  return (
    <Drawer.Root
      direction="right"
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col bg-white shadow-xl outline-none sm:max-w-md sm:rounded-l-2xl"
          aria-describedby={undefined}
        >
          {order && (
            <>
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-stone-100 p-4">
                <div className="min-w-0">
                  <Drawer.Title className="truncate text-lg font-semibold text-stone-900">
                    {order.customerName}
                  </Drawer.Title>
                  <p className="mt-0.5 text-sm text-stone-500">
                    {order.year} {order.model}
                    {order.modelNumber ? ` · ${order.modelNumber}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      STATUS_STYLES[order.status] ?? "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {order.status}
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close order preview"
                    className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Scroll body */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Deal facts */}
                <section className="rounded-xl border border-stone-100 px-3 py-1">
                  <DetailRow label="Salesperson" value={order.salesperson || "TBD"} />
                  <DetailRow label="Manager" value={order.manager || "—"} />
                  <DetailRow label="Order Date" value={order.date?.trim() || "—"} />
                  <DetailRow label="Deal #" value={order.dealNumber || "—"} />
                  {order.stockNumber?.trim() && <DetailRow label="Stock #" value={order.stockNumber} />}
                  {order.vin?.trim() && <DetailRow label="VIN" value={<span className="font-mono text-xs">{order.vin}</span>} />}
                </section>

                {/* Colors */}
                <section className="mt-3 rounded-xl border border-stone-100 px-3 py-1">
                  <DetailRow label="Exterior" value={joinColors(order.exteriorColor1, order.exteriorColor2, order.exteriorColor3)} />
                  <DetailRow label="Interior" value={joinColors(order.interiorColor1, order.interiorColor2, order.interiorColor3)} />
                </section>

                {/* Pricing */}
                <section className="mt-3 rounded-xl border border-stone-100 px-3 py-1">
                  <DetailRow label="MSRP" value={formatCurrency(order.msrp)} />
                  {order.sellingPrice != null && <DetailRow label="Selling Price" value={formatCurrency(order.sellingPrice)} />}
                  {order.gross != null && <DetailRow label="Gross" value={formatCurrency(order.gross)} />}
                  <DetailRow label="Deposit" value={formatCurrency(order.depositAmount)} />
                </section>

                {/* Options */}
                {order.options?.trim() && (
                  <section className="mt-3 rounded-xl border border-stone-100 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Options</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{order.options}</p>
                  </section>
                )}

                {/* Linked allocation vehicle */}
                {order.allocatedVehicleInfo?.trim() && (
                  <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Linked Vehicle</p>
                    <p className="mt-1 text-sm font-medium text-emerald-900">{order.allocatedVehicleInfo}</p>
                  </section>
                )}

                {/* Notes */}
                {(order.latestNoteText?.trim() || order.notes?.trim()) && (
                  <section className="mt-3 rounded-xl border border-stone-100 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Notes</p>
                    {order.latestNoteText?.trim() && (
                      <div className="mt-1.5">
                        <p className="whitespace-pre-wrap text-sm text-stone-700">{order.latestNoteText}</p>
                        {order.latestNoteByName?.trim() && (
                          <p className="mt-0.5 text-xs text-stone-400">— {order.latestNoteByName}</p>
                        )}
                      </div>
                    )}
                    {order.notes?.trim() && order.notes.trim() !== order.latestNoteText?.trim() && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{order.notes}</p>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
