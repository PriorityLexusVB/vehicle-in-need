import type { Timestamp } from "firebase/firestore";

export interface AllocationVehicle {
  id: string;
  code: string;
  model?: string;
  sourceCode?: string;
  quantity: number;
  color: string;
  interior?: string;
  arrival: string;
  timelineType?: "build" | "port";
  bos?: string;
  grade: string;
  factoryAccessories?: string;
  postProductionOptions?: string;
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
