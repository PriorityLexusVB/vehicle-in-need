import type { Timestamp } from "firebase/firestore";

export enum OrderStatus {
  FactoryOrder = "Factory Order",
  // Legacy status: Locate is no longer selectable in the UI for new orders,
  // but is retained for backward compatibility with existing database records.
  // Existing orders with this status will display correctly, but users cannot
  // select this option when creating new orders or changing status.
  Locate = "Locate",
  DealerExchange = "Dealer Exchange",
  Received = "Received",
  Delivered = "Delivered",
  // Note: Secured is a UI-only status that maps legacy 'Received' and 'Delivered' for display
  // The database still stores 'Delivered' when marking an order as secured
  Secured = "Secured",
}

export interface Order {
  id: string;
  salesperson: string;
  manager: string;
  date: string;
  customerName: string;
  stockNumber?: string;
  dealNumber: string;
  vin?: string;
  year: string;
  model: string;
  modelNumber: string;
  exteriorColor1: string; // Previously 'color'
  exteriorColor2?: string; // Previously 'extOption1'
  exteriorColor3?: string; // Previously 'extOption2'
  interiorColor1: string; // Previously 'interiorColor'
  interiorColor2?: string; // Previously 'intOption1'
  interiorColor3?: string; // Previously 'intOption2'
  msrp: number;
  sellingPrice?: number;
  gross?: number;
  depositAmount: number;
  status: OrderStatus;
  options: string;
  notes?: string;
  createdAt?: Timestamp; // Firestore server timestamp for ordering
  createdByUid?: string; // UID of user who created the order
  createdByEmail?: string; // Email of user who created the order

  // Denormalized note preview fields (written by managers when adding process notes)
  latestNoteText?: string;
  latestNoteAt?: Timestamp;
  latestNoteByUid?: string;
  latestNoteByName?: string;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isManager: boolean;
  /** Whether the user account is active (not disabled). Defaults to true if not set. */
  isActive?: boolean;
  /** Timestamp when the user was disabled (if applicable) */
  disabledAt?: Timestamp;
  /** UID of the manager who disabled this user (if applicable) */
  disabledBy?: string;
  /** Timestamp when the user document was created */
  createdAt?: Timestamp;
  /** Timestamp when the user document was last updated */
  updatedAt?: Timestamp;
}

export type OrderNoteRole = "user" | "manager" | "admin";

export interface OrderNote {
  id: string;
  text: string;
  createdAt?: Timestamp;
  createdByUid?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdByRole?: OrderNoteRole;
}
