import type { Medicine, UnitMode } from '../../db';

export interface AllocatedBatchPreview {
  batchId: number;
  batchNo: string;
  expiry: string;
  qtyUnits: number;
  shelf: string;
}

export interface CartItem {
  id: string;
  medicine: Medicine;
  unitMode: UnitMode;
  qtyInput: number;
  itemDiscountPercent: number;
  allocations: AllocatedBatchPreview[];
  availableValidUnits: number;
  patientName: string;
  doctorName: string;
  prescriptionChecked: boolean;
  isHighlighted?: boolean;
}

export interface SerializedHeldCartItem {
  medicineId: number;
  unitMode: UnitMode;
  qtyInput: number;
  itemDiscountPercent: number;
  patientName: string;
  doctorName: string;
  prescriptionChecked: boolean;
}

