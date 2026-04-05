/**
 * VehicleLinkSelector — Bottom sheet for linking allocation vehicles to orders
 *
 * Manager-only component. Shows allocation vehicles filtered by model match,
 * sorted by color preference compatibility. Uses vaul drawer for mobile-first UX.
 *
 * Usage:
 *   <VehicleLinkSelector
 *     order={order}
 *     vehicles={allocationVehicles}
 *     linkedVehicleIds={new Set(["RX350-001"])}
 *     onLink={(vehicleId, vehicleInfo) => ...}
 *     onUnlink={() => ...}
 *   />
 */

import React, { useMemo, useState } from "react";
import { Drawer } from "vaul";
import { Order } from "../types";
import { AllocationVehicle } from "../src/utils/allocationTypes";
import { matchExteriorColors } from "../src/utils/colorReference";

interface VehicleLinkSelectorProps {
  order: Order;
  vehicles: AllocationVehicle[];
  linkedVehicleIds: Set<string>;
  onLink: (vehicleId: string, vehicleInfo: string) => void;
  onUnlink: () => void;
}

function buildVehicleId(v: AllocationVehicle): string {
  return `${v.code}-${v.color}-${v.id}`;
}

function buildVehicleInfo(v: AllocationVehicle): string {
  const parts = [
    v.model || v.code,
    v.color,
    v.grade,
    v.arrival ? `Arriving ${v.arrival}` : null,
  ].filter(Boolean);
  return parts.join(" — ");
}

interface ScoredVehicle {
  vehicle: AllocationVehicle;
  vehicleId: string;
  vehicleInfo: string;
  score: number; // higher = better match
  matchReason: string;
  isLinked: boolean;
}

export default function VehicleLinkSelector({
  order,
  vehicles,
  linkedVehicleIds,
  onLink,
  onUnlink,
}: VehicleLinkSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const isLinked = Boolean(order.allocatedVehicleId);

  // Score and sort vehicles by match quality
  const scored = useMemo(() => {
    const orderModel = (order.model || "").toUpperCase().replace(/\s+/g, "");
    const orderColors = [
      order.exteriorColor1,
      order.exteriorColor2,
      order.exteriorColor3,
    ].filter(Boolean);

    return vehicles
      .map((v): ScoredVehicle => {
        const vehicleId = buildVehicleId(v);
        const vehicleInfo = buildVehicleInfo(v);
        const vCode = (v.code || "").toUpperCase().replace(/\s+/g, "");
        const vModel = (v.model || "").toUpperCase().replace(/\s+/g, "");
        const linked = linkedVehicleIds.has(vehicleId);

        let score = 0;
        let matchReason = "";

        // Model match
        if (vCode === orderModel || vModel.includes(orderModel) || orderModel.includes(vCode)) {
          score += 100;
          matchReason = "Model match";
        }

        // Color match using the existing color reference system
        if (orderColors.length > 0 && v.color) {
          for (let i = 0; i < orderColors.length; i++) {
            const colorMatch = matchExteriorColors(orderColors[i], v.color);
            if (colorMatch.isMatch) {
              score += (3 - i) * 20; // First choice = 60, second = 40, third = 20
              matchReason += (matchReason ? " + " : "") +
                `Color ${i + 1}${colorMatch.precision === "generic" ? " (close)" : ""}`;
              break;
            }
          }
        }

        return { vehicle: v, vehicleId, vehicleInfo, score, matchReason, isLinked: linked };
      })
      .sort((a, b) => {
        // Linked vehicles at bottom
        if (a.isLinked !== b.isLinked) return a.isLinked ? 1 : -1;
        // Then by score
        return b.score - a.score;
      });
  }, [vehicles, order, linkedVehicleIds]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return scored;
    const q = search.toLowerCase();
    return scored.filter(
      (s) =>
        s.vehicle.model?.toLowerCase().includes(q) ||
        s.vehicle.code?.toLowerCase().includes(q) ||
        s.vehicle.color?.toLowerCase().includes(q) ||
        s.vehicle.grade?.toLowerCase().includes(q),
    );
  }, [scored, search]);

  const bestMatches = filtered.filter((s) => s.score >= 100 && !s.isLinked);
  const otherMatches = filtered.filter((s) => s.score < 100 && !s.isLinked);
  const alreadyLinked = filtered.filter((s) => s.isLinked);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <button
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            isLinked
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "bg-sky-100 text-sky-700 hover:bg-sky-200"
          }`}
        >
          {isLinked ? (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="max-w-[140px] truncate sm:max-w-none">
                {order.allocatedVehicleInfo || "Linked"}
              </span>
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Link Vehicle
            </>
          )}
        </button>
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 mt-24 flex flex-col rounded-t-2xl bg-white">
          <div className="mx-auto mt-4 h-1.5 w-12 rounded-full bg-slate-300" />

          <div className="p-4 pb-2">
            <Drawer.Title className="text-lg font-semibold text-slate-800">
              {isLinked ? "Linked Vehicle" : "Link Allocation Vehicle"}
            </Drawer.Title>
            <p className="mt-1 text-sm text-slate-500">
              {order.customerName} — {order.year} {order.model}
            </p>
          </div>

          {/* Unlink button if already linked */}
          {isLinked && (
            <div className="px-4 pb-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-medium text-emerald-800">
                  {order.allocatedVehicleInfo}
                </p>
                <button
                  onClick={() => {
                    onUnlink();
                    setOpen(false);
                  }}
                  className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 transition-colors"
                >
                  Unlink Vehicle
                </button>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="px-4 pb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search model, color, grade..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 transition focus:ring"
            />
          </div>

          {/* Vehicle list */}
          <div className="max-h-[50vh] overflow-y-auto px-4 pb-6">
            {bestMatches.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  Best Matches
                </p>
                {bestMatches.map((s) => (
                  <VehicleRow
                    key={s.vehicleId}
                    scored={s}
                    onSelect={() => {
                      onLink(s.vehicleId, s.vehicleInfo);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            )}

            {otherMatches.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Other Vehicles
                </p>
                {otherMatches.map((s) => (
                  <VehicleRow
                    key={s.vehicleId}
                    scored={s}
                    onSelect={() => {
                      onLink(s.vehicleId, s.vehicleInfo);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            )}

            {alreadyLinked.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Already Linked
                </p>
                {alreadyLinked.map((s) => (
                  <VehicleRow key={s.vehicleId} scored={s} disabled />
                ))}
              </div>
            )}

            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">
                No matching vehicles found
              </p>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function VehicleRow({
  scored,
  onSelect,
  disabled,
}: {
  scored: ScoredVehicle;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  const v = scored.vehicle;
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`mb-1.5 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
        disabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50"
          : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50 active:bg-sky-100"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">
          {v.model || v.code}
          {v.grade ? ` ${v.grade}` : ""}
        </p>
        <p className="text-xs text-slate-500">
          {[v.color, v.interiorColor ? `Int: ${v.interiorColor}` : null, v.arrival ? `Arr: ${v.arrival}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {scored.matchReason && (
          <p className="mt-0.5 text-xs font-medium text-emerald-600">
            {scored.matchReason}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold text-slate-600">
          {v.quantity} unit{v.quantity !== 1 ? "s" : ""}
        </p>
        <p className="text-xs text-slate-400">
          BOS: {v.bos}
        </p>
      </div>
    </button>
  );
}
