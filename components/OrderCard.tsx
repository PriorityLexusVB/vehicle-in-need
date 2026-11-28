import React, { useEffect, useRef, useState } from "react";
import { Order, OrderStatus, AppUser } from "../types";
import MatchPreviewModal from "./MatchPreviewModal";
import { ACTIVE_STATUS_OPTIONS, isActiveStatus, isSecuredStatus, isAllocationLinkable } from "../constants";
import { ChevronDownIcon } from "./icons/ChevronDownIcon";
import { CheckCircleIcon } from "./icons/CheckCircleIcon";
import { carStatusOf, daysSinceOrder, hasUnconfirmedLink, LONG_WAIT_DAYS } from "../src/utils/carStatus";
import StatusBadge from "./StatusBadge";
import { TrashIcon } from "./icons/TrashIcon";
import { UndoIcon } from "./icons/UndoIcon";
import {
  formatSalesperson,
  formatDeposit,
  formatExtColor,
  formatModelNumber,
} from "../src/utils/orderCardFormatters";
import OrderNotes from "./OrderNotes";
import { linkVehicleToOrder, unlinkVehicleFromOrder } from "../services/orderLinkingService";
import { OrderMatchSummary } from "../src/utils/orderMatchSummary";
import VehicleLinkSelector from "./VehicleLinkSelector";
import { AllocationVehicle } from "../src/utils/allocationTypes";
import {
  fourDigitModelNumber,
  type LatestModelNumberTotals,
} from "../src/utils/allocationModelNumberTotals";
import { MODEL_CODE_TO_ALLOCATION } from "../src/utils/allocationReference";
import { ORDER_ROW_GRID_XL } from "./orderRowGrid";
import PaintSwatch from "./PaintSwatch";

/**
 * Presentation only. Stored model text is sometimes just a model code
 * ("9025a", "9026"). Resolve it to a friendly name ("ES 350h") using the
 * Lexus model code reference; names pass through unchanged.
 */
const MODEL_CODE_TEXT = /^(\d{4})[a-z]?$/i;
const friendlyAllocationName = (allocationCode: string): string => {
  const match = /^([A-Z]+)(\d+)(.*)$/.exec(allocationCode);
  return match ? `${match[1]} ${match[2]}${match[3].toLowerCase()}` : allocationCode;
};
const resolveVehicleName = (
  model: string | undefined,
): { name: string; code: string | null; shown: string | null } => {
  const text = (model ?? "").trim();
  const codeMatch = MODEL_CODE_TEXT.exec(text);
  if (!codeMatch) return { name: text, code: null, shown: null };
  const code = codeMatch[1];
  const allocation = MODEL_CODE_TO_ALLOCATION[code];
  return allocation
    // `shown` keeps the code exactly as stored ("9025a"); `code` is the 4-digit key.
    ? { name: friendlyAllocationName(allocation), code, shown: text }
    : { name: text, code: null, shown: null };
};

const formatDaysWaiting = (days: number): string =>
  days === 0 ? "ordered today" : days === 1 ? "1 day ago" : `${days} days ago`;

