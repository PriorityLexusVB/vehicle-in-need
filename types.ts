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
  createdAt?: any; // Used for Firestore server-side ordering
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isManager: boolean;
}