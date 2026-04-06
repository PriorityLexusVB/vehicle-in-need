/**
 * MatchPreviewModal — Quick preview of matching allocation vehicles and DX trades
 * for a given order. Opens from the dashboard badge click without navigating away.
 */

import React from "react";
import { Link } from "react-router-dom";
import { Order } from "../types";
import { OrderMatchSummary } from "../src/utils/orderMatchSummary";

interface MatchPreviewModalProps {
  order: Order;
  matchSummary: OrderMatchSummary;
  onClose: () => void;
}

const MatchPreviewModal: React.FC<MatchPreviewModalProps> = ({
  order,
  matchSummary,
  onClose,
}) => {
  const allocModel = matchSummary.matchedAllocModels.values().next().value ?? order.model;
  const hasAllocMatches = matchSummary.exactCount > 0 || matchSummary.partialCount > 0;
  const hasDxMatches = matchSummary.dxExactCount > 0 || matchSummary.dxPartialCount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stopPropagation prevents backdrop close when clicking dialog content */}
      <div
        role="dialog"
        aria-label={`Match preview for ${order.customerName}`}
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              {order.year} {order.model}
            </h3>
            <p className="text-sm text-stone-500">{order.customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
            aria-label="Close preview"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Customer preferences */}
        <div className="border-b border-stone-100 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">Customer Preferences</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {order.modelNumber && (
              <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-700">
                Model #: {order.modelNumber}
              </span>
            )}
            <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-700">
              Ext: {order.exteriorColor1}
              {order.exteriorColor2 ? `, ${order.exteriorColor2}` : ""}
              {order.exteriorColor3 ? `, ${order.exteriorColor3}` : ""}
            </span>
            <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-700">
              Int: {order.interiorColor1}
              {order.interiorColor2 ? `, ${order.interiorColor2}` : ""}
              {order.interiorColor3 ? `, ${order.interiorColor3}` : ""}
            </span>
          </div>
        </div>

        {/* Match summary */}
        <div className="px-5 py-4 space-y-4 max-h-[50vh] overflow-y-auto">
          {hasAllocMatches && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Allocation Matches</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  {matchSummary.exactCount + matchSummary.partialCount}
                </span>
              </div>
              <div className="space-y-1 text-sm text-stone-600">
                {matchSummary.exactCount > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    {matchSummary.exactCount} exact
                  </p>
                )}
                {matchSummary.partialCount > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
                    {matchSummary.partialCount} close
                  </p>
                )}
                {matchSummary.modelOnlyCount > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-stone-300" />
                    {matchSummary.modelOnlyCount} model only
                  </p>
                )}
              </div>
              <Link
                to={`/allocation?model=${encodeURIComponent(allocModel)}&view=matches`}
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                View on Allocation Board
              </Link>
            </div>
          )}

          {hasDxMatches && (
            <div className={hasAllocMatches ? "border-t border-stone-100 pt-4" : ""}>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Dealer Exchange Matches</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                  {matchSummary.dxExactCount + matchSummary.dxPartialCount}
                </span>
              </div>
              <div className="space-y-1 text-sm text-stone-600">
                {matchSummary.dxExactCount > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                    {matchSummary.dxExactCount} exact
                  </p>
                )}
                {matchSummary.dxPartialCount > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-300" />
                    {matchSummary.dxPartialCount} close
                  </p>
                )}
              </div>
              <Link
                to={`/allocation?view=log&scrollTo=dx-pipeline&dxModel=${encodeURIComponent(order.model)}`}
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                View DX Pipeline
              </Link>
            </div>
          )}

          {!hasAllocMatches && !hasDxMatches && (
            <p className="py-4 text-center text-sm text-stone-400">No color matches found for this order.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MatchPreviewModal;