interface OrderCardProps {
  order: Order;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onUpdateOrderDetails: (
    orderId: string,
    updates: Partial<Order>,
  ) => Promise<boolean>;
  onDeleteOrder: (orderId: string) => void;
  currentUser?: AppUser | null;
  highlighted?: boolean;
  matchSummary?: OrderMatchSummary;
  allocationVehicles?: AllocationVehicle[];
  linkedVehicleIds?: Set<string>;
  /** vehicle_links-confirmed ids; null/undefined while links load or fail (then the order's own link is trusted). */
  confirmedLinkIds?: ReadonlySet<string> | null;
  latestModelNumberTotals?: LatestModelNumberTotals | null;
  allocationSnapshotStatus?: "loading" | "ready" | "missing" | "error";
  allocationClaimsStatus?: "loading" | "ready" | "error";
}

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div>
    <strong className="block text-xs font-semibold text-stone-500 uppercase tracking-wider">
      {label}
    </strong>
    <span className="text-sm text-stone-800">{children || "N/A"}</span>
  </div>
);

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  onUpdateStatus,
  onUpdateOrderDetails,
  onDeleteOrder,
  currentUser,
  highlighted,
  matchSummary,
  allocationVehicles,
  linkedVehicleIds,
  confirmedLinkIds,
  latestModelNumberTotals,
  allocationSnapshotStatus,
  allocationClaimsStatus,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showUnsecureConfirm, setShowUnsecureConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted && cardRef.current) {
      setIsExpanded(true);
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      cardRef.current.classList.add("ring-2", "ring-stone-400");
      const timer = setTimeout(() => {
        cardRef.current?.classList.remove("ring-2", "ring-stone-400");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlighted]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [showMatchPreview, setShowMatchPreview] = useState(false);

  const handleUnlinkVehicle = async () => {
    setIsUnlinking(true);
    try {
      await unlinkVehicleFromOrder(order.id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to unlink vehicle";
      console.error("Unlink failed:", msg);
      alert(msg);
    } finally {
      setIsUnlinking(false);
    }
  };

  const handleLinkVehicle = async (vehicleId: string, vehicleInfo: string) => {
    if (!currentUser?.uid) return;
    try {
      await linkVehicleToOrder(order.id, vehicleId, vehicleInfo, currentUser.uid);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to link vehicle";
      console.error("Link failed:", msg);
      alert(msg);
    }
  };

  type EditFormState = {
    salesperson: string;
    manager: string;
    date: string;
    customerName: string;
    stockNumber: string;
    dealNumber: string;
    vin: string;
    year: string;
    model: string;
    modelNumber: string;
    exteriorColor1: string;
    exteriorColor2: string;
    exteriorColor3: string;
    interiorColor1: string;
    interiorColor2: string;
    interiorColor3: string;
    msrp: string;
    sellingPrice: string;
    gross: string;
    depositAmount: string;
    options: string;
    notes: string;
  };

  const toEditFormState = (o: Order): EditFormState => ({
    salesperson: o.salesperson ?? "",
    manager: o.manager ?? "",
    date: o.date ?? "",
    customerName: o.customerName ?? "",
    stockNumber: o.stockNumber ?? "",
    dealNumber: o.dealNumber ?? "",
    vin: o.vin ?? "",
    year: o.year ?? "",
    model: o.model ?? "",
    modelNumber: o.modelNumber ?? "",
    exteriorColor1: o.exteriorColor1 ?? "",
    exteriorColor2: o.exteriorColor2 ?? "",
    exteriorColor3: o.exteriorColor3 ?? "",
    interiorColor1: o.interiorColor1 ?? "",
    interiorColor2: o.interiorColor2 ?? "",
    interiorColor3: o.interiorColor3 ?? "",
    msrp: typeof o.msrp === "number" ? String(o.msrp) : "",
    sellingPrice:
      typeof o.sellingPrice === "number" ? String(o.sellingPrice) : "",
    gross: typeof o.gross === "number" ? String(o.gross) : "",
    depositAmount:
      typeof o.depositAmount === "number" ? String(o.depositAmount) : "",
    options: o.options ?? "",
    notes: o.notes ?? "",
  });

  const [editState, setEditState] = useState<EditFormState>(() =>
    toEditFormState(order),
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof EditFormState, string>>
  >({});

  // Display color codes directly (no longer looking up from vehicleOptions)
  const exteriorColors = [
    order.exteriorColor1,
    order.exteriorColor2,
    order.exteriorColor3,
  ].filter(Boolean);

  const interiorColors = [
    order.interiorColor1,
    order.interiorColor2,
    order.interiorColor3,
  ].filter(Boolean);

  // Check if order is secured (includes legacy Received/Delivered states)
  const isSecured = isSecuredStatus(order.status);
  const isActive = !isSecured;
  const carStatus = carStatusOf(order, confirmedLinkIds);
  const unconfirmedLink = hasUnconfirmedLink(order, confirmedLinkIds);

  // Format model number once for conditional rendering
  const modelNumberDisplay = formatModelNumber(order);
  const exactModelNumber = fourDigitModelNumber(order.modelNumber);
  const exactModelTotal = exactModelNumber
    ? latestModelNumberTotals?.byModelNumber.get(exactModelNumber)
    : undefined;
  const previewNote = order.latestNoteText?.trim() || order.notes?.trim();
  const vehicleLabel = resolveVehicleName(order.model);
  // Hide the separate "Model: 9025" line when the headline already carries that code.
  const modelLineRepeatsCode =
    vehicleLabel.code !== null &&
    (!order.modelNumber || fourDigitModelNumber(order.modelNumber) === vehicleLabel.code);
  const reportDateNode = (date: string) => (
    <span className="whitespace-nowrap tabular-nums">report {date}</span>
  );
  let allocationFact: React.ReactNode = "Latest allocation · count unavailable";
  if (allocationSnapshotStatus === "loading") {
    allocationFact = "Latest allocation · checking report";
  } else if (allocationSnapshotStatus === "error") {
    allocationFact = "Latest allocation · unavailable (load failed)";
  } else if (allocationClaimsStatus === "loading") {
    allocationFact = "Latest allocation · checking assignments";
  } else if (allocationClaimsStatus === "error") {
    allocationFact = "Latest allocation · assignment count unavailable";
  } else if (latestModelNumberTotals && !exactModelNumber) {
    allocationFact = "Latest allocation · model # unknown";
  } else if (latestModelNumberTotals && exactModelNumber && exactModelTotal) {
    allocationFact = (
      <>
        <span className="block">Latest allocation<span className="sr-only"> · </span></span>
        <span className="block whitespace-nowrap text-sm font-semibold tabular-nums text-graphite">{exactModelTotal.unassignedSlots} unassigned of {exactModelTotal.totalSlots}</span>
        <span className="block"><span className="whitespace-nowrap xl:sr-only">model {exactModelNumber} · </span>{reportDateNode(latestModelNumberTotals.reportDate)}</span>
      </>
    );
  } else if (latestModelNumberTotals && exactModelNumber) {
    allocationFact = (
      <>
        <span className="sr-only">Latest allocation · </span>model {exactModelNumber} not listed · {reportDateNode(latestModelNumberTotals.reportDate)}
      </>
    );
  }

  const daysWaiting = isActive ? daysSinceOrder(order.date) : null;
  const hasDeposit = typeof order.depositAmount === "number" && order.depositAmount > 0;
  // Cell labels show when cells stack; at xl the shared header row in OrderList shows them.
  const cellLabel = "text-[11px] font-semibold uppercase tracking-wide text-stone-500 xl:sr-only";
  let carCell: React.ReactNode = (
    <p className="text-xs text-stone-500"><span aria-hidden="true">&mdash;</span><span className="sr-only">Nothing yet</span></p>
  );
  if (isSecured && order.securedVehicleInfo) {
    // Secured: show which car fulfilled the order (the live link slot is freed on secure).
    carCell = <p className="break-words text-xs leading-snug text-stone-600">{order.securedVehicleInfo}</p>;
  } else if (carStatus === "got") {
    // "Did we get the car?" — the loudest fact on the row (Rob, 2026-11-28).
    carCell = (
      <>
        <p className="flex items-center gap-1.5 whitespace-nowrap text-sm font-black uppercase tracking-[0.06em] text-emerald-700" data-testid="order-card-car-status">
          <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          Got the car
        </p>
        {order.allocatedVehicleInfo && (
          <p className="mt-1 text-xs leading-snug text-stone-600">
            {order.allocatedVehicleInfo.split(" - ").map((part, i) => (
              <React.Fragment key={i}>{i > 0 && " · "}<span className="whitespace-nowrap">{part}</span></React.Fragment>
            ))}
          </p>
        )}
      </>
    );
  } else if (isSecured) {
    // Secured with no recorded car: keep the dash.
  } else if (carStatus === "exchange") {
    carCell = (
      <>
        <p className="whitespace-nowrap text-sm font-black uppercase tracking-[0.06em] text-stone-950" data-testid="order-card-car-status">Via exchange</p>
        {(order.dxDealerName || order.dxExpectedArrival) && (
          <p className="mt-1 break-words text-xs leading-snug text-stone-600">
            {order.dxDealerName && <span className="block font-semibold text-stone-800">From {order.dxDealerName}</span>}
            {order.dxExpectedArrival && <span className="block tabular-nums">Expected {order.dxExpectedArrival}</span>}
          </p>
        )}
        {unconfirmedLink && (
          <p className="mt-1 text-xs font-semibold leading-snug text-amber-700" data-testid="order-card-stale-link">
            Linked car not found on the Allocation Board
          </p>
        )}
      </>
    );
  } else {
    const longWait = daysWaiting !== null && daysWaiting >= LONG_WAIT_DAYS;
    carCell = (
      <>
        <p
          className={`whitespace-nowrap text-sm font-black uppercase tracking-[0.06em] ${longWait ? "text-amber-700" : "text-stone-500"}`}
          data-testid="order-card-car-status"
        >
          {longWait ? `Waiting ${daysWaiting} days` : "Waiting"}
        </p>
        {unconfirmedLink && (
          <p className="mt-1 text-xs font-semibold leading-snug text-amber-700" data-testid="order-card-stale-link">
            Linked car not found on the Allocation Board
          </p>
        )}
        {isAllocationLinkable(order.status) && (
          <p className="mt-1 text-xs font-medium leading-snug text-stone-600" data-testid="order-card-availability">
            {allocationFact}
          </p>
        )}
      </>
    );
  }

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as OrderStatus;
    onUpdateStatus(order.id, newStatus);
  };

  const handleBeginEdit = () => {
    if (!currentUser?.isManager || !isActive) return;
    setEditState(toEditFormState(order));
    setErrors({});
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsSaving(false);
    setErrors({});
    setEditState(toEditFormState(order));
    setIsEditing(false);
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setEditState((prev) => ({ ...prev, [name]: value }) as EditFormState);
    if (errors[name as keyof EditFormState]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validateEdit = () => {
    const newErrors: Partial<Record<keyof EditFormState, string>> = {};
    const currentYear = new Date().getFullYear();
    const minYear = 1900;
    const maxYear = currentYear + 2;

    if (!editState.salesperson.trim())
      newErrors.salesperson = "Salesperson is required";
    if (!editState.manager.trim()) newErrors.manager = "Manager is required";
    if (!editState.date.trim()) newErrors.date = "Date is required";
    if (!editState.customerName.trim())
      newErrors.customerName = "Customer name is required";
    if (!editState.dealNumber.trim())
      newErrors.dealNumber = "Deal # is required";
    if (!editState.model.trim()) newErrors.model = "Model is required";
    if (!editState.modelNumber.trim())
      newErrors.modelNumber = "Model # is required";
    if (!editState.options.trim()) newErrors.options = "Options are required";

    if (!editState.year.trim()) {
      newErrors.year = "Year is required";
    } else if (!/^\d{4}$/.test(editState.year.trim())) {
      newErrors.year = "Year must be a 4-digit number";
    } else {
      const yearNum = parseInt(editState.year.trim(), 10);
      if (yearNum < minYear || yearNum > maxYear) {
        newErrors.year = `Year must be between ${minYear} and ${maxYear}`;
      }
    }

    if (!editState.exteriorColor1.trim()) {
      newErrors.exteriorColor1 = "Exterior Color #1 is required";
    } else if (editState.exteriorColor1.trim().length < 3) {
      newErrors.exteriorColor1 = "Must be at least 3 characters";
    }
    if (
      editState.exteriorColor2.trim() &&
      editState.exteriorColor2.trim().length < 3
    )
      newErrors.exteriorColor2 = "Must be at least 3 characters";
    if (
      editState.exteriorColor3.trim() &&
      editState.exteriorColor3.trim().length < 3
    )
      newErrors.exteriorColor3 = "Must be at least 3 characters";

    if (!editState.interiorColor1.trim()) {
      newErrors.interiorColor1 = "Interior Color #1 is required";
    } else if (editState.interiorColor1.trim().length < 3) {
      newErrors.interiorColor1 = "Must be at least 3 characters";
    }
    if (
      editState.interiorColor2.trim() &&
      editState.interiorColor2.trim().length < 3
    )
      newErrors.interiorColor2 = "Must be at least 3 characters";
    if (
      editState.interiorColor3.trim() &&
      editState.interiorColor3.trim().length < 3
    )
      newErrors.interiorColor3 = "Must be at least 3 characters";

    const deposit = parseFloat(editState.depositAmount);
    if (!editState.depositAmount.trim() || Number.isNaN(deposit)) {
      newErrors.depositAmount = "A valid deposit amount is required";
    }

    const msrp = parseFloat(editState.msrp);
    if (!editState.msrp.trim() || Number.isNaN(msrp)) {
      newErrors.msrp = "A valid MSRP is required";
    }

    if (
      editState.sellingPrice.trim() &&
      Number.isNaN(parseFloat(editState.sellingPrice))
    ) {
      newErrors.sellingPrice = "Must be a valid number";
    }
    if (editState.gross.trim() && Number.isNaN(parseFloat(editState.gross))) {
      newErrors.gross = "Must be a valid number";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!currentUser?.isManager || !isActive) return;
    if (!validateEdit()) return;

    setIsSaving(true);
    try {
      const updates: Partial<Order> = {
        salesperson: editState.salesperson.trim(),
        manager: editState.manager.trim(),
        date: editState.date,
        customerName: editState.customerName.trim(),
        stockNumber: editState.stockNumber.trim(),
        dealNumber: editState.dealNumber.trim(),
        vin: editState.vin.trim(),
        year: editState.year.trim(),
        model: editState.model.trim(),
        modelNumber: editState.modelNumber.trim(),
        exteriorColor1: editState.exteriorColor1.trim(),
        exteriorColor2: editState.exteriorColor2.trim(),
        exteriorColor3: editState.exteriorColor3.trim(),
        interiorColor1: editState.interiorColor1.trim(),
        interiorColor2: editState.interiorColor2.trim(),
        interiorColor3: editState.interiorColor3.trim(),
        msrp: parseFloat(editState.msrp),
        sellingPrice: editState.sellingPrice.trim()
          ? parseFloat(editState.sellingPrice)
          : undefined,
        gross: editState.gross.trim() ? parseFloat(editState.gross) : undefined,
        depositAmount: parseFloat(editState.depositAmount),
        options: editState.options,
        notes: editState.notes,
      };

      const ok = await onUpdateOrderDetails(order.id, updates);
      if (ok) {
        setIsEditing(false);
        setErrors({});
      }
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = (name: keyof EditFormState) =>
    `block w-full p-2 border ${
      errors[name] ? "border-red-500" : "border-stone-300"
    } rounded-lg shadow-sm focus:ring-stone-400 focus:border-stone-400 sm:text-sm`;

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

  const toggleExpanded = () => {
    setIsExpanded((previous) => !previous);
    // Disarm a pending unlink confirmation when the card changes state so it
    // never reopens showing a primed "Confirm".
    setShowUnlinkConfirm(false);
  };

  return (
    <>
    <div
      ref={cardRef}
      id={`order-${order.id}`}
      className={`rounded-2xl border-l-4 ring-1 transition-all duration-300 ${
        isSecured
          ? "bg-stone-100/70 ring-stone-200 border-l-transparent"
          : `bg-white shadow-card ring-stone-950/5 hover:ring-stone-950/15 ${carStatus === "got" ? "border-l-emerald-600" : "border-l-transparent"}`
      }`}
    >
      <div
        className="relative w-full cursor-pointer rounded-lg text-left"
      >
        <button
          type="button"
          className="absolute inset-0 z-0 w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
          onClick={toggleExpanded}
          aria-label="Toggle order details"
          aria-expanded={isExpanded}
        />
        {currentUser?.isManager ? (
          <div className={`pointer-events-none relative z-10 grid grid-cols-2 gap-x-4 gap-y-2.5 px-3.5 py-3 sm:grid-cols-4 sm:px-4 xl:items-start xl:gap-x-5 xl:py-2.5 ${ORDER_ROW_GRID_XL}`}>
            <div className="col-span-2 min-w-0 pr-10 xl:order-1 xl:col-span-1 xl:pr-0">
              <h3 className={`min-w-0 break-words text-lg font-bold leading-tight xl:text-base ${isSecured ? "text-stone-600" : "text-graphite"}`}>
                {order.customerName}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusBadge status={order.status} />
                <span className="whitespace-nowrap text-xs font-medium tabular-nums text-stone-600">
                  {order.date}
                  {daysWaiting !== null && (
                    <>
                      <span className="mx-1 text-stone-400" aria-hidden="true">·</span>
                      <span data-testid="order-card-days-waiting">{formatDaysWaiting(daysWaiting)}</span>
                    </>
                  )}
                </span>
              </div>
            </div>
            <div className="min-w-0 xl:order-2">
              <p className={cellLabel}>Salesperson</p>
              <p className="mt-0.5 break-words text-sm font-semibold leading-snug text-graphite xl:mt-0" data-testid="order-card-summary-salesperson">{formatSalesperson(order)}</p>
            </div>
            <div className="min-w-0 xl:order-5">
              <p className={cellLabel}>Deposit</p>
              <p className={`mt-0.5 text-sm font-semibold tabular-nums xl:mt-0 ${hasDeposit ? "text-graphite" : "text-stone-500"}`}>{formatDeposit(order)}</p>
            </div>
            <div className="col-span-2 min-w-0 xl:order-3 xl:col-span-1">
              <p className={cellLabel}>Vehicle</p>
              <p className="mt-0.5 break-words text-sm font-bold leading-snug text-graphite xl:mt-0">
                {order.year} {vehicleLabel.name}
                {vehicleLabel.code && (
                  <span className="ml-1.5 text-xs font-semibold tabular-nums text-stone-600">
                    {modelLineRepeatsCode ? (
                      <span data-testid="order-card-summary-model"><span className="sr-only">Model: </span>{vehicleLabel.shown}</span>
                    ) : (
                      vehicleLabel.shown
                    )}
                  </span>
                )}
              </p>
              {!modelLineRepeatsCode && (
                <p className="text-xs font-semibold tabular-nums text-stone-600" data-testid="order-card-summary-model">{modelNumberDisplay || "Model # not listed"}</p>
              )}
            </div>
            <div className="col-span-2 min-w-0 xl:order-4 xl:col-span-1">
              {/* "Exterior:" / "Interior:" label themselves; the xl header row shows "Colors". */}
              <p className="sr-only">Colors</p>
              <p className="mt-0.5 break-words text-sm leading-snug text-stone-700 xl:mt-0">
                <span className="block"><span className="font-semibold">Exterior:</span>{" "}
                  {exteriorColors.length === 0
                    ? "Not listed"
                    : exteriorColors.map((color, i) => (
                        <React.Fragment key={`${color}-${i}`}>
                          {i > 0 && " / "}
                          <span className="whitespace-nowrap"><PaintSwatch color={color} />{color}</span>
                        </React.Fragment>
                      ))}
                </span>
                <span className="block"><span className="font-semibold">Interior:</span> {interiorColors.join(" / ") || "Not listed"}</span>
              </p>
            </div>
            <div className="col-span-2 min-w-0 xl:order-6 xl:col-span-1">
              <p className={cellLabel}>Car status</p>
              <div className="mt-0.5 xl:mt-0">{carCell}</div>
            </div>
            <div className="col-span-2 min-w-0 xl:order-7 xl:col-span-1">
              <p className={cellLabel}>Latest note</p>
              {previewNote ? (
                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-snug text-stone-800 xl:mt-0" data-testid="order-card-latest-note">
                  {previewNote}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-stone-500 xl:mt-0" data-testid="order-card-latest-note">
                  <span aria-hidden="true">&mdash;</span><span className="sr-only">No notes yet</span>
                </p>
              )}
              {previewNote && previewNote.length > 100 && (
                <p className="mt-0.5 text-xs font-medium text-stone-500">Expand for the full note</p>
              )}
            </div>
            {/* Decorative: the full-row button underneath is the real control. 44px hit area. */}
            <span className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center text-stone-500 xl:static xl:order-8 xl:-my-2 xl:self-center" aria-hidden="true">
              <ChevronDownIcon className={`h-5 w-5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
            </span>
          </div>
        ) : (
        <div className="pointer-events-none relative z-10 flex items-start justify-between p-4">
          <div className="min-w-0">
            <h3
              className={`text-lg font-bold ${
                isSecured ? "line-through text-stone-500" : "text-stone-800"
              }`}
            >
              {order.customerName}
            </h3>
            <p className="text-sm text-stone-600 font-semibold">
              {order.year} {order.model}
            </p>
            {/* Summary row for at-a-glance details */}
            <p
              className="text-xs text-stone-400 mt-0.5 truncate"
              data-testid="order-card-summary-row"
            >
              <span data-testid="order-card-summary-salesperson">{formatSalesperson(order)}</span>
              {" · "}
              <span data-testid="order-card-summary-deposit">Dep: {formatDeposit(order)}</span>
              {" · "}
              <span data-testid="order-card-summary-ext-color">{formatExtColor(order)}</span>
              {modelNumberDisplay && <><span> · </span><span data-testid="order-card-summary-model">{modelNumberDisplay}</span></>}
              {typeof order.msrp === "number" && <><span> · </span><span>${order.msrp.toLocaleString()}</span></>}
            </p>
            {order.latestNoteText && (
              <p
                className="text-xs text-stone-400 mt-1"
                data-testid="order-card-latest-note"
              >
                <span className="font-semibold text-stone-500">
                  Latest note:
                </span>{" "}
                <span className="truncate inline-block max-w-[38ch] align-bottom">
                  {order.latestNoteText}
                </span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={order.status} />
              {order.allocatedVehicleId && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Vehicle Linked
                </span>
              )}
              {matchSummary && !order.allocatedVehicleId && (() => {
                const hasAllocationContext = isAllocationLinkable(order.status)
                  && (matchSummary.exactCount > 0 || matchSummary.partialCount > 0);
                const dxHistoryCount = matchSummary.dxExactCount
                  + matchSummary.dxPartialCount
                  + matchSummary.dxModelOnlyCount;
                const hasDxContext = isActiveStatus(order.status) && dxHistoryCount > 0;
                if (!hasAllocationContext && !hasDxContext) return null;
                const allocParts: string[] = [];
                if (matchSummary.exactCount > 0) allocParts.push(`${matchSummary.exactCount} exact`);
                if (matchSummary.partialCount > 0) allocParts.push(`${matchSummary.partialCount} close`);
                const hasExactAllocation = matchSummary.exactCount > 0;
                return (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMatchPreview(true); }}
                    aria-label="Preview allocation matches and completed DX history"
                    className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold hover:shadow-sm transition-shadow cursor-pointer ${hasExactAllocation ? "bg-emerald-50 border-emerald-200 text-emerald-700" : hasDxContext && !hasAllocationContext ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-stone-50 border-stone-200 text-stone-700"}`}
                    title="Preview allocation matches and completed DX history"
                  >
                    {hasAllocationContext && allocParts.length > 0 && <span>{allocParts.join(", ")}</span>}
                    {hasAllocationContext && hasDxContext && <span className="text-stone-300">|</span>}
                    {hasDxContext && <span className="text-amber-700">DX history: {dxHistoryCount}</span>}
                    <span>→</span>
                  </button>
                );
              })()}
            </div>
          </div>
          <div className="ml-4 flex flex-shrink-0 items-center space-x-3 p-1 text-right">
            <span className="text-sm font-medium text-stone-500">
              {order.date}
            </span>
            <span className="text-stone-400">
              <ChevronDownIcon
                className={`w-6 h-6 transform transition-transform duration-200 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </span>
          </div>
        </div>
        )}
      </div>
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="mt-2 pt-4 border-t border-stone-200">
            <div className="p-3 mb-4 rounded-lg bg-stone-50 border border-stone-200">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
                  {currentUser?.isManager && isActive ? (
                    <>
                      <label
                        htmlFor={`status-select-${order.id}`}
                        className="flex items-center gap-1.5 text-sm font-medium text-stone-700"
                      >
                        Change Status:
                      </label>
                      <select
                        id={`status-select-${order.id}`}
                        value={order.status}
                        onChange={handleStatusChange}
                        disabled={isEditing || isSaving}
                        className="p-2.5 border border-stone-300 rounded-md shadow-sm text-sm focus:ring-stone-400 focus:border-stone-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {ACTIVE_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : isSecured ? (
                    <div className="text-sm font-medium text-emerald-700">
                      Order Secured
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-stone-700">
                      Status: {order.status}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Single "Mark Secured" button replaces the two-step Received/Delivered flow */}
                  {currentUser?.isManager && isActive && !isEditing && (
                    <button
                      onClick={() =>
                        onUpdateStatus(order.id, OrderStatus.Delivered)
                      }
                      disabled={isSaving}
                      className="flex items-center gap-1.5 text-sm bg-stone-950 hover:bg-stone-800 text-white font-semibold py-3 px-4 rounded-lg shadow-sm transition-colors"
                    >
                      Mark Secured
                    </button>
                  )}
                  {currentUser?.isManager && isActive && !isEditing && (
                    <button
                      onClick={handleBeginEdit}
                      className="flex items-center gap-1.5 text-sm border-2 border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {currentUser?.isManager && isActive && isEditing && (
                    <>
                      <button
                        onClick={handleCancelEdit}
                        type="button"
                        disabled={isSaving}
                        className="flex items-center gap-1.5 text-sm border-2 border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void handleSaveEdit()}
                        type="button"
                        disabled={isSaving}
                        className="flex items-center gap-1.5 text-sm bg-stone-950 hover:bg-stone-800 text-white font-semibold py-2 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                    </>
                  )}
                  {/* "Mark as Unsecured" button for managers on secured orders - reverts to active status */}
                  {currentUser?.isManager && isSecured && (
                    <button
                      onClick={() => setShowUnsecureConfirm(true)}
                      className="flex items-center gap-1.5 text-sm border-2 border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      <UndoIcon className="w-4 h-4" />
                      Mark as Unsecured
                    </button>
                  )}
                  {currentUser?.isManager && !isEditing && (
                    showDeleteConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500">Delete this order?</span>
                        <button
                          onClick={() => { onDeleteOrder(order.id); setShowDeleteConfirm(false); }}
                          className="text-xs font-semibold text-red-600 hover:text-red-800"
                        >
                          Yes, delete
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="text-xs font-semibold text-stone-500 hover:text-stone-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium py-2.5 px-4 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <TrashIcon className="w-4 h-4 text-red-500" />
                        Delete
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {currentUser?.isManager && matchSummary &&
              (matchSummary.exactCount + matchSummary.partialCount + matchSummary.modelOnlyCount +
                matchSummary.dxExactCount + matchSummary.dxPartialCount + matchSummary.dxModelOnlyCount) > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMatchPreview(true)}
                  className="mb-4 text-sm font-semibold text-stone-700 underline underline-offset-2 hover:text-graphite"
                >
                  Review allocation matches and DX history
                </button>
              )}
            {order.allocatedVehicleId && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Linked Vehicle</p>
                      <p className="text-sm font-medium text-emerald-800 truncate">{order.allocatedVehicleInfo || order.allocatedVehicleId}</p>
                    </div>
                  </div>
                  {currentUser?.isManager && (
                    !showUnlinkConfirm ? (
                      <button
                        onClick={() => setShowUnlinkConfirm(true)}
                        disabled={isUnlinking}
                        className="shrink-0 rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {isUnlinking ? "Unlinking..." : "Unlink"}
                      </button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => {
                            setShowUnlinkConfirm(false);
                            void handleUnlinkVehicle();
                          }}
                          disabled={isUnlinking}
                          className="rounded-lg bg-red-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setShowUnlinkConfirm(false)}
                          className="rounded-lg bg-white px-3 py-2.5 text-xs font-semibold text-stone-600 shadow-sm hover:bg-stone-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {isSecured && order.securedVehicleInfo && (
              <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Delivered vehicle
                </p>
                <p className="text-sm font-medium text-stone-700">
                  {order.securedVehicleInfo}
                </p>
              </div>
            )}

            {isAllocationLinkable(order.status) &&
              currentUser?.isManager &&
              !order.allocatedVehicleId &&
              allocationVehicles &&
              allocationVehicles.length > 0 && (
                <div className="mb-4">
                  <VehicleLinkSelector
                    order={order}
                    vehicles={allocationVehicles}
                    linkedVehicleIds={linkedVehicleIds ?? new Set()}
                    onLink={(vehicleId, vehicleInfo) => void handleLinkVehicle(vehicleId, vehicleInfo)}
                    onUnlink={() => void handleUnlinkVehicle()}
                  />
                </div>
              )}

            <div className="space-y-6">
              {isEditing && currentUser?.isManager && isActive && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSaveEdit();
                  }}
                  className="p-4 rounded-lg bg-white border border-stone-200"
                  aria-label="Edit order details"
                >
                  <h4 className="text-sm font-semibold text-stone-700 mb-4">
                    Edit Order
                  </h4>

                  <div className="space-y-5">
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Staff & Date
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label
                            htmlFor={`edit-salesperson-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Salesperson*
                          </label>
                          <input
                            id={`edit-salesperson-${order.id}`}
                            name="salesperson"
                            value={editState.salesperson}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("salesperson")}
                            type="text"
                          />
                          {errors.salesperson && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.salesperson}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-manager-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Manager*
                          </label>
                          <input
                            id={`edit-manager-${order.id}`}
                            name="manager"
                            value={editState.manager}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("manager")}
                            type="text"
                          />
                          {errors.manager && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.manager}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-date-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Date*
                          </label>
                          <input
                            id={`edit-date-${order.id}`}
                            name="date"
                            value={editState.date}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("date")}
                            type="date"
                          />
                          {errors.date && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.date}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Customer & Deal
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor={`edit-customerName-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Customer Name*
                          </label>
                          <input
                            id={`edit-customerName-${order.id}`}
                            name="customerName"
                            value={editState.customerName}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("customerName")}
                            type="text"
                          />
                          {errors.customerName && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.customerName}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-dealNumber-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Deal #*
                          </label>
                          <input
                            id={`edit-dealNumber-${order.id}`}
                            name="dealNumber"
                            value={editState.dealNumber}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("dealNumber")}
                            type="text"
                          />
                          {errors.dealNumber && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.dealNumber}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor={`edit-stockNumber-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Stock #
                          </label>
                          <input
                            id={`edit-stockNumber-${order.id}`}
                            name="stockNumber"
                            value={editState.stockNumber}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("stockNumber")}
                            type="text"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-vin-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            VIN (Last 8)
                          </label>
                          <input
                            id={`edit-vin-${order.id}`}
                            name="vin"
                            value={editState.vin}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("vin")}
                            type="text"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Vehicle
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label
                            htmlFor={`edit-year-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Year*
                          </label>
                          <input
                            id={`edit-year-${order.id}`}
                            name="year"
                            value={editState.year}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("year")}
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                          />
                          {errors.year && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.year}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-model-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Model*
                          </label>
                          <input
                            id={`edit-model-${order.id}`}
                            name="model"
                            value={editState.model}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("model")}
                            type="text"
                          />
                          {errors.model && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.model}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-modelNumber-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Model #*
                          </label>
                          <input
                            id={`edit-modelNumber-${order.id}`}
                            name="modelNumber"
                            value={editState.modelNumber}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("modelNumber")}
                            type="text"
                          />
                          {errors.modelNumber && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.modelNumber}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Colors
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label
                            htmlFor={`edit-exteriorColor1-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Exterior Color #1*
                          </label>
                          <input
                            id={`edit-exteriorColor1-${order.id}`}
                            name="exteriorColor1"
                            value={editState.exteriorColor1}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("exteriorColor1")}
                            type="text"
                          />
                          {errors.exteriorColor1 && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.exteriorColor1}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-exteriorColor2-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Exterior Color #2
                          </label>
                          <input
                            id={`edit-exteriorColor2-${order.id}`}
                            name="exteriorColor2"
                            value={editState.exteriorColor2}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("exteriorColor2")}
                            type="text"
                          />
                          {errors.exteriorColor2 && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.exteriorColor2}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-exteriorColor3-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Exterior Color #3
                          </label>
                          <input
                            id={`edit-exteriorColor3-${order.id}`}
                            name="exteriorColor3"
                            value={editState.exteriorColor3}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("exteriorColor3")}
                            type="text"
                          />
                          {errors.exteriorColor3 && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.exteriorColor3}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label
                            htmlFor={`edit-interiorColor1-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Interior Color #1*
                          </label>
                          <input
                            id={`edit-interiorColor1-${order.id}`}
                            name="interiorColor1"
                            value={editState.interiorColor1}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("interiorColor1")}
                            type="text"
                          />
                          {errors.interiorColor1 && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.interiorColor1}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-interiorColor2-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Interior Color #2
                          </label>
                          <input
                            id={`edit-interiorColor2-${order.id}`}
                            name="interiorColor2"
                            value={editState.interiorColor2}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("interiorColor2")}
                            type="text"
                          />
                          {errors.interiorColor2 && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.interiorColor2}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-interiorColor3-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Interior Color #3
                          </label>
                          <input
                            id={`edit-interiorColor3-${order.id}`}
                            name="interiorColor3"
                            value={editState.interiorColor3}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("interiorColor3")}
                            type="text"
                          />
                          {errors.interiorColor3 && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.interiorColor3}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Pricing
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label
                            htmlFor={`edit-msrp-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            MSRP*
                          </label>
                          <input
                            id={`edit-msrp-${order.id}`}
                            name="msrp"
                            value={editState.msrp}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("msrp")}
                            type="text"
                            inputMode="decimal"
                          />
                          {errors.msrp && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.msrp}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-sellingPrice-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Selling Price
                          </label>
                          <input
                            id={`edit-sellingPrice-${order.id}`}
                            name="sellingPrice"
                            value={editState.sellingPrice}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("sellingPrice")}
                            type="text"
                            inputMode="decimal"
                          />
                          {errors.sellingPrice && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.sellingPrice}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-gross-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Gross
                          </label>
                          <input
                            id={`edit-gross-${order.id}`}
                            name="gross"
                            value={editState.gross}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("gross")}
                            type="text"
                            inputMode="decimal"
                          />
                          {errors.gross && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.gross}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-depositAmount-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Deposit Amount*
                          </label>
                          <input
                            id={`edit-depositAmount-${order.id}`}
                            name="depositAmount"
                            value={editState.depositAmount}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("depositAmount")}
                            type="text"
                            inputMode="decimal"
                          />
                          {errors.depositAmount && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.depositAmount}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Notes
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor={`edit-options-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Options*
                          </label>
                          <textarea
                            id={`edit-options-${order.id}`}
                            name="options"
                            value={editState.options}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("options")}
                            rows={4}
                          />
                          {errors.options && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.options}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-notes-${order.id}`}
                            className="block text-sm font-medium text-stone-700"
                          >
                            Internal Notes
                          </label>
                          <textarea
                            id={`edit-notes-${order.id}`}
                            name="notes"
                            value={editState.notes}
                            onChange={handleEditChange}
                            disabled={isSaving}
                            className={inputClass("notes")}
                            rows={4}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-5 text-sm">
                <DetailItem label="Salesperson">{order.salesperson}</DetailItem>
                <DetailItem label="Manager">{order.manager}</DetailItem>
                <DetailItem label="Deposit">
                  {typeof order.depositAmount === "number"
                    ? `$${order.depositAmount.toFixed(2)}`
                    : "N/A"}
                </DetailItem>
                <DetailItem label="Deal #">{order.dealNumber}</DetailItem>
                <DetailItem label="Stock #">{order.stockNumber}</DetailItem>
                <DetailItem label="VIN (Last 8)">{order.vin}</DetailItem>
                <DetailItem label="Model #">{order.modelNumber}</DetailItem>
                <DetailItem label="Ext. Color #1">
                  {order.exteriorColor1}
                </DetailItem>
                <DetailItem label="Int. Color #1">
                  {order.interiorColor1}
                </DetailItem>
                <DetailItem label="MSRP">
                  {typeof order.msrp === "number"
                    ? `$${order.msrp.toFixed(2)}`
                    : "N/A"}
                </DetailItem>
                <DetailItem label="Selling Price">
                  {order.sellingPrice
                    ? `$${order.sellingPrice.toFixed(2)}`
                    : "N/A"}
                </DetailItem>
                <DetailItem label="Gross">
                  {order.gross ? `$${order.gross.toFixed(2)}` : "N/A"}
                </DetailItem>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {exteriorColors.length > 1 || interiorColors.length > 1 ? (
                  <>
                    {exteriorColors.length > 1 && (
                      <DetailItem label="Additional Ext. Color #'s">
                        {exteriorColors.slice(1).join(", ")}
                      </DetailItem>
                    )}
                    {interiorColors.length > 1 && (
                      <DetailItem label="Additional Int. Color #'s">
                        {interiorColors.slice(1).join(", ")}
                      </DetailItem>
                    )}
                  </>
                ) : null}
              </div>

              {(order.options || order.notes) && (
                <div className="space-y-4">
                  {order.options && (
                    <div className="bg-stone-50 p-3 rounded-lg border">
                      <strong className="block text-stone-500 text-sm font-semibold mb-1">
                        Options
                      </strong>
                      <p className="text-sm text-stone-700 whitespace-pre-wrap">
                        {order.options}
                      </p>
                    </div>
                  )}
                  {order.notes && (
                    <div className="bg-stone-50 p-3 rounded-lg border">
                      <strong className="block text-stone-500 text-sm font-semibold mb-1">
                        Internal Notes
                      </strong>
                      <p className="text-sm text-stone-700 whitespace-pre-wrap">
                        {order.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-stone-100 mt-4 pt-4">
                <OrderNotes orderId={order.id} currentUser={currentUser} />
              </div>
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
            <h3
              id="unsecure-dialog-title"
              className="text-lg font-bold text-stone-800 mb-3"
            >
              Confirm Unsecure Action
            </h3>
            <p className="text-sm text-stone-600 mb-4">
              Are you sure you want to mark this order as unsecured?
            </p>
            <ul className="text-sm text-stone-600 mb-4 list-disc list-inside space-y-1">
              <li>
                The order will move back to <strong>Active Orders</strong>
              </li>
              <li>
                Status will change to <strong>Factory Order</strong>
              </li>
              <li>Dashboard metrics will update accordingly</li>
            </ul>
            <p className="text-xs text-amber-600 font-medium mb-4">
              This action is typically used when an order was marked as secured
              by mistake.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowUnsecureConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
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
    {showMatchPreview && matchSummary && (
        <MatchPreviewModal
          order={order}
          matchSummary={matchSummary}
          onClose={() => setShowMatchPreview(false)}
        />
      )}
    </>
  );
};

export default OrderCard;
