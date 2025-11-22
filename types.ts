import type { Timestamp } from "firebase/firestore";

export enum OrderStatus {
  FactoryOrder = 'Factory Order',
  Locate = 'Locate',
  DealerExchange = 'Dealer Exchange',
  Received = 'Received',
  Delivered = 'Delivered',
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
  color: string;
  interiorColor: string;
  extOption1?: string;
  extOption2?: string;
  intOption1?: string;
  intOption2?: string;
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
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isManager: boolean;
}

export interface VehicleOption {
  id: string;
  code: string; // 4-character code (e.g., "PW01")
  name: string; // Descriptive name (e.g., "Premium Wheels")
  type: 'exterior' | 'interior';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
