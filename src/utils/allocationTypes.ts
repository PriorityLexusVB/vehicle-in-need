import type { Timestamp } from "firebase/firestore";

export interface AllocationVehicle {
  id: string;
  code: string;
  quantity: number;
  color: string;
  interiorColor: string;
  bos: string;
  arrival: string;
  grade: string;
  engine: string;
  msrp: number;
  category: string;
  type: string;
  rank: string;
  profit: number;
  totalValue: number;
}

export interface AllocationSummary {
  units: number;
  value: number;
  hybridMix: number;
}

export interface AllocationSnapshot {
  id: string;
  reportDate: string | null;
  publishedAt?: Timestamp;
  publishedByUid: string;
  publishedByEmail: string;
  itemCount: number;
  summary: AllocationSummary;
  vehicles: AllocationVehicle[];
  isLatest: boolean;
}

export interface ParsedAllocationResult {
  reportDate: string | null;
  vehicles: AllocationVehicle[];
  summary: AllocationSummary;
  itemCount: number;
  warnings: string[];
  errors: string[];
}

export interface PublishAllocationPayload {
  reportDate: string | null;
  vehicles: AllocationVehicle[];
  summary: AllocationSummary;
  itemCount: number;
}
