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
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isManager: boolean;
}
