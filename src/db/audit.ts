import { db } from './index';

/**
 * Audit log helper:
 * Every decision and protected action goes in the audit log.
 * Per Hospivo business rules, audit log records can NEVER be edited or deleted.
 * Only addAudit() is exposed.
 */
export async function addAudit(
  who: string,
  action: string,
  record: string,
  details: string
): Promise<number> {
  const id = await db.auditLog.add({
    timestamp: new Date().toISOString(),
    who,
    action,
    record,
    details,
  });
  return id as number;
}
