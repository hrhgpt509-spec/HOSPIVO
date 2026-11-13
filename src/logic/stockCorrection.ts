import { db, type DBUser, type StockMovement } from '../db';
import { addAudit } from '../db/audit';
import { enqueueSyncItem } from './cloudSync';
import {
  DEFAULT_APPROVAL_RULES,
  type ApprovalActionCategory,
  type ApprovalRuleType,
} from './approvals';
import { batchStock } from './stock';

export type CorrectionDirection = 'reduce' | 'add';

export type CorrectionReasonCode = 'damaged' | 'lost' | 'count_mismatch';

export type StockCorrectionErrorCode =
  | 'invalid_quantity'
  | 'insufficient_stock'
  | 'reason_required'
  | 'blocked_offline';

export interface StockCorrectionInput {
  medicineId: number;
  medicineName: string;
  batchId: number;
  batchNo: string;
  direction: CorrectionDirection;
  deltaUnits: number;
  reasonCode?: CorrectionReasonCode | '';
  note?: string;
  user: Pick<DBUser, 'name' | 'role'> | null | undefined;
}

export type ValidateStockCorrectionResult =
  | {
      ok: true;
      signedDelta: number;
      englishReason: string;
    }
  | {
      ok: false;
      error: StockCorrectionErrorCode;
      availableUnits?: number;
    };

export type StockCorrectionResult =
  | {
      ok: true;
      movementId: number;
      signedDelta: number;
      newBatchStock: number;
    }
  | {
      ok: false;
      error: StockCorrectionErrorCode;
      availableUnits?: number;
    };

const ENGLISH_REASON_LABELS: Record<CorrectionReasonCode, string> = {
  damaged: 'Damaged',
  lost: 'Lost / Missing',
  count_mismatch: 'Count mismatch',
};

/**
 * Reads the saved offline approval rule for 'stock_correction'.
 */
export async function getStockCorrectionApprovalRule(): Promise<ApprovalRuleType> {
  try {
    const item = await db.settings.get('approval_rules');
    const rules = item?.value as Partial<Record<ApprovalActionCategory, ApprovalRuleType>> | undefined;
    if (rules && rules.stock_correction) {
      return rules.stock_correction;
    }
  } catch {
    // Fallback to default rule
  }
  return DEFAULT_APPROVAL_RULES.stock_correction;
}

/**
 * Evaluates whether stock correction can proceed offline under the given approval rule.
 * In Local-only / offline mode, only 'local_pin' is permitted; 'blocked_offline' (and
 * any non-local_pin rule) is blocked.
 */
export function evaluateStockCorrectionRule(rule: ApprovalRuleType): {
  allowed: boolean;
  requiresPin: boolean;
  blocked: boolean;
} {
  if (rule === 'local_pin') {
    return { allowed: true, requiresPin: true, blocked: false };
  }
  return { allowed: false, requiresPin: false, blocked: true };
}

/**
 * Formats a concise fixed English reason string for storage and audit logs.
 */
export function formatEnglishCorrectionReason(
  reasonCode?: CorrectionReasonCode | '',
  note?: string
): string {
  const base = reasonCode ? ENGLISH_REASON_LABELS[reasonCode] : '';
  const trimmedNote = (note || '').trim();
  if (base && trimmedNote) {
    return `${base} - ${trimmedNote}`;
  }
  return base || trimmedNote;
}

/**
 * Builds the concise English record description passed to ApprovalDialog.
 */
export function buildCorrectionRecordDescription(
  medicineName: string,
  strength: string | undefined,
  batchNo: string,
  signedDelta: number
): string {
  const fullName = strength ? `${medicineName} ${strength}` : medicineName;
  const sign = signedDelta > 0 ? '+' : '';
  return `${fullName} (Batch ${batchNo}): ${sign}${signedDelta} units`;
}

/**
 * Validates adjustment quantity, non-negative stock constraint, and required reason.
 */
export function validateStockCorrection(
  input: Pick<StockCorrectionInput, 'direction' | 'deltaUnits' | 'reasonCode' | 'note'>,
  currentBatchUnits: number
): ValidateStockCorrectionResult {
  if (!Number.isInteger(input.deltaUnits) || input.deltaUnits < 1) {
    return { ok: false, error: 'invalid_quantity' };
  }

  const signedDelta = input.direction === 'reduce' ? -input.deltaUnits : input.deltaUnits;
  if (currentBatchUnits + signedDelta < 0) {
    return {
      ok: false,
      error: 'insufficient_stock',
      availableUnits: currentBatchUnits,
    };
  }

  const englishReason = formatEnglishCorrectionReason(input.reasonCode, input.note);
  if (!englishReason) {
    return { ok: false, error: 'reason_required' };
  }

  return {
    ok: true,
    signedDelta,
    englishReason,
  };
}

/**
 * Appends a signed 'correction' movement and a 'stock_correction' audit entry atomically.
 * Never edits or deletes existing stockMovements or batches, and never logs PINs or prices.
 */
export async function applyStockCorrection(
  input: StockCorrectionInput
): Promise<StockCorrectionResult> {
  return db.transaction('rw', db.stockMovements, db.auditLog, async () => {
    const currentBatchUnits = await batchStock(input.batchId);
    const validation = validateStockCorrection(input, currentBatchUnits);

    if (!validation.ok) {
      return validation;
    }

    const { signedDelta, englishReason } = validation;
    const who = input.user?.name
      ? `${input.user.name} (${input.user.role || 'staff'})`
      : 'Staff';

    const movement: StockMovement = {
      batchId: input.batchId,
      medicineId: input.medicineId,
      type: 'correction',
      qtyUnits: signedDelta,
      reference: `Correction: ${englishReason}`,
      who,
      at: new Date().toISOString(),
    };

    const movementId = (await db.stockMovements.add(movement)) as number;
    const sign = signedDelta > 0 ? '+' : '';
    const record = `${input.medicineName} (${input.batchNo})`;
    const details = `${input.medicineName} (Batch ${input.batchNo}): ${sign}${signedDelta} units | Reason: ${englishReason}`;

    await addAudit(who, 'stock_correction', record, details);

    enqueueSyncItem('stock_movement', movementId, movement).catch(() => {});

    return {
      ok: true,
      movementId,
      signedDelta,
      newBatchStock: currentBatchUnits + signedDelta,
    };
  });
}

