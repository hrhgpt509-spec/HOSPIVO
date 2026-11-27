import Dexie from 'dexie';
import { Capacitor } from '@capacitor/core';
import { scheduleAutoBackupAfterChange } from './autoBackup';
import { deleteAllLocalBackupFiles } from './backup';
import {
  db,
  resetDatabase,
  runWithSyncWorkspaceBypass,
  type SyncOutboxItem,
  type SyncEntityType,
  type ApprovalRequest,
  type Medicine,
  type Batch,
  type Supplier,
  type Customer,
  type DBUser,
  type Bill,
  type BillItem,
  type BillReturn,
  type Purchase,
  type PurchaseLine,
  type StockMovement,
  type SupplierReturn,
  type UdhaarPayment,
  type DailyClosing,
} from '../db';
import { addAudit } from '../db/audit';
import { supabase, isBackendConfigured } from '../lib/supabase';
import { getCurrentCloudSession, provisionCloudShop } from './cloudAuth';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface CloudConfig {
  cloudEnabled: boolean;
  cloudUrl: string;
  cloudAnonKey: string;
  hasCustomRestConfig?: boolean;
  shopSyncId: string;
  deviceName: string;
  deviceId?: string;
  lastCloudSyncAt: number | null;
  lastStatus: 'synced' | 'failed' | 'offline' | 'never';
  lastError: string | null;
  lastPulledSeq?: number;
}

export interface SyncCycleResult {
  success: boolean;
  offline: boolean;
  authRequired?: boolean;
  processedCount: number;
  pendingCount: number;
  failedCount: number;
  lastError: string | null;
}

export interface HomeSyncState {
  cloudEnabled: boolean;
  isConnected: boolean;
  status: 'local' | 'not_connected' | 'synced' | 'syncing' | 'offline' | 'failed';
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  chipLabel: string;
  chipColorClass: string;
  bannerVisible: boolean;
  bannerType: 'offline' | 'failed' | 'not_connected' | null;
}

// ---------------------------------------------------------------------------
// CONFIG HELPERS
// ---------------------------------------------------------------------------

/**
 * Generates an 8-character unique alphanumeric pairing ID:
 * e.g. "HOSP-4F8A-9C21"
 */
export function generateShopSyncId(): string {
  const chars = '0123456789ABCDEF';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `HOSP-${p1}-${p2}`;
}

/**
 * Retrieves the current Cloud configuration from db.settings.
 * Auto-creates unique shopSyncId if missing.
 */
export async function getCloudConfig(): Promise<CloudConfig> {
  const [
    enabledItem,
    urlItem,
    keyItem,
    syncIdItem,
    deviceItem,
    deviceIdItem,
    lastSyncItem,
    statusItem,
    errorItem,
    seqItem,
  ] = await Promise.all([
    db.settings.get('cloud_enabled'),
    db.settings.get('cloud_url'),
    db.settings.get('cloud_anon_key'),
    db.settings.get('shop_sync_id'),
    db.settings.get('device_name'),
    db.settings.get('device_id'),
    db.settings.get('last_cloud_sync_at'),
    db.settings.get('last_cloud_sync_status'),
    db.settings.get('last_cloud_sync_error'),
    db.settings.get('last_pulled_seq'),
  ]);

  let shopSyncId = syncIdItem?.value as string;
  if (!shopSyncId) {
    shopSyncId = generateShopSyncId();
    await db.settings.put({ key: 'shop_sync_id', value: shopSyncId });
  }

  let deviceId = deviceIdItem?.value as string;
  if (!deviceId) {
    deviceId = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    await db.settings.put({ key: 'device_id', value: deviceId });
  }

  const cloudEnabled = Boolean(enabledItem?.value ?? false);
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const savedUrl = ((urlItem?.value as string) || '').trim();
  const savedKey = ((keyItem?.value as string) || '').trim();
  const hasCustomRestConfig = Boolean(savedUrl && savedKey);
  const cloudUrl = savedUrl || envUrl;
  const cloudAnonKey = savedKey || envKey;
  const savedDeviceName = ((deviceItem?.value as string) || '').trim();
  const deviceName = savedDeviceName || detectDefaultDeviceName({ deviceId });
  const lastCloudSyncAt = (lastSyncItem?.value as number) || null;
  const lastStatus = (statusItem?.value as CloudConfig['lastStatus']) || 'never';
  const lastError = (errorItem?.value as string) || null;
  const lastPulledSeq = (seqItem?.value as number) || 0;

  return {
    cloudEnabled,
    cloudUrl,
    cloudAnonKey,
    hasCustomRestConfig,
    shopSyncId,
    deviceName,
    deviceId,
    lastCloudSyncAt,
    lastStatus,
    lastError,
    lastPulledSeq,
  };
}

/**
 * Updates Cloud settings in db.settings and updates db.shop mode ('local' | 'cloud').
 */
export async function saveCloudConfig(updates: Partial<CloudConfig>): Promise<CloudConfig> {
  if (updates.cloudEnabled !== undefined) {
    await db.settings.put({ key: 'cloud_enabled', value: updates.cloudEnabled });

    if (!updates.cloudEnabled) {
      stopRealtimeSync();
      await switchToLocalWorkspace().catch((err) => {
        console.warn('Could not restore local workspace:', err);
      });
    }

    // Update shop mode in db.shop
    try {
      const shops = await db.shop.toArray();
      if (shops.length > 0 && shops[0].id) {
        await db.shop.update(shops[0].id, {
          mode: updates.cloudEnabled ? 'cloud' : 'local',
        });
      }
    } catch (err) {
      console.warn('Could not update db.shop mode:', err);
    }
  }

  if (updates.cloudUrl !== undefined) {
    await db.settings.put({ key: 'cloud_url', value: updates.cloudUrl.trim() });
  }
  if (updates.cloudAnonKey !== undefined) {
    await db.settings.put({ key: 'cloud_anon_key', value: updates.cloudAnonKey.trim() });
  }
  if (updates.shopSyncId !== undefined) {
    await db.settings.put({ key: 'shop_sync_id', value: updates.shopSyncId.trim().toUpperCase() });
  }
  if (updates.deviceName !== undefined) {
    await db.settings.put({ key: 'device_name', value: updates.deviceName.trim() });
  }
  if (updates.lastCloudSyncAt !== undefined) {
    await db.settings.put({ key: 'last_cloud_sync_at', value: updates.lastCloudSyncAt });
  }
  if (updates.lastStatus !== undefined) {
    await db.settings.put({ key: 'last_cloud_sync_status', value: updates.lastStatus });
  }
  if (updates.lastError !== undefined) {
    await db.settings.put({ key: 'last_cloud_sync_error', value: updates.lastError });
  }
  if (updates.lastPulledSeq !== undefined) {
    await db.settings.put({ key: 'last_pulled_seq', value: updates.lastPulledSeq });
  }

  return getCloudConfig();
}

// ---------------------------------------------------------------------------
// SYNC OUTBOX ENGINE
// ---------------------------------------------------------------------------

export const SYNC_BATCH_SIZE = 50;
export const MAX_SYNC_RETRIES = 10;

let isSyncRunning = false;

/**
 * Deterministic 6-digit numeric device hash so two devices sharing the same shopSyncId
 * never produce colliding sync event IDs when both have local auto-increment outbox ID 1.
 */
function numericDeviceHash(deviceId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < deviceId.length; i++) {
    hash ^= deviceId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const sixDigit = (Math.abs(hash) % 900000) + 100000;
  return String(sixDigit);
}

/**
 * Builds a globally unique, deterministic, idempotent event ID for hospivo_sync_events
 * so multiple devices with local auto-increment IDs never collide or overwrite each other.
 */
export function buildSyncEventId(
  shopSyncId: string,
  item: Pick<SyncOutboxItem, 'id' | 'entityType' | 'entityId'>,
  deviceId?: string
): string {
  const baseSuffix = String(item.id ?? Date.now());
  const suffix = deviceId ? `${numericDeviceHash(deviceId)}${baseSuffix}` : baseSuffix;
  return `${shopSyncId}:${item.entityType}:${item.entityId}:${suffix}`;
}

/**
 * Resets all dead-lettered ('failed') items in db.syncOutbox back to 'pending'
 * with retryCount = 0 and cleared lastError, returning the number of items reset.
 */
export async function retryFailedSyncItems(): Promise<number> {
  const failedItems = await db.syncOutbox.where('status').equals('failed').toArray();
  if (failedItems.length === 0) return 0;

  let resetCount = 0;
  await db.transaction('rw', db.syncOutbox, async () => {
    for (const item of failedItems) {
      if (item.id !== undefined) {
        await db.syncOutbox.update(item.id, {
          status: 'pending',
          retryCount: 0,
          lastError: undefined,
        });
        resetCount++;
      }
    }
  });

  return resetCount;
}

/**
 * Appends a record to the syncOutbox table whenever cloudEnabled is true.
 * Uses Dexie.ignoreTransaction so calls made inside another Dexie transaction
 * (e.g. finalizeBill, savePurchase, recordUdhaarPayment, createSupplierReturn)
 * ALWAYS enqueue reliably without throwing NotFoundError or blocking offline writes.
 * Returns the created syncOutbox item ID, or null if cloud mode is disabled.
 */
export async function enqueueSyncItem(
  entityType: SyncEntityType,
  entityId: string | number,
  payload: unknown
): Promise<number | null> {
  if (entityType !== 'audit') {
    scheduleAutoBackupAfterChange();
  }
  return await Dexie.ignoreTransaction(async () => {
    const config = await getCloudConfig();
    if (!config.cloudEnabled) {
      return null;
    }

    const id = await db.syncOutbox.add({
      entityType,
      entityId: String(entityId),
      payloadJson: JSON.stringify(payload),
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });

    // When offline, stay 100% local-first: record offline status silently & wait for reconnect
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await db.settings.put({ key: 'last_cloud_sync_status', value: 'offline' });
      emitSyncApplied(['sync_status']);
      return id as number;
    }

    // Non-blocking silent sync cycle trigger whenever backend or custom REST is configured
    if (isBackendConfigured() || (config.cloudUrl && config.cloudAnonKey)) {
      runSyncCycle().catch(() => { });
    }

    return id as number;
  });
}

// ---------------------------------------------------------------------------
// CLOUD STORAGE FOR PHOTOS
// ---------------------------------------------------------------------------

/**
 * Uploads an invoice or counter photo to the Supabase storage bucket 'hospivo-photos'
 * at `${cloudShopUuid}/${path}`. Gracefully returns null on network error or offline.
 */
export async function uploadShopPhoto(
  path: string,
  base64OrBlob: string | Blob
): Promise<string | null> {
  if (!isBackendConfigured()) return null;

  try {
    const session = await getCurrentCloudSession();
    const cloudShopUuid = session.cloudShopUuid;
    if (!cloudShopUuid) return null;

    let blob: Blob;
    if (typeof base64OrBlob === 'string') {
      if (base64OrBlob.startsWith('data:')) {
        const parts = base64OrBlob.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        blob = new Blob([u8arr], { type: mime });
      } else {
        blob = new Blob([base64OrBlob], { type: 'image/jpeg' });
      }
    } else {
      blob = base64OrBlob;
    }

    const cleanPath = `${cloudShopUuid}/${path.replace(/^\/+/, '')}`;
    const { error } = await supabase.storage
      .from('hospivo-photos')
      .upload(cleanPath, blob, { upsert: true });

    if (error) {
      console.warn('uploadShopPhoto storage error:', error);
      return null;
    }

    const { data: pubData } = supabase.storage
      .from('hospivo-photos')
      .getPublicUrl(cleanPath);

    return pubData?.publicUrl || cleanPath;
  } catch (err) {
    console.warn('uploadShopPhoto exception:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// DELTA SYNC ENGINE (TWO-WAY DELTAS)
// ---------------------------------------------------------------------------

/**
 * Converts a createdAt timestamp (ISO string, number, or Date) to a numeric epoch millisecond integer.
 */
export function toClientCreatedAtEpochMs(val: unknown): number {
  if (typeof val === 'number') {
    return Math.trunc(val);
  }
  const parsed = Date.parse(String(val));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : Date.now();
}

/**
 * Safely parses event.client_created_at which can be either a numeric bigint epoch ms or an ISO string.
 */
export function parseEventCreatedAt(val: unknown): string {
  if (typeof val === 'number') {
    return new Date(val).toISOString();
  }
  if (typeof val === 'string') {
    if (/^\d+$/.test(val.trim())) {
      const num = Number(val);
      if (Number.isFinite(num) && num > 0) {
        return new Date(num).toISOString();
      }
    }
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed) && parsed > 0) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

/**
 * Helper to idempotently insert a single StockMovement without duplicating or
 * colliding on local auto-increment IDs across devices.
 */
async function applyRemoteStockMovement(movement: StockMovement): Promise<void> {
  if (!movement || !movement.at || !movement.batchId) return;

  const naturalDup = await db.stockMovements
    .where('batchId')
    .equals(Number(movement.batchId))
    .filter(
      (m) =>
        m.at === movement.at &&
        m.qtyUnits === movement.qtyUnits &&
        m.type === movement.type &&
        (m.reference || '') === (movement.reference || '')
    )
    .first();
  if (naturalDup) return;

  if (movement.id !== undefined && movement.id !== null) {
    const byId = await db.stockMovements.get(Number(movement.id));
    if (byId) {
      // Different movement already holds this local auto-increment ID -> insert without conflicting id
      const { id: _ignored, ...rest } = movement;
      await db.stockMovements.add(rest);
      return;
    }
    await db.stockMovements.put({ ...movement, id: Number(movement.id) });
  } else {
    await db.stockMovements.add(movement);
  }
}

/**
 * Deduplicates local db.users rows so switching modes or syncing across devices
 * never leaves duplicate staff/owner profiles (e.g. duplicate "Suraj Dev").
 */
export async function deduplicateLocalUsers(): Promise<number> {
  const allUsers = await db.users.toArray();
  if (allUsers.length <= 1) return 0;

  const groups = new Map<string, DBUser[]>();
  for (const user of allUsers) {
    const normName = (user.name || '').trim().toLowerCase();
    const key =
      user.role === 'owner'
        ? 'owner'
        : normName
          ? `${user.role}:${normName}`
          : `id:${user.id}`;
    const list = groups.get(key) || [];
    list.push(user);
    groups.set(key, list);
  }

  let removedCount = 0;
  for (const [, list] of groups) {
    if (list.length <= 1) continue;

    // Pick canonical row: prefer 'owner' id for owner, then authUserId, then active, then newest createdAt
    list.sort((a, b) => {
      if (a.role === 'owner') {
        if (a.id === 'owner' && b.id !== 'owner') return -1;
        if (b.id === 'owner' && a.id !== 'owner') return 1;
      }
      const aAuth = a.authUserId ? 1 : 0;
      const bAuth = b.authUserId ? 1 : 0;
      if (aAuth !== bAuth) return bAuth - aAuth;
      const aActive = a.active !== false ? 1 : 0;
      const bActive = b.active !== false ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aTime = Date.parse(a.createdAt || '') || 0;
      const bTime = Date.parse(b.createdAt || '') || 0;
      if (aTime !== bTime) return bTime - aTime;
      return b.id.localeCompare(a.id);
    });

    const duplicates = list.slice(1);
    for (const dup of duplicates) {
      await db.users.delete(dup.id);
      removedCount++;
    }
  }

  return removedCount;
}

/**
 * Applies a single delta event pulled from hospivo_sync_events to local Dexie tables idempotently.
 */
export async function applyRemoteEvent(event: any): Promise<void> {
  if (!event) return;

  let payload = event.payload;
  if (!payload && event.payload_json) {
    try {
      payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
    } catch {
      payload = event.payload_json;
    }
  }
  if (!payload) return;

  const entityType = event.entity_type as SyncEntityType | 'device' | 'device_revoked';

  if (entityType === 'device_revoked') {
    const revokedId = String(payload.deviceId || payload.device_id || event.entity_id || '').trim();
    if (revokedId) {
      const currentDeviceId = (await getCloudConfig()).deviceId;
      if (revokedId === currentDeviceId) {
        await wipeDeviceOnRemoteRevocation();
        return;
      }
      const cacheItem = await db.settings.get('connected_devices_cache');
      const existingList = Array.isArray(cacheItem?.value) ? (cacheItem.value as ConnectedDeviceInfo[]) : [];
      await db.settings.put({
        key: 'connected_devices_cache',
        value: existingList.filter((d) => d.deviceId !== revokedId),
      });
      emitSyncApplied(['device']);
    }
    return;
  }

  if (entityType === 'device') {
    const devId = String(payload.deviceId || event.device_id || event.entity_id || '').trim();
    if (devId) {
      const cacheItem = await db.settings.get('connected_devices_cache');
      const existingList = Array.isArray(cacheItem?.value) ? (cacheItem.value as ConnectedDeviceInfo[]) : [];
      const currentDeviceId = (await getCloudConfig()).deviceId;
      const entry: ConnectedDeviceInfo = {
        deviceId: devId,
        deviceName: String(payload.deviceName || 'Billing Desk'),
        platform: String(payload.platform || 'Web / Desktop'),
        lastSeenAt: String(payload.lastSeenAt || event.created_at || new Date().toISOString()),
        isCurrentDevice: devId === currentDeviceId,
      };
      const merged = [entry, ...existingList.filter((d) => d.deviceId !== devId)];
      await db.settings.put({ key: 'connected_devices_cache', value: merged });
      emitSyncApplied(['device']);
    }
    return;
  }

  switch (entityType) {
    case 'medicine': {
      const med = (payload.medicine || payload) as Medicine;
      if (med && (med.name || med.id)) {
        let matched: Medicine | undefined;
        if (med.shortCode) {
          matched = await db.medicines.where('shortCode').equals(med.shortCode).first();
        }
        if (!matched && med.barcode) {
          matched = await db.medicines.where('barcode').equals(med.barcode).first();
        }
        if (!matched && med.id !== undefined && med.id !== null) {
          const byId = await db.medicines.get(Number(med.id));
          if (byId) {
            const sameIdentity =
              !med.name ||
              byId.name.trim().toLowerCase() === med.name.trim().toLowerCase() ||
              (med.shortCode && byId.shortCode === med.shortCode) ||
              (med.barcode && byId.barcode === med.barcode) ||
              (med.name && byId.name && (med.name.toLowerCase().includes(byId.name.toLowerCase()) || byId.name.toLowerCase().includes(med.name.toLowerCase())));
            if (sameIdentity) {
              matched = byId;
            }
          }
        }
        if (!matched && med.name) {
          const normName = med.name.trim().toLowerCase();
          const normStrength = (med.strength || '').trim().toLowerCase();
          const normForm = (med.form || '').trim().toLowerCase();
          matched = await db.medicines
            .filter(
              (m) =>
                m.name.trim().toLowerCase() === normName &&
                (m.strength || '').trim().toLowerCase() === normStrength &&
                (m.form || '').trim().toLowerCase() === normForm
            )
            .first();
        }

        if (matched && matched.id !== undefined) {
          await db.medicines.update(matched.id, { ...med, id: matched.id });
        } else if (med.id !== undefined && med.id !== null) {
          const occupied = await db.medicines.get(Number(med.id));
          if (occupied) {
            const { id: _ignored, ...rest } = med;
            await db.medicines.add(rest);
          } else {
            await db.medicines.put({ ...med, id: Number(med.id) });
          }
        } else {
          await db.medicines.add(med);
        }
      }
      break;
    }

    case 'batch': {
      const batch = (payload.batch || payload) as Batch;
      if (batch && batch.batchNo) {
        const existing = await db.batches
          .where('batchNo')
          .equals(batch.batchNo)
          .filter((b) => b.medicineId === Number(batch.medicineId))
          .first();
        if (existing && existing.id !== undefined) {
          await db.batches.update(existing.id, { ...batch, id: existing.id });
        } else if (batch.id !== undefined && batch.id !== null) {
          const occupied = await db.batches.get(Number(batch.id));
          if (occupied) {
            const { id: _ignored, ...rest } = batch;
            await db.batches.add(rest);
          } else {
            await db.batches.put({ ...batch, id: Number(batch.id) });
          }
        } else {
          await db.batches.add(batch);
        }
      }
      break;
    }

    case 'supplier': {
      const supp = (payload.supplier || payload) as Supplier;
      if (supp && supp.name) {
        const normName = supp.name.trim().toLowerCase();
        let matched = supp.id !== undefined && supp.id !== null ? await db.suppliers.get(Number(supp.id)) : undefined;
        if (matched && matched.name.trim().toLowerCase() !== normName) {
          matched = undefined;
        }
        if (!matched) {
          matched = await db.suppliers
            .filter((s) => s.name.trim().toLowerCase() === normName)
            .first();
        }
        if (matched && matched.id !== undefined) {
          await db.suppliers.update(matched.id, { ...supp, id: matched.id });
        } else if (supp.id !== undefined && supp.id !== null) {
          const occupied = await db.suppliers.get(Number(supp.id));
          if (occupied) {
            const { id: _ignored, ...rest } = supp;
            await db.suppliers.add(rest);
          } else {
            await db.suppliers.put({ ...supp, id: Number(supp.id) });
          }
        } else {
          await db.suppliers.add(supp);
        }
      }
      break;
    }

    case 'customer': {
      const cust = (payload.customer || payload) as Customer;
      if (cust && cust.name) {
        const cleanPhone = (cust.phone || '').trim();
        let matched: Customer | undefined;
        if (cleanPhone) {
          matched = await db.customers.where('phone').equals(cleanPhone).first();
        }
        if (!matched && cust.id !== undefined && cust.id !== null) {
          const byId = await db.customers.get(Number(cust.id));
          if (byId && (!cleanPhone || !byId.phone || byId.phone.trim() === cleanPhone)) {
            matched = byId;
          }
        }
        if (matched && matched.id !== undefined) {
          await db.customers.update(matched.id, { ...cust, id: matched.id });
        } else if (cust.id !== undefined && cust.id !== null) {
          const occupied = await db.customers.get(Number(cust.id));
          if (occupied) {
            const { id: _ignored, ...rest } = cust;
            await db.customers.add(rest);
          } else {
            await db.customers.put({ ...cust, id: Number(cust.id) });
          }
        } else {
          await db.customers.add(cust);
        }
      }
      break;
    }

    case 'staff': {
      const user = (payload.user || payload) as DBUser & { approvalPin?: { hash: string; salt: string } };
      if (user && user.id) {
        const incomingId = String(user.id);
        const existing = await db.users.get(incomingId);
        const role = user.role || (incomingId === 'owner' ? 'owner' : 'cashier');
        const name = (user.name || (incomingId === 'owner' ? 'Owner' : 'Staff')).trim();
        const normName = name.toLowerCase();

        // Deduplicate against any existing user with a different ID representing the same person
        const allUsers = await db.users.toArray();
        const duplicatesToMerge = allUsers.filter((other) => {
          if (other.id === incomingId) return false;
          if (role === 'owner' && other.role === 'owner') return true;
          if (user.authUserId && other.authUserId && other.authUserId === user.authUserId) return true;
          if (normName && other.role === role && other.name.trim().toLowerCase() === normName) return true;
          return false;
        });

        const mergedAuthUserId =
          user.authUserId ||
          existing?.authUserId ||
          duplicatesToMerge.find((d) => d.authUserId)?.authUserId;

        const userData: DBUser = {
          id: incomingId,
          name,
          role,
          pinHash: user.pinHash || existing?.pinHash || duplicatesToMerge[0]?.pinHash || '',
          pinSalt: user.pinSalt || existing?.pinSalt || duplicatesToMerge[0]?.pinSalt || '',
          pinLength: user.pinLength || existing?.pinLength || 4,
          active: user.active !== false,
          createdAt:
            user.createdAt ||
            existing?.createdAt ||
            (event.client_created_at ? parseEventCreatedAt(event.client_created_at) : new Date().toISOString()),
          ...(mergedAuthUserId ? { authUserId: mergedAuthUserId } : {}),
        };

        for (const dup of duplicatesToMerge) {
          await db.users.delete(dup.id);
        }

        if (existing) {
          await db.users.update(incomingId, userData);
        } else {
          await db.users.put(userData);
        }

        // Update placeholder shop ownerName when real owner user arrives
        if (role === 'owner' && name && name !== 'Owner') {
          const shops = await db.shop.toArray();
          if (shops.length > 0 && shops[0].id && (!shops[0].ownerName || shops[0].ownerName === 'Owner')) {
            await db.shop.update(shops[0].id, { ownerName: name });
          }
        }

        // Restore approval PIN if bundled with owner user and local approval PIN is not yet set
        if (user.approvalPin && user.approvalPin.hash && user.approvalPin.salt) {
          const localApproval = await db.settings.get('approval_pin');
          if (!localApproval) {
            await db.settings.put({ key: 'approval_pin', value: user.approvalPin });
          }
        }
      }
      break;
    }

    case 'bill': {
      const bill = (payload.bill || payload) as Bill;
      const items = payload.items as BillItem[] | undefined;
      const movements = payload.movements as StockMovement[] | undefined;
      if (bill && (bill.id || bill.billNo)) {
        let existing: Bill | undefined;
        if (bill.billNo) {
          existing = await db.bills.where('billNo').equals(bill.billNo).first();
        }
        if (!existing && bill.id !== undefined && bill.id !== null) {
          const byId = await db.bills.get(Number(bill.id));
          if (byId && (!bill.billNo || byId.billNo === bill.billNo)) {
            existing = byId;
          }
        }

        let targetBillId: number | undefined;
        if (existing && existing.id !== undefined) {
          targetBillId = existing.id;
          // Bills are immutable once finalized except status transitions to returned_partial / returned_full
          if (
            bill.status &&
            bill.status !== existing.status &&
            (bill.status === 'returned_partial' || bill.status === 'returned_full')
          ) {
            await db.bills.update(existing.id, { status: bill.status });
          }
        } else {
          if (bill.id !== undefined && bill.id !== null) {
            const occupied = await db.bills.get(Number(bill.id));
            if (occupied) {
              const { id: _ignored, ...billWithoutId } = bill;
              targetBillId = Number(await db.bills.add(billWithoutId));
            } else {
              targetBillId = Number(await db.bills.put({ ...bill, id: Number(bill.id) }));
            }
          } else {
            targetBillId = Number(await db.bills.add(bill));
          }
        }

        if (Array.isArray(items) && targetBillId !== undefined) {
          const existingItems = await db.billItems.where('billId').equals(targetBillId).toArray();
          for (const itm of items) {
            const remapped: BillItem = { ...itm, billId: targetBillId };
            const dupItem = existingItems.find(
              (ei) =>
                ei.medicineId === remapped.medicineId &&
                ei.batchId === remapped.batchId &&
                ei.qtyUnits === remapped.qtyUnits &&
                ei.lineTotalPaise === remapped.lineTotalPaise
            );
            if (dupItem) continue;

            if (remapped.id !== undefined && remapped.id !== null) {
              const occupiedItem = await db.billItems.get(Number(remapped.id));
              if (occupiedItem) {
                const { id: _ignored, ...itemWithoutId } = remapped;
                await db.billItems.add(itemWithoutId);
              } else {
                await db.billItems.put({ ...remapped, id: Number(remapped.id) });
              }
            } else {
              await db.billItems.add(remapped);
            }
          }
        }

        if (Array.isArray(movements)) {
          for (const mv of movements) {
            await applyRemoteStockMovement(mv);
          }
        }
      }
      break;
    }

    case 'bill_return': {
      const ret = (payload.billReturn || payload) as BillReturn;
      const movements = payload.movements as StockMovement[] | undefined;
      if (ret && (ret.id || ret.returnNo)) {
        let existing: BillReturn | undefined;
        if (ret.returnNo) {
          existing = await db.billReturns.where('returnNo').equals(ret.returnNo).first();
        }
        if (!existing && ret.id !== undefined && ret.id !== null) {
          const byId = await db.billReturns.get(Number(ret.id));
          if (byId && (!ret.returnNo || byId.returnNo === ret.returnNo)) {
            existing = byId;
          }
        }

        if (!existing) {
          const recordToSave: BillReturn = {
            ...ret,
            originalBillNo: ret.originalBillNo || '',
            itemsJson: ret.itemsJson || '[]',
            reason: ret.reason || 'Customer return',
            approvedBy: ret.approvedBy || 'Owner',
            createdAt: ret.createdAt || new Date().toISOString(),
          };
          if (recordToSave.id !== undefined && recordToSave.id !== null) {
            const occupied = await db.billReturns.get(Number(recordToSave.id));
            if (occupied) {
              const { id: _ignored, ...rest } = recordToSave;
              await db.billReturns.add(rest);
            } else {
              await db.billReturns.put({ ...recordToSave, id: Number(recordToSave.id) });
            }
          } else {
            await db.billReturns.add(recordToSave);
          }
        }

        // Update original bill status if provided
        const newBillStatus = payload.newBillStatus as Bill['status'] | undefined;
        if (newBillStatus === 'returned_partial' || newBillStatus === 'returned_full') {
          let origBill: Bill | undefined;
          if (ret.originalBillNo) {
            origBill = await db.bills.where('billNo').equals(ret.originalBillNo).first();
          }
          if (!origBill && ret.originalBillId) {
            origBill = await db.bills.get(Number(ret.originalBillId));
          }
          if (origBill && origBill.id !== undefined && origBill.status !== newBillStatus) {
            await db.bills.update(origBill.id, { status: newBillStatus });
          }
        }

        if (Array.isArray(movements)) {
          for (const mv of movements) {
            await applyRemoteStockMovement(mv);
          }
        }
      }
      break;
    }

    case 'purchase': {
      const rawPurchase = (payload.purchase || payload) as Purchase & { purchaseId?: number };
      const lines = payload.lines as PurchaseLine[] | undefined;
      const movements = payload.movements as StockMovement[] | undefined;
      const resolvedId = rawPurchase?.id ?? rawPurchase?.purchaseId;
      if (rawPurchase && (resolvedId || rawPurchase.invoiceNo)) {
        const purchaseRecord: Purchase = {
          ...(resolvedId !== undefined ? { id: Number(resolvedId) } : {}),
          supplierId: Number(rawPurchase.supplierId || 0),
          invoiceNo: rawPurchase.invoiceNo || '',
          date: rawPurchase.date || new Date().toISOString().slice(0, 10),
          invoicePhoto: rawPurchase.invoicePhoto || '',
          verified: Boolean(rawPurchase.verified),
          createdAt: rawPurchase.createdAt || new Date().toISOString(),
        };

        let existing: Purchase | undefined;
        if (purchaseRecord.invoiceNo) {
          existing = await db.purchases
            .where('invoiceNo')
            .equals(purchaseRecord.invoiceNo)
            .filter((p) => p.supplierId === purchaseRecord.supplierId && p.date === purchaseRecord.date)
            .first();
        }
        if (!existing && purchaseRecord.id !== undefined) {
          const byId = await db.purchases.get(purchaseRecord.id);
          if (byId && (!purchaseRecord.invoiceNo || byId.invoiceNo === purchaseRecord.invoiceNo)) {
            existing = byId;
          }
        }

        let targetPurchaseId: number | undefined;
        if (existing && existing.id !== undefined) {
          targetPurchaseId = existing.id;
          await db.purchases.update(existing.id, { ...purchaseRecord, id: existing.id });
        } else if (purchaseRecord.id !== undefined) {
          const occupied = await db.purchases.get(purchaseRecord.id);
          if (occupied) {
            const { id: _ignored, ...rest } = purchaseRecord;
            targetPurchaseId = Number(await db.purchases.add(rest));
          } else {
            targetPurchaseId = Number(await db.purchases.put(purchaseRecord));
          }
        } else {
          targetPurchaseId = Number(await db.purchases.add(purchaseRecord));
        }

        if (Array.isArray(lines) && targetPurchaseId !== undefined) {
          const existingLines = await db.purchaseLines.where('purchaseId').equals(targetPurchaseId).toArray();
          for (const line of lines) {
            const remapped: PurchaseLine = { ...line, purchaseId: targetPurchaseId };
            const dupLine = existingLines.find(
              (el) =>
                el.medicineId === remapped.medicineId &&
                el.batchNo === remapped.batchNo &&
                el.packs === remapped.packs &&
                el.freePacks === remapped.freePacks
            );
            if (dupLine) continue;

            if (remapped.id !== undefined && remapped.id !== null) {
              const occupiedLine = await db.purchaseLines.get(Number(remapped.id));
              if (occupiedLine) {
                const { id: _ignored, ...rest } = remapped;
                await db.purchaseLines.add(rest);
              } else {
                await db.purchaseLines.put({ ...remapped, id: Number(remapped.id) });
              }
            } else {
              await db.purchaseLines.add(remapped);
            }
          }
        }

        if (Array.isArray(movements)) {
          for (const mv of movements) {
            await applyRemoteStockMovement(mv);
          }
        }
      }
      break;
    }

    case 'stock_movement': {
      const movement = (payload.movement || payload) as StockMovement;
      if (movement && movement.at && movement.batchId) {
        await applyRemoteStockMovement(movement);
      }
      const supRet = payload.supplierReturn as SupplierReturn | undefined;
      if (supRet && supRet.batchId && supRet.medicineId) {
        const existingRet = supRet.id !== undefined ? await db.supplierReturns.get(Number(supRet.id)) : undefined;
        if (existingRet && existingRet.id !== undefined) {
          await db.supplierReturns.update(existingRet.id, { ...supRet, id: existingRet.id });
        } else {
          const naturalRet = await db.supplierReturns
            .where('batchId')
            .equals(Number(supRet.batchId))
            .filter((r) => r.createdAt === supRet.createdAt && r.qtyUnits === supRet.qtyUnits)
            .first();
          if (naturalRet && naturalRet.id !== undefined) {
            await db.supplierReturns.update(naturalRet.id, { ...supRet, id: naturalRet.id });
          } else if (supRet.id !== undefined) {
            await db.supplierReturns.put({ ...supRet, id: Number(supRet.id) });
          } else {
            await db.supplierReturns.add(supRet);
          }
        }
      }
      break;
    }

    case 'udhaar_payment': {
      const payment = (payload.payment || payload) as UdhaarPayment;
      if (payment && (payment.id || payment.createdAt)) {
        const naturalDup = await db.udhaarPayments
          .where('customerPhone')
          .equals(payment.customerPhone || '')
          .filter(
            (p) =>
              p.amountPaise === payment.amountPaise &&
              p.createdAt === payment.createdAt &&
              p.mode === payment.mode
          )
          .first();
        if (!naturalDup) {
          if (payment.id !== undefined && payment.id !== null) {
            const occupied = await db.udhaarPayments.get(Number(payment.id));
            if (occupied) {
              const { id: _ignored, ...rest } = payment;
              await db.udhaarPayments.add(rest);
            } else {
              await db.udhaarPayments.put({ ...payment, id: Number(payment.id) });
            }
          } else {
            await db.udhaarPayments.add(payment);
          }
        }
      }
      break;
    }

    case 'daily_closing': {
      const closing = (payload.closing || payload) as DailyClosing;
      if (closing && (closing.id || closing.date)) {
        let existing: DailyClosing | undefined;
        if (closing.date) {
          existing = await db.dailyClosings.where('date').equals(closing.date).first();
        }
        if (!existing && closing.id !== undefined && closing.id !== null) {
          existing = await db.dailyClosings.get(Number(closing.id));
        }
        if (existing && existing.id !== undefined) {
          await db.dailyClosings.update(existing.id, { ...closing, id: existing.id });
        } else if (closing.id !== undefined && closing.id !== null) {
          await db.dailyClosings.put({ ...closing, id: Number(closing.id) });
        } else {
          await db.dailyClosings.add(closing);
        }
      }
      break;
    }

    case 'audit': {
      const audit = payload.audit || payload;
      if (audit && audit.timestamp && audit.action) {
        const naturalDup = await db.auditLog
          .where('timestamp')
          .equals(audit.timestamp)
          .filter((a) => a.action === audit.action && a.who === audit.who && a.record === audit.record)
          .first();
        if (!naturalDup) {
          if (audit.id !== undefined && audit.id !== null) {
            const occupied = await db.auditLog.get(Number(audit.id));
            if (occupied) {
              const { id: _ignored, ...rest } = audit;
              await db.auditLog.add(rest);
            } else {
              await db.auditLog.put({ ...audit, id: Number(audit.id) });
            }
          } else {
            await db.auditLog.add(audit);
          }
        }
      }
      break;
    }

    case 'approval_request': {
      const req = (payload.request || payload) as ApprovalRequest;
      if (req && req.id) {
        const existing = await db.approvalRequests.get(Number(req.id));
        if (existing) {
          await db.approvalRequests.update(Number(req.id), req);
        } else {
          await db.approvalRequests.put(req);
        }
      }
      break;
    }

    case 'shop': {
      const incomingShop = payload.shop || payload;
      if (incomingShop && incomingShop.name) {
        const localShops = await db.shop.toArray();
        const safeUpdates = {
          name: incomingShop.name,
          ...(incomingShop.ownerName !== undefined ? { ownerName: incomingShop.ownerName } : {}),
          ...(incomingShop.address !== undefined ? { address: incomingShop.address } : {}),
          ...(incomingShop.phone !== undefined ? { phone: incomingShop.phone } : {}),
          ...(incomingShop.gstNo !== undefined ? { gstNo: incomingShop.gstNo } : {}),
          ...(incomingShop.drugLicenceNos !== undefined ? { drugLicenceNos: incomingShop.drugLicenceNos } : {}),
        };
        if (localShops.length > 0 && localShops[0].id !== undefined) {
          await db.shop.update(localShops[0].id, safeUpdates);
        }
      }
      break;
    }

    case 'settings': {
      // Allowlist only shared store settings (never overwrite device-local sync/snapshot/handle keys)
      const SHARED_SETTING_KEYS = new Set([
        'discount_limit',
        'auto_lock_minutes',
        'approval_rules',
        'pinLength',
        'fullscreenOnLogin',
        'language',
      ]);
      const key = String(payload.key || event.entity_id || '');
      if (SHARED_SETTING_KEYS.has(key) && payload.value !== undefined) {
        await db.settings.put({ key, value: payload.value });
      }
      break;
    }
  }
}

/**
 * Pulls remote delta events from hospivo_sync_events in pages of 200, applies them idempotently,
 * and advances lastPulledSeq in local settings and shop.
 */
export async function pullRemoteEvents(
  config: CloudConfig,
  cloudShopUuid: string
): Promise<{ pulledCount: number; lastSeq: number }> {
  if (!isBackendConfigured() || !cloudShopUuid) {
    return { pulledCount: 0, lastSeq: 0 };
  }

  const seqItem = await db.settings.get('last_pulled_seq');
  let currentSeq = typeof seqItem?.value === 'number' ? seqItem.value : 0;
  let totalPulled = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const queryPromise = supabase
        .from('hospivo_sync_events')
        .select('*')
        .eq('shop_id', cloudShopUuid)
        .gt('seq', currentSeq)
        .order('seq', { ascending: true })
        .limit(200);

      const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('Pull sync timeout')), 4000)
      );

      const { data, error } = (await Promise.race([queryPromise, timeoutPromise])) as any;

      if (error) {
        console.warn('pullRemoteEvents query error:', error);
        break;
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      const appliedTypes = new Set<string>();
      for (const event of data) {
        const isSameDevice =
          Boolean(config.deviceId && event.device_id && event.device_id === config.deviceId);

        // CRITICAL: For staff/user records, or if the entity does NOT exist locally in Dexie,
        // apply it even if device tags match (e.g. multi-device with same name, or cleared db).
        let shouldApply = !isSameDevice;
        if (!shouldApply && event.entity_type === 'staff') {
          const localUser = await db.users.get(String(event.entity_id));
          if (!localUser) {
            shouldApply = true;
          }
        }

        if (shouldApply) {
          try {
            await applyRemoteEvent(event);
            if (event.entity_type) {
              appliedTypes.add(String(event.entity_type));
            }
          } catch (applyErr) {
            console.warn('Failed to apply remote event:', applyErr);
          }
        }

        if (typeof event.seq === 'number' && event.seq > currentSeq) {
          currentSeq = event.seq;
        }
      }

      if (appliedTypes.has('staff')) {
        await deduplicateLocalUsers().catch(() => { });
      }
      if (appliedTypes.size > 0) {
        emitSyncApplied(Array.from(appliedTypes));
      }

      totalPulled += data.length;
      if (data.length < 200) {
        hasMore = false;
      }
    } catch (err) {
      console.warn('pullRemoteEvents fetch error:', err);
      break;
    }
  }

  await db.settings.put({ key: 'last_pulled_seq', value: currentSeq });

  try {
    const shops = await db.shop.toArray();
    if (shops.length > 0 && shops[0].id) {
      await db.shop.update(shops[0].id, { lastPulledSeq: currentSeq });
    }
  } catch (shopErr) {
    console.warn('Could not update shop.lastPulledSeq:', shopErr);
  }

  return { pulledCount: totalPulled, lastSeq: currentSeq };
}

/**
 * Pushes pending local approval requests and pulls remote updates or new incoming requests.
 */
export async function syncApprovalRequests(
  config: CloudConfig,
  cloudShopUuid?: string | null
): Promise<void> {
  if (isBackendConfigured() && cloudShopUuid) {
    try {
      // 1. Push pending local requests
      const localRequests = await db.approvalRequests.toArray();
      if (localRequests.length > 0) {
        const payloadRows = localRequests.map((r) => ({
          id: r.id,
          shop_id: cloudShopUuid,
          shop_sync_id: config.shopSyncId,
          action_category: r.actionCategory,
          summary: r.summary,
          details_json: r.detailsJson,
          requested_by: r.requestedBy,
          status: r.status,
          resolved_by: r.resolvedBy,
          resolved_at: r.resolvedAt,
          created_at: r.createdAt,
        }));
        await supabase
          .from('hospivo_approval_requests')
          .upsert(payloadRows, { onConflict: 'id' });
      }

      // 2. Pull remote requests
      const { data: remoteRequests } = await supabase
        .from('hospivo_approval_requests')
        .select('*')
        .eq('shop_id', cloudShopUuid);

      if (Array.isArray(remoteRequests)) {
        for (const remote of remoteRequests) {
          const local = await db.approvalRequests.get(Number(remote.id));
          if (!local) {
            await db.approvalRequests.put({
              id: Number(remote.id),
              shopSyncId: remote.shop_sync_id,
              actionCategory: remote.action_category,
              summary: remote.summary,
              detailsJson: remote.details_json,
              requestedBy: remote.requested_by,
              status: remote.status,
              resolvedBy: remote.resolved_by,
              resolvedAt: remote.resolved_at,
              createdAt: remote.created_at,
            });
          } else if (local.status === 'pending' && remote.status !== 'pending') {
            await db.approvalRequests.update(Number(remote.id), {
              status: remote.status,
              resolvedBy: remote.resolved_by || 'Remote Owner',
              resolvedAt: remote.resolved_at || new Date().toISOString(),
            });
          }
        }
      }
      return;
    } catch (err) {
      console.warn('syncApprovalRequests supabase error:', err);
    }
  }

  // Fallback to legacy REST pull for test mocking / unconfigured backend
  await pullRemoteApprovals(config);
}

function chunkOutboxItems<T>(items: T[], batchSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    chunks.push(items.slice(i, i + batchSize));
  }
  return chunks;
}

function buildSyncEventRows(
  chunk: SyncOutboxItem[],
  cloudShopUuid: string | null,
  shopSyncId: string,
  deviceId?: string
) {
  return chunk.map((item) => ({
    id: buildSyncEventId(shopSyncId, item, deviceId),
    shop_id: cloudShopUuid,
    shop_sync_id: shopSyncId,
    entity_type: item.entityType,
    entity_id: String(item.entityId),
    payload_json: item.payloadJson,
    client_created_at: toClientCreatedAtEpochMs(item.createdAt),
  }));
}

async function markChunkSynced(chunk: SyncOutboxItem[]): Promise<void> {
  const syncedAt = new Date().toISOString();
  await db.transaction('rw', db.syncOutbox, async () => {
    for (const item of chunk) {
      if (item.id !== undefined) {
        await db.syncOutbox.update(item.id, {
          status: 'synced',
          syncedAt,
        });
      }
    }
  });
}

async function markChunkFailed(chunk: SyncOutboxItem[], errMsg: string): Promise<void> {
  await db.transaction('rw', db.syncOutbox, async () => {
    for (const item of chunk) {
      if (item.id !== undefined) {
        const nextRetryCount = (item.retryCount || 0) + 1;
        await db.syncOutbox.update(item.id, {
          retryCount: nextRetryCount,
          status: nextRetryCount >= MAX_SYNC_RETRIES ? 'failed' : 'pending',
          lastError: errMsg,
        });
      }
    }
  });
}

async function handlePushFailure(
  chunk: SyncOutboxItem[],
  processedCount: number,
  errMsg: string
): Promise<SyncCycleResult> {
  await markChunkFailed(chunk, errMsg);
  await saveCloudConfig({
    lastStatus: 'failed',
    lastError: errMsg,
  });
  const [remainingPendingCount, totalFailedCount] = await Promise.all([
    db.syncOutbox.where('status').equals('pending').count(),
    db.syncOutbox.where('status').equals('failed').count(),
  ]);
  return {
    success: false,
    offline: false,
    processedCount,
    pendingCount: remainingPendingCount,
    failedCount: totalFailedCount,
    lastError: errMsg,
  };
}

/**
 * Runs a sync cycle, processing pending syncOutbox items in FIFO order in chunks of SYNC_BATCH_SIZE,
 * pulling remote delta events from hospivo_sync_events, and syncing approval requests.
 * Safe against network failures and offline conditions.
 */
export async function runSyncCycle(options?: {
  force?: boolean;
  loopbackTransport?: (items: SyncOutboxItem[]) => Promise<boolean>;
}): Promise<SyncCycleResult> {
  if (isSyncRunning) {
    let waitCount = 0;
    while (isSyncRunning && waitCount < 20) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waitCount++;
    }
  }

  isSyncRunning = true;

  try {
    const config = await getCloudConfig();
    if (!config.cloudEnabled) {
      return {
        success: true,
        offline: false,
        processedCount: 0,
        pendingCount: 0,
        failedCount: 0,
        lastError: null,
      };
    }

    const pendingItems = await db.syncOutbox.where('status').equals('pending').sortBy('id');
    const pendingCount = pendingItems.length;
    const existingFailedCount = await db.syncOutbox.where('status').equals('failed').count();

    // Check offline status
    const isOffline =
      typeof navigator !== 'undefined' &&
      navigator.onLine === false &&
      !options?.force &&
      !options?.loopbackTransport;

    if (isOffline) {
      await saveCloudConfig({ lastStatus: 'offline' });
      emitSyncApplied(['sync_status']);
      return {
        success: false,
        offline: true,
        processedCount: 0,
        pendingCount,
        failedCount: existingFailedCount,
        lastError: 'Device is offline',
      };
    }

    const chunks = chunkOutboxItems(pendingItems, SYNC_BATCH_SIZE);
    let processedCount = 0;

    // 1. Loopback test transport
    if (options?.loopbackTransport) {
      for (const chunk of chunks) {
        try {
          const ok = await options.loopbackTransport(chunk);
          if (!ok) {
            throw new Error('Loopback transport failed');
          }
          await markChunkSynced(chunk);
          processedCount += chunk.length;
        } catch (err: any) {
          return handlePushFailure(chunk, processedCount, err?.message || 'Loopback transport failed');
        }
      }

      const [remainingPendingCount, totalFailedCount] = await Promise.all([
        db.syncOutbox.where('status').equals('pending').count(),
        db.syncOutbox.where('status').equals('failed').count(),
      ]);
      await saveCloudConfig({
        lastCloudSyncAt: Date.now(),
        lastStatus: totalFailedCount > 0 ? 'failed' : 'synced',
        lastError: totalFailedCount > 0 ? config.lastError || 'Sync failed for one or more items' : null,
      });
      return {
        success: true,
        offline: false,
        processedCount,
        pendingCount: remainingPendingCount,
        failedCount: totalFailedCount,
        lastError: null,
      };
    }

    // Resolve cloud shop UUID & verify authenticated session / valid connection
    const session = await getCurrentCloudSession();
    const hasValidConnection =
      Boolean(session.isAuthenticated && session.user) ||
      Boolean(session.cloudShopUuid) ||
      Boolean(config.hasCustomRestConfig);

    if (!hasValidConnection) {
      return {
        success: false,
        offline: false,
        authRequired: true,
        processedCount: 0,
        pendingCount,
        failedCount: existingFailedCount,
        lastError: 'Sign in required to sync with cloud',
      };
    }

    let cloudShopUuid = session.cloudShopUuid;
    if (!cloudShopUuid && session.user) {
      try {
        const shops = await db.shop.toArray();
        const currentShopName = (shops[0]?.name || '').trim();
        if (currentShopName) {
          const prov = await provisionCloudShop(currentShopName, config.shopSyncId);
          cloudShopUuid = prov.shopUuid;
        }
      } catch (provErr) {
        console.warn('Auto-provision shop warning:', provErr);
      }
    }

    // 2. Remote push phase (chunked sequentially by SYNC_BATCH_SIZE)
    if (pendingCount > 0) {
      if (isBackendConfigured() && cloudShopUuid) {
        for (const chunk of chunks) {
          try {
            const events = buildSyncEventRows(chunk, cloudShopUuid, config.shopSyncId, config.deviceId);

            let pushError: any = null;
            try {
              const { error } = await supabase
                .from('hospivo_sync_events')
                .upsert(events, { onConflict: 'id', ignoreDuplicates: true });
              pushError = error;
            } catch (e) {
              pushError = e;
            }

            if (pushError) {
              const { error: insertErr } = await supabase
                .from('hospivo_sync_events')
                .insert(events);
              if (insertErr) throw insertErr;
            }

            await markChunkSynced(chunk);
            processedCount += chunk.length;
          } catch (pushErr: any) {
            return handlePushFailure(chunk, processedCount, pushErr?.message || 'Sync push network error');
          }
        }
      } else if (config.hasCustomRestConfig && config.cloudUrl && config.cloudAnonKey) {
        // Fallback REST fetch transport
        const cleanUrl = config.cloudUrl.replace(/\/+$/, '');
        const endpoint = `${cleanUrl}/rest/v1/hospivo_sync_events`;

        for (const chunk of chunks) {
          try {
            const events = buildSyncEventRows(chunk, cloudShopUuid, config.shopSyncId, config.deviceId);

            const resp = await fetch(endpoint, {
              method: 'POST',
              headers: {
                apikey: config.cloudAnonKey,
                Authorization: `Bearer ${config.cloudAnonKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify(events),
            });

            if (!resp.ok) {
              throw new Error(`Sync server responded with ${resp.status}`);
            }

            await markChunkSynced(chunk);
            processedCount += chunk.length;
          } catch (err: any) {
            return handlePushFailure(chunk, processedCount, err?.message || 'Sync network error');
          }
        }
      }
    }

    // 3. Remote pull phase (pull remote deltas & approvals)
    if (cloudShopUuid) {
      await pullRemoteEvents(config, cloudShopUuid).catch(() => { });
      void registerCurrentDeviceInCloud().catch(() => { });
    }
    await syncApprovalRequests(config, cloudShopUuid).catch(() => { });

    const [remainingPendingCount, totalFailedCount] = await Promise.all([
      db.syncOutbox.where('status').equals('pending').count(),
      db.syncOutbox.where('status').equals('failed').count(),
    ]);

    await saveCloudConfig({
      lastCloudSyncAt: Date.now(),
      lastStatus: totalFailedCount > 0 ? 'failed' : 'synced',
      lastError: totalFailedCount > 0 ? config.lastError || 'Sync failed for one or more items' : null,
    });

    if (processedCount > 0 || config.lastStatus === 'offline') {
      emitSyncApplied(['sync_status']);
    }

    return {
      success: true,
      offline: false,
      processedCount,
      pendingCount: remainingPendingCount,
      failedCount: totalFailedCount,
      lastError: null,
    };
  } finally {
    isSyncRunning = false;
  }
}

/**
 * Pulls resolved approvals from remote Supabase table if available (legacy fallback).
 */
async function pullRemoteApprovals(config: CloudConfig): Promise<void> {
  if (!config.cloudUrl || !config.cloudAnonKey) return;

  try {
    const cleanUrl = config.cloudUrl.replace(/\/+$/, '');
    const endpoint = `${cleanUrl}/rest/v1/hospivo_approval_requests?shop_sync_id=eq.${encodeURIComponent(
      config.shopSyncId
    )}&select=*`;

    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: config.cloudAnonKey,
        Authorization: `Bearer ${config.cloudAnonKey}`,
        Accept: 'application/json',
      },
    });

    if (resp.ok) {
      const remoteRequests: any[] = await resp.json();
      if (Array.isArray(remoteRequests)) {
        for (const remote of remoteRequests) {
          const local = await db.approvalRequests.get(remote.id);
          if (local && local.status === 'pending' && remote.status !== 'pending') {
            await db.approvalRequests.update(remote.id, {
              status: remote.status,
              resolvedBy: remote.resolved_by || 'Remote Owner',
              resolvedAt: remote.resolved_at || new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch {
    // Non-fatal if pulling remote approvals fails
  }
}

// ---------------------------------------------------------------------------
// REMOTE APPROVALS ENGINE
// ---------------------------------------------------------------------------

/**
 * Creates a remote approval request and enqueues it to the sync outbox.
 */
export async function createRemoteApprovalRequest(params: {
  actionCategory: string;
  summary: string;
  details?: unknown;
  requestedBy: string;
}): Promise<ApprovalRequest> {
  const config = await getCloudConfig();

  const request: ApprovalRequest = {
    shopSyncId: config.shopSyncId,
    actionCategory: params.actionCategory,
    summary: params.summary,
    detailsJson: params.details ? JSON.stringify(params.details) : undefined,
    requestedBy: params.requestedBy,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const id = (await db.approvalRequests.add(request)) as number;
  request.id = id;

  await enqueueSyncItem('approval_request', id, request);

  return request;
}

/**
 * Resolves a remote approval request (approve or reject), writes an audit entry,
 * and enqueues the resolution to the sync outbox.
 */
export async function resolveRemoteApprovalRequest(
  requestId: number,
  decision: 'approved' | 'rejected',
  resolvedBy: string
): Promise<void> {
  const request = await db.approvalRequests.get(requestId);
  if (!request) {
    throw new Error(`Approval request #${requestId} not found`);
  }

  const now = new Date().toISOString();

  await db.approvalRequests.update(requestId, {
    status: decision,
    resolvedBy,
    resolvedAt: now,
  });

  await addAudit(
    resolvedBy,
    'remote_approval_resolved',
    `Approval #${requestId} (${request.actionCategory})`,
    JSON.stringify({
      requestId,
      decision,
      summary: request.summary,
      requestedBy: request.requestedBy,
      resolvedAt: now,
    })
  );

  await enqueueSyncItem('approval_request', requestId, {
    ...request,
    status: decision,
    resolvedBy,
    resolvedAt: now,
  });

  if (isBackendConfigured()) {
    try {
      await supabase
        .from('hospivo_approval_requests')
        .update({
          status: decision,
          resolved_by: resolvedBy,
          resolved_at: now,
        })
        .eq('id', requestId);
    } catch (err) {
      console.warn('Could not directly update hospivo_approval_requests:', err);
    }
  }
}

/**
 * Gets all pending approval requests.
 */
export async function getPendingApprovalRequests(): Promise<ApprovalRequest[]> {
  return db.approvalRequests.where('status').equals('pending').reverse().sortBy('id');
}

/**
 * Polls for a specific approval request status.
 */
export async function pollApprovalRequest(requestId: number): Promise<ApprovalRequest | null> {
  // If remote URL is configured, run a quick sync cycle in background to pull remote changes
  runSyncCycle().catch(() => { });
  return (await db.approvalRequests.get(requestId)) || null;
}

// ---------------------------------------------------------------------------
// HOME STATUS CHIP HELPER
// ---------------------------------------------------------------------------

/**
 * Formats epoch ms to HH:mm.
 */
export function formatTimeHoursMinutes(timestamp: number): string {
  const date = new Date(timestamp);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Calculates the truthful home status chip and alert state.
 */
export async function getHomeSyncState(): Promise<HomeSyncState> {
  const config = await getCloudConfig();

  if (!config.cloudEnabled) {
    return {
      cloudEnabled: false,
      isConnected: false,
      status: 'local',
      pendingCount: 0,
      failedCount: 0,
      lastSyncedAt: null,
      lastError: null,
      chipLabel: 'Local mode',
      chipColorClass: 'bg-surface-container-low text-on-surface-variant border-outline-variant',
      bannerVisible: false,
      bannerType: null,
    };
  }

  const [pendingCount, failedCount, session] = await Promise.all([
    db.syncOutbox.where('status').equals('pending').count(),
    db.syncOutbox.where('status').equals('failed').count(),
    getCurrentCloudSession(),
  ]);

  const isConnected =
    Boolean(session.isAuthenticated && session.user) ||
    Boolean(session.cloudShopUuid) ||
    Boolean(config.hasCustomRestConfig);

  if (!isConnected) {
    return {
      cloudEnabled: true,
      isConnected: false,
      status: 'not_connected',
      pendingCount,
      failedCount,
      lastSyncedAt: null,
      lastError: null,
      chipLabel: 'Sign In Required',
      chipColorClass: 'bg-[#FEF6EE] text-[#B54708] border-[#FEDF89]',
      bannerVisible: false,
      bannerType: 'not_connected',
    };
  }

  if (config.lastStatus === 'failed') {
    return {
      cloudEnabled: true,
      isConnected: true,
      status: 'failed',
      pendingCount,
      failedCount,
      lastSyncedAt: config.lastCloudSyncAt,
      lastError: config.lastError,
      chipLabel: 'Sync nahi hua',
      chipColorClass: 'bg-[#FEF3F2] text-[#D92D20] border-[#FCA5A5]',
      bannerVisible: true,
      bannerType: 'failed',
    };
  }

  const isOffline =
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    config.lastStatus === 'offline';

  if (isOffline) {
    return {
      cloudEnabled: true,
      isConnected: true,
      status: 'offline',
      pendingCount,
      failedCount,
      lastSyncedAt: config.lastCloudSyncAt,
      lastError: 'Device is offline',
      chipLabel: `Offline · ${pendingCount} pending`,
      chipColorClass: 'bg-[#FEF6EE] text-[#B54708] border-[#FEDF89]',
      bannerVisible: pendingCount > 0,
      bannerType: 'offline',
    };
  }

  if (failedCount > 0) {
    return {
      cloudEnabled: true,
      isConnected: true,
      status: 'failed',
      pendingCount,
      failedCount,
      lastSyncedAt: config.lastCloudSyncAt,
      lastError: config.lastError,
      chipLabel: 'Sync nahi hua',
      chipColorClass: 'bg-[#FEF3F2] text-[#D92D20] border-[#FCA5A5]',
      bannerVisible: true,
      bannerType: 'failed',
    };
  }

  const timeStr = config.lastCloudSyncAt ? formatTimeHoursMinutes(config.lastCloudSyncAt) : '--:--';
  return {
    cloudEnabled: true,
    isConnected: true,
    status: 'synced',
    pendingCount,
    failedCount,
    lastSyncedAt: config.lastCloudSyncAt,
    lastError: null,
    chipLabel: `Cloud-enabled · Synced: ${timeStr}`,
    chipColorClass: 'bg-[#E8F5E9] text-[#1B8F4A] border-[#A5D6A7]',
    bannerVisible: false,
    bannerType: null,
  };
}

/**
 * Enqueues all existing local users (owner & staff) into syncOutbox
 * so they are backed up to Supabase.
 */
export async function syncAllUsersToCloud(): Promise<void> {
  const users = await db.users.toArray();
  const approvalPin = (await db.settings.get('approval_pin'))?.value as { hash: string; salt: string } | undefined;
  for (const user of users) {
    const payload = user.role === 'owner' && approvalPin
      ? { ...user, approvalPin }
      : user;
    await enqueueSyncItem('staff', user.id, payload);
  }
}

/**
 * Directly pulls all staff / user events for a given cloud shop from Supabase
 * in chronological order (seq ASC) and upserts them idempotently into local Dexie IndexedDB.
 */
export async function pullAndHydrateStaffAccounts(cloudShopUuid: string): Promise<number> {
  if (!isBackendConfigured() || !cloudShopUuid) return 0;
  try {
    const query = supabase
      .from('hospivo_sync_events')
      .select('*')
      .eq('shop_id', cloudShopUuid)
      .eq('entity_type', 'staff');

    const { data: staffEvents, error } =
      typeof (query as any).order === 'function'
        ? await (query as any).order('seq', { ascending: true })
        : await query;

    if (error) {
      console.warn('pullAndHydrateStaffAccounts query error:', error);
      return 0;
    }

    if (Array.isArray(staffEvents)) {
      for (const evt of staffEvents) {
        await applyRemoteEvent(evt);
      }
      await deduplicateLocalUsers().catch(() => { });
      if (staffEvents.length > 0) {
        emitSyncApplied(['staff']);
      }
      return staffEvents.length;
    }
  } catch (err) {
    console.warn('pullAndHydrateStaffAccounts exception:', err);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// WORKSPACE ISOLATION (LOCAL-ONLY VS CLOUD ACCOUNT & MULTI-SHOP)
// ---------------------------------------------------------------------------

/**
 * Keys in db.settings that belong strictly to a single shop/account workspace
 * and MUST be snapshotted and cleared whenever switching accounts or shops.
 * Device-global keys (intro_seen, language, device_id, device_name, shop_directory,
 * workspace_snapshot::*, local_mode_snapshot, active_data_scope, cloud_url, cloud_anon_key)
 * are intentionally excluded.
 */
export const SHOP_SCOPED_SETTING_KEYS = [
  'approval_pin',
  'approval_rules',
  'approval_pin_lock',
  'discount_limit',
  'auto_lock_minutes',
  'pinLength',
  'fullscreenOnLogin',
  'backup_folder',
  'backup_dir_name',
  'backup_history',
  'lastVerifiedBackupAt',
  'lastBackupAt',
  'shop_sync_id',
  'cloud_shop_uuid',
  'cloud_enabled',
  'last_pulled_seq',
  'last_cloud_sync_at',
  'last_cloud_sync_status',
  'last_cloud_sync_error',
] as const;

export interface WorkspaceSnapshot {
  savedAt: string;
  shop: any[];
  users: any[];
  medicines: any[];
  batches: any[];
  stockMovements: any[];
  suppliers: any[];
  purchases: any[];
  purchaseLines: any[];
  productTypes: any[];
  bills: any[];
  billItems: any[];
  heldBills: any[];
  billReturns: any[];
  supplierReturns: any[];
  customers: any[];
  udhaarPayments: any[];
  regularReminders: any[];
  dailyClosings: any[];
  approvalRequests: any[];
  auditLog?: any[];
  syncOutbox?: any[];
  shopSettings?: Record<string, unknown>;
}

function isShopScopedSettingKey(key: string): boolean {
  if ((SHOP_SCOPED_SETTING_KEYS as readonly string[]).includes(key)) {
    return true;
  }
  return key.startsWith('login_lock_') || key.startsWith('approval_lock_');
}

export async function clearShopScopedSettings(preserveKeys: string[] = []): Promise<void> {
  const preserve = new Set(preserveKeys);
  const allSettings = await db.settings.toArray();
  const keysToDelete = allSettings
    .map((s) => s.key)
    .filter((k) => !preserve.has(k) && isShopScopedSettingKey(k));
  if (keysToDelete.length > 0) {
    await db.settings.bulkDelete(keysToDelete);
  }
}

export async function captureWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const [
    shop,
    users,
    medicines,
    batches,
    stockMovements,
    suppliers,
    purchases,
    purchaseLines,
    productTypes,
    bills,
    billItems,
    heldBills,
    billReturns,
    supplierReturns,
    customers,
    udhaarPayments,
    regularReminders,
    dailyClosings,
    approvalRequests,
    auditLog,
    syncOutbox,
    allSettings,
  ] = await Promise.all([
    db.shop.toArray(),
    db.users.toArray(),
    db.medicines.toArray(),
    db.batches.toArray(),
    db.stockMovements.toArray(),
    db.suppliers.toArray(),
    db.purchases.toArray(),
    db.purchaseLines.toArray(),
    db.productTypes.toArray(),
    db.bills.toArray(),
    db.billItems.toArray(),
    db.heldBills.toArray(),
    db.billReturns.toArray(),
    db.supplierReturns.toArray(),
    db.customers.toArray(),
    db.udhaarPayments.toArray(),
    db.regularReminders.toArray(),
    db.dailyClosings.toArray(),
    db.approvalRequests.toArray(),
    db.auditLog.toArray(),
    db.syncOutbox.toArray(),
    db.settings.toArray(),
  ]);

  const shopSettings: Record<string, unknown> = {};
  for (const s of allSettings) {
    if (isShopScopedSettingKey(s.key)) {
      shopSettings[s.key] = s.value;
    }
  }

  return {
    savedAt: new Date().toISOString(),
    shop,
    users,
    medicines,
    batches,
    stockMovements,
    suppliers,
    purchases,
    purchaseLines,
    productTypes,
    bills,
    billItems,
    heldBills,
    billReturns,
    supplierReturns,
    customers,
    udhaarPayments,
    regularReminders,
    dailyClosings,
    approvalRequests,
    auditLog,
    syncOutbox,
    shopSettings,
  };
}

export async function clearWorkspaceTables(): Promise<void> {
  await runWithSyncWorkspaceBypass(async () => {
    await Promise.all([
      db.shop.clear(),
      db.users.clear(),
      db.medicines.clear(),
      db.batches.clear(),
      db.stockMovements.clear(),
      db.suppliers.clear(),
      db.purchases.clear(),
      db.purchaseLines.clear(),
      db.productTypes.clear(),
      db.bills.clear(),
      db.billItems.clear(),
      db.heldBills.clear(),
      db.billReturns.clear(),
      db.supplierReturns.clear(),
      db.customers.clear(),
      db.udhaarPayments.clear(),
      db.regularReminders.clear(),
      db.dailyClosings.clear(),
      db.approvalRequests.clear(),
      db.auditLog.clear(),
      db.syncOutbox.clear(),
    ]);
  });
}

export async function restoreWorkspaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
  await runWithSyncWorkspaceBypass(async () => {
    await clearWorkspaceTables();
    await clearShopScopedSettings();
    if (snapshot.shop?.length) await db.shop.bulkPut(snapshot.shop);
    if (snapshot.users?.length) await db.users.bulkPut(snapshot.users);
    if (snapshot.medicines?.length) await db.medicines.bulkPut(snapshot.medicines);
    if (snapshot.batches?.length) await db.batches.bulkPut(snapshot.batches);
    if (snapshot.stockMovements?.length) await db.stockMovements.bulkPut(snapshot.stockMovements);
    if (snapshot.suppliers?.length) await db.suppliers.bulkPut(snapshot.suppliers);
    if (snapshot.purchases?.length) await db.purchases.bulkPut(snapshot.purchases);
    if (snapshot.purchaseLines?.length) await db.purchaseLines.bulkPut(snapshot.purchaseLines);
    if (snapshot.productTypes?.length) await db.productTypes.bulkPut(snapshot.productTypes);
    if (snapshot.bills?.length) await db.bills.bulkPut(snapshot.bills);
    if (snapshot.billItems?.length) await db.billItems.bulkPut(snapshot.billItems);
    if (snapshot.heldBills?.length) await db.heldBills.bulkPut(snapshot.heldBills);
    if (snapshot.billReturns?.length) await db.billReturns.bulkPut(snapshot.billReturns);
    if (snapshot.supplierReturns?.length) await db.supplierReturns.bulkPut(snapshot.supplierReturns);
    if (snapshot.customers?.length) await db.customers.bulkPut(snapshot.customers);
    if (snapshot.udhaarPayments?.length) await db.udhaarPayments.bulkPut(snapshot.udhaarPayments);
    if (snapshot.regularReminders?.length) await db.regularReminders.bulkPut(snapshot.regularReminders);
    if (snapshot.dailyClosings?.length) await db.dailyClosings.bulkPut(snapshot.dailyClosings);
    if (snapshot.approvalRequests?.length) await db.approvalRequests.bulkPut(snapshot.approvalRequests);
    if (snapshot.auditLog?.length) await db.auditLog.bulkPut(snapshot.auditLog);
    if (snapshot.syncOutbox?.length) await db.syncOutbox.bulkPut(snapshot.syncOutbox);
    if (snapshot.shopSettings) {
      for (const [key, value] of Object.entries(snapshot.shopSettings)) {
        if (isShopScopedSettingKey(key)) {
          await db.settings.put({ key, value });
        }
      }
    }
  });
}

export interface LocalDataSummary {
  shopName: string;
  usersCount: number;
  billsCount: number;
  medicinesCount: number;
  customersCount: number;
}

export interface LocalDataCheckResult {
  hasLocalData: boolean;
  currentScope: string;
  summary: LocalDataSummary;
}

/**
 * Inspects whether this device currently holds local-mode data that is separate
 * from the target cloud shop (used to decide whether to prompt before pushing/merging).
 */
export async function inspectLocalModeData(
  targetCloudShopUuid?: string | null
): Promise<LocalDataCheckResult> {
  const [
    scopeItem,
    shops,
    usersCount,
    billsCount,
    medicinesCount,
    batchesCount,
    customersCount,
    purchasesCount,
    udhaarCount,
  ] = await Promise.all([
    db.settings.get('active_data_scope'),
    db.shop.toArray(),
    db.users.count(),
    db.bills.count(),
    db.medicines.count(),
    db.batches.count(),
    db.customers.count(),
    db.purchases.count(),
    db.udhaarPayments.count(),
  ]);

  const currentScope = typeof scopeItem?.value === 'string' ? scopeItem.value : 'local';
  const summary: LocalDataSummary = {
    shopName: shops[0]?.name || '',
    usersCount,
    billsCount,
    medicinesCount,
    customersCount,
  };

  // Already operating on this exact cloud shop -> no conflicting local data
  if (targetCloudShopUuid && currentScope === `cloud:${targetCloudShopUuid}`) {
    return { hasLocalData: false, currentScope, summary };
  }

  // Explicitly reset for a clean cloud setup or adding a new shop -> no conflicting local data
  if (
    currentScope === 'cloud_setup_clean' ||
    currentScope === 'cloud_setup_new_shop' ||
    currentScope === 'local_setup_new_shop'
  ) {
    return { hasLocalData: false, currentScope, summary };
  }

  const hasAnyRecords =
    shops.length > 0 ||
    usersCount > 0 ||
    billsCount > 0 ||
    medicinesCount > 0 ||
    batchesCount > 0 ||
    customersCount > 0 ||
    purchasesCount > 0 ||
    udhaarCount > 0;

  return {
    hasLocalData: hasAnyRecords,
    currentScope,
    summary,
  };
}

/**
 * Stashes existing workspace data safely under its own snapshot key and clears ALL
 * active operational tables (including auditLog, syncOutbox) and ALL shop-scoped settings
 * so a new cloud account starts 100% isolated with zero bleed-over from any previous account.
 */
export async function stashLocalDataAndStartCleanCloud(ownerEmail: string): Promise<void> {
  stopRealtimeSync();
  const currentScope = (await db.settings.get('active_data_scope'))?.value as string | undefined;

  const snap = await captureWorkspaceSnapshot();
  const hasAnyData =
    snap.shop.length > 0 ||
    snap.users.length > 0 ||
    snap.bills.length > 0 ||
    snap.medicines.length > 0 ||
    snap.customers.length > 0 ||
    (snap.auditLog?.length ?? 0) > 0;

  if (hasAnyData) {
    if (!currentScope || currentScope === 'local' || currentScope.startsWith('local:')) {
      await db.settings.put({ key: 'local_mode_snapshot', value: snap });
    }
    if (currentScope && !currentScope.endsWith('_setup_clean') && !currentScope.endsWith('_setup_new_shop')) {
      await db.settings.put({ key: `workspace_snapshot::${currentScope}`, value: snap });
    }
  }

  // Strictly wipe all 21 workspace tables (including auditLog & syncOutbox) and all shop-scoped settings
  await clearWorkspaceTables();
  await clearShopScopedSettings();
  await db.settings.put({ key: 'last_pulled_seq', value: 0 });
  await db.settings.put({ key: 'owner_email', value: ownerEmail.trim().toLowerCase() });
  await db.settings.put({ key: 'cloud_enabled', value: false });
  await db.settings.put({ key: 'active_data_scope', value: 'cloud_setup_clean' });
  await db.settings.put({ key: 'last_cloud_sync_status', value: 'never' });

  emitSyncApplied(['workspace_reset', 'shop', 'staff', 'sync_status']);
}

/**
 * Cleanly switches Dexie into an existing cloud shop workspace without mixing
 * any previous account's or local-only records (bills, staff, inventory, Udhaar, auditLog, settings).
 * Preserves the prior workspace safely under its own snapshot key.
 */
export async function switchToCloudWorkspace(
  cloudShopUuid: string,
  shopMeta: { name: string; syncId: string; ownerEmail: string }
): Promise<{ switched: boolean }> {
  const currentScope = (await db.settings.get('active_data_scope'))?.value as string | undefined;
  const targetScope = `cloud:${cloudShopUuid}`;

  if (currentScope === targetScope) {
    // Already operating on this exact cloud shop — preserve offline bills/outbox and just update metadata
    const localShops = await db.shop.toArray();
    if (localShops.length > 0 && localShops[0].id) {
      await db.shop.update(localShops[0].id, {
        name: shopMeta.name || localShops[0].name,
        cloudShopUuid,
        shopSyncId: shopMeta.syncId,
        ownerEmail: shopMeta.ownerEmail,
        mode: 'cloud',
      });
    } else {
      await db.shop.add({
        name: shopMeta.name,
        ownerName: 'Owner',
        address: '',
        phone: '',
        gstNo: '',
        drugLicenceNos: '',
        mode: 'cloud',
        cloudShopUuid,
        shopSyncId: shopMeta.syncId,
        ownerEmail: shopMeta.ownerEmail,
        lastPulledSeq: 0,
      });
    }
    return { switched: false };
  }

  // Save prior workspace snapshot before switching so nothing is lost and nothing bleeds over
  const priorSnap = await captureWorkspaceSnapshot();
  const hasAnyPriorData =
    priorSnap.shop.length > 0 ||
    priorSnap.users.length > 0 ||
    priorSnap.bills.length > 0 ||
    priorSnap.medicines.length > 0 ||
    priorSnap.customers.length > 0;
  if (hasAnyPriorData) {
    if (!currentScope || currentScope === 'local' || currentScope.startsWith('local:')) {
      await db.settings.put({ key: 'local_mode_snapshot', value: priorSnap });
    }
    if (currentScope && !currentScope.endsWith('_setup_clean') && !currentScope.endsWith('_setup_new_shop')) {
      await db.settings.put({ key: `workspace_snapshot::${currentScope}`, value: priorSnap });
    }
  }

  // Strictly clear ALL operational tables (including auditLog & syncOutbox) and shop-scoped settings
  await clearWorkspaceTables();
  await clearShopScopedSettings(['cloud_shop_uuid', 'shop_sync_id', 'cloud_enabled']);
  await db.settings.put({ key: 'cloud_shop_uuid', value: cloudShopUuid });
  await db.settings.put({ key: 'shop_sync_id', value: shopMeta.syncId });
  await db.settings.put({ key: 'cloud_enabled', value: true });
  await db.settings.put({ key: 'owner_email', value: shopMeta.ownerEmail });
  await db.settings.put({ key: 'last_pulled_seq', value: 0 });
  await db.settings.put({ key: 'active_data_scope', value: targetScope });

  await db.shop.add({
    name: shopMeta.name,
    ownerName: 'Owner',
    address: '',
    phone: '',
    gstNo: '',
    drugLicenceNos: '',
    mode: 'cloud',
    cloudShopUuid,
    shopSyncId: shopMeta.syncId,
    ownerEmail: shopMeta.ownerEmail,
    lastPulledSeq: 0,
  });

  emitSyncApplied(['workspace_switched', 'shop', 'staff', 'bill', 'medicine', 'batch', 'customer', 'udhaar_payment']);
  return { switched: true };
}

/**
 * Restores previously saved local-only data when switching back from a Cloud Account to Local Mode.
 */
export async function switchToLocalWorkspace(): Promise<{ restored: boolean }> {
  const currentScope = (await db.settings.get('active_data_scope'))?.value as string | undefined;
  const snapItem = await db.settings.get('local_mode_snapshot');
  const snapshot = snapItem?.value as WorkspaceSnapshot | undefined;

  if (currentScope && currentScope.startsWith('cloud:') && snapshot) {
    await restoreWorkspaceSnapshot(snapshot);
    await db.syncOutbox.clear();
    await db.settings.put({ key: 'last_pulled_seq', value: 0 });
    await db.settings.put({ key: 'active_data_scope', value: 'local' });

    const shops = await db.shop.toArray();
    if (shops.length > 0 && shops[0].id) {
      await db.shop.update(shops[0].id, { mode: 'local' });
    }
    await deduplicateLocalUsers().catch(() => { });
    emitSyncApplied(['shop', 'staff', 'bill', 'medicine', 'batch', 'customer', 'udhaar_payment']);
    return { restored: true };
  }

  await db.settings.put({ key: 'active_data_scope', value: 'local' });
  return { restored: false };
}

// ---------------------------------------------------------------------------
// SILENT REALTIME UPDATES (SUPABASE POSTGRES_CHANGES)
// ---------------------------------------------------------------------------

export const SYNC_APPLIED_EVENT = 'hospivo:sync-applied';

type SyncAppliedListener = (entityTypes: string[]) => void;
const syncAppliedListeners = new Set<SyncAppliedListener>();

let activeRealtimeChannel: any = null;
let activeRealtimeShopUuid: string | null = null;

/**
 * Broadcasts a silent UI refresh signal whenever remote sync events or workspace
 * transitions update local Dexie tables. Never triggers popups, toasts, or audio.
 */
export function emitSyncApplied(entityTypes: string[]): void {
  if (entityTypes.length === 0) return;
  syncAppliedListeners.forEach((listener) => {
    try {
      listener(entityTypes);
    } catch {
      // Never let a listener error interrupt silent sync
    }
  });
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent(SYNC_APPLIED_EVENT, {
          detail: { entityTypes },
        })
      );
    } catch {
      // Non-DOM environment
    }
  }
}

/**
 * Subscribes a screen or component to silent sync updates from background pulls
 * or incoming Supabase Realtime postgres_changes events.
 */
export function subscribeToSyncUpdates(
  listener: (entityTypes: string[]) => void,
  filterTypes?: string[]
): () => void {
  const wrapped: SyncAppliedListener = (types) => {
    if (filterTypes && filterTypes.length > 0) {
      const hasMatch = types.some((t) => filterTypes.includes(t));
      if (!hasMatch) return;
    }
    listener(types);
  };

  syncAppliedListeners.add(wrapped);
  return () => {
    syncAppliedListeners.delete(wrapped);
  };
}

/**
 * Stops any active Supabase Realtime channel subscription cleanly.
 */
export function stopRealtimeSync(): void {
  if (activeRealtimeChannel) {
    try {
      if (typeof (supabase as any).removeChannel === 'function') {
        void (supabase as any).removeChannel(activeRealtimeChannel);
      } else if (typeof activeRealtimeChannel.unsubscribe === 'function') {
        void activeRealtimeChannel.unsubscribe();
      }
    } catch {
      // Ignore cleanup errors
    }
  }
  activeRealtimeChannel = null;
  activeRealtimeShopUuid = null;
}

/**
 * Starts a silent Supabase Realtime subscription (postgres_changes) scoped to the
 * signed-in shop UUID so bills, inventory/batches, staff, and Udhaar updates from
 * other devices are applied automatically to Dexie without popups or toasts.
 */
export async function startRealtimeSync(overrideShopUuid?: string): Promise<boolean> {
  if (!isBackendConfigured()) return false;
  if (typeof (supabase as any).channel !== 'function') return false;

  const config = await getCloudConfig();
  if (!config.cloudEnabled) {
    stopRealtimeSync();
    return false;
  }

  const session = await getCurrentCloudSession();
  const cloudShopUuid = overrideShopUuid || session.cloudShopUuid;
  if (!session.isAuthenticated || !cloudShopUuid) {
    stopRealtimeSync();
    return false;
  }

  if (activeRealtimeChannel && activeRealtimeShopUuid === cloudShopUuid) {
    return true;
  }

  stopRealtimeSync();

  try {
    const channel = (supabase as any)
      .channel(`hospivo-sync-${cloudShopUuid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hospivo_sync_events',
          filter: `shop_id=eq.${cloudShopUuid}`,
        },
        async (payload: any) => {
          const event = payload?.new;
          if (!event) return;
          try {
            await applyRemoteEvent(event);
            if (event.entity_type === 'staff') {
              await deduplicateLocalUsers().catch(() => { });
            }

            if (typeof event.seq === 'number') {
              const seqItem = await db.settings.get('last_pulled_seq');
              const currentSeq = typeof seqItem?.value === 'number' ? seqItem.value : 0;
              if (event.seq > currentSeq) {
                await db.settings.put({ key: 'last_pulled_seq', value: event.seq });
                const shops = await db.shop.toArray();
                if (shops.length > 0 && shops[0].id) {
                  await db.shop.update(shops[0].id, { lastPulledSeq: event.seq });
                }
              }
            }

            await db.settings.put({ key: 'last_cloud_sync_at', value: Date.now() });
            await db.settings.put({ key: 'last_cloud_sync_status', value: 'synced' });

            // Silent UI refresh — zero popups, zero toasts, zero audio
            emitSyncApplied([String(event.entity_type || 'sync')]);
          } catch (err) {
            console.warn('Realtime event apply warning:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hospivo_approval_requests',
          filter: `shop_id=eq.${cloudShopUuid}`,
        },
        async () => {
          try {
            const latestCfg = await getCloudConfig();
            await syncApprovalRequests(latestCfg, cloudShopUuid);
            emitSyncApplied(['approval_request']);
          } catch {
            // Silent ignore
          }
        }
      )
      .subscribe();

    activeRealtimeChannel = channel;
    activeRealtimeShopUuid = cloudShopUuid;
    return true;
  } catch (err) {
    console.warn('startRealtimeSync warning:', err);
    return false;
  }
}

/**
 * Ensures Realtime sync is subscribed and runs a silent catch-up sync cycle
 * whenever Cloud Mode is enabled and the owner is authenticated.
 */
export async function ensureCloudSyncActive(options?: { reconnectRealtime?: boolean }): Promise<void> {
  try {
    const config = await getCloudConfig();
    if (!config.cloudEnabled) {
      stopRealtimeSync();
      return;
    }
    const session = await getCurrentCloudSession();
    if (!session.isAuthenticated || !session.user) {
      stopRealtimeSync();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await db.settings.put({ key: 'last_cloud_sync_status', value: 'offline' });
      stopRealtimeSync();
      emitSyncApplied(['sync_status']);
      return;
    }
    if (session.cloudShopUuid) {
      if (options?.reconnectRealtime) {
        stopRealtimeSync();
      }
      await startRealtimeSync(session.cloudShopUuid);
      void registerCurrentDeviceInCloud().catch(() => { });
    }
    await runSyncCycle();
  } catch {
    // Completely silent background check
  }
}

/**
 * Registers silent offline/online connectivity listeners across:
 *  - Browser / WebView `window` 'online' and 'offline' events
 *  - Network Information API `navigator.connection` 'change' (Wi-Fi <-> 4G/5G switches)
 *  - `document` 'visibilitychange' (tab / WebView foreground resume)
 *  - Capacitor `Network` ('networkStatusChange') and `App` ('appStateChange') plugins if present
 *  - Silent periodic retry timer so queued offline changes always flush when internet returns
 * Never shows popup toasts or audio alerts.
 */
export function initNetworkSyncListeners(): () => void {
  const cleanups: Array<() => void> = [];

  const handleReconnect = () => {
    void ensureCloudSyncActive({ reconnectRealtime: true });
  };

  const handleOffline = () => {
    stopRealtimeSync();
    void (async () => {
      try {
        const cfg = await getCloudConfig();
        if (cfg.cloudEnabled) {
          await db.settings.put({ key: 'last_cloud_sync_status', value: 'offline' });
          emitSyncApplied(['sync_status']);
        }
      } catch {
        // Silent
      }
    })();
  };

  // Kick off initial silent check
  void ensureCloudSyncActive();

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleReconnect);
    window.addEventListener('offline', handleOffline);
    cleanups.push(() => {
      window.removeEventListener('online', handleReconnect);
      window.removeEventListener('offline', handleOffline);
    });
  }

  if (typeof document !== 'undefined') {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        void ensureCloudSyncActive();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    cleanups.push(() => document.removeEventListener('visibilitychange', handleVisibility));
  }

  // Network Information API (Chrome / Android WebView)
  if (typeof navigator !== 'undefined') {
    const connection = (navigator as unknown as {
      connection?: {
        addEventListener?: (type: string, listener: () => void) => void;
        removeEventListener?: (type: string, listener: () => void) => void;
      };
    }).connection;
    if (connection?.addEventListener) {
      const handleConnectionChange = () => {
        if (navigator.onLine !== false) {
          handleReconnect();
        } else {
          handleOffline();
        }
      };
      connection.addEventListener('change', handleConnectionChange);
      cleanups.push(() => connection.removeEventListener?.('change', handleConnectionChange));
    }
  }

  // Capacitor Network & App runtime plugins (if present in native shell)
  try {
    const plugins = (Capacitor as unknown as {
      Plugins?: {
        Network?: {
          addListener?: (
            event: 'networkStatusChange',
            cb: (status: { connected?: boolean }) => void
          ) => Promise<{ remove: () => void }> | { remove: () => void };
        };
        App?: {
          addListener?: (
            event: 'appStateChange',
            cb: (state: { isActive?: boolean }) => void
          ) => Promise<{ remove: () => void }> | { remove: () => void };
        };
      };
    }).Plugins;

    if (plugins?.Network?.addListener) {
      let removed = false;
      let handle: { remove: () => void } | null = null;
      const result = plugins.Network.addListener('networkStatusChange', (status) => {
        if (status?.connected) {
          handleReconnect();
        } else if (status?.connected === false) {
          handleOffline();
        }
      });
      Promise.resolve(result)
        .then((h) => {
          if (removed) {
            h?.remove?.();
          } else {
            handle = h;
          }
        })
        .catch(() => { });
      cleanups.push(() => {
        removed = true;
        handle?.remove?.();
      });
    }

    if (plugins?.App?.addListener) {
      let removed = false;
      let handle: { remove: () => void } | null = null;
      const result = plugins.App.addListener('appStateChange', (state) => {
        if (state?.isActive && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          void ensureCloudSyncActive();
        }
      });
      Promise.resolve(result)
        .then((h) => {
          if (removed) {
            h?.remove?.();
          } else {
            handle = h;
          }
        })
        .catch(() => { });
      cleanups.push(() => {
        removed = true;
        handle?.remove?.();
      });
    }
  } catch {
    // Non-Capacitor environment
  }

  // Silent 30s pending-outbox retry & 60s full heartbeat
  let tickCount = 0;
  const intervalId = setInterval(() => {
    tickCount++;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void (async () => {
      try {
        const pending = await db.syncOutbox.where('status').equals('pending').count();
        if (pending > 0 || tickCount % 2 === 0) {
          await runSyncCycle();
        }
      } catch {
        // Silent
      }
    })();
  }, 30_000);
  cleanups.push(() => clearInterval(intervalId));

  return () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        // Ignore cleanup errors
      }
    }
    stopRealtimeSync();
  };
}

// ---------------------------------------------------------------------------
// FULL LOCAL-TO-CLOUD BACKFILL
// ---------------------------------------------------------------------------

export interface BackfillLocalResult {
  success: boolean;
  enqueuedCount: number;
  syncedCount: number;
  lastError: string | null;
}

/**
 * Scans all existing records in local Dexie tables (users, medicines, batches,
 * sales, returns, purchases, suppliers, customers, stock movements, etc.),
 * enqueues deterministic upsert sync events for each record into syncOutbox,
 * and immediately triggers a sync cycle so they are pushed to Supabase hospivo_sync_events.
 */
export async function backfillLocalDataToCloud(): Promise<BackfillLocalResult> {
  // 1. Verify authenticated session / cloud connection before scanning & enqueuing
  let config = await getCloudConfig();
  const session = await getCurrentCloudSession();
  const hasValidConnection =
    Boolean(session.isAuthenticated && session.user) ||
    Boolean(session.cloudShopUuid) ||
    Boolean(config.hasCustomRestConfig);

  if (!hasValidConnection) {
    return {
      success: false,
      enqueuedCount: 0,
      syncedCount: 0,
      lastError: 'Sign in required to sync with cloud',
    };
  }

  if (!config.cloudEnabled) {
    config = await saveCloudConfig({ cloudEnabled: true });
  }

  // 2. Scan all local Dexie tables
  const itemsToQueue: {
    entityType: SyncEntityType;
    entityId: string;
    payload: unknown;
    createdAt: string;
  }[] = [];

  // Users & Owner
  const users = await db.users.toArray();
  const approvalPinSetting = await db.settings.get('approval_pin');
  const approvalPin = approvalPinSetting?.value as { hash: string; salt: string } | undefined;
  for (const u of users) {
    const payload = u.id === 'owner' && approvalPin ? { ...u, approvalPin } : u;
    itemsToQueue.push({
      entityType: 'staff',
      entityId: String(u.id),
      payload,
      createdAt: u.createdAt || new Date().toISOString(),
    });
  }

  // Medicines
  const medicines = await db.medicines.toArray();
  for (const m of medicines) {
    itemsToQueue.push({
      entityType: 'medicine',
      entityId: String(m.id),
      payload: { id: m.id, ...m },
      createdAt: m.createdAt || new Date().toISOString(),
    });
  }

  // Batches
  const batches = await db.batches.toArray();
  for (const b of batches) {
    itemsToQueue.push({
      entityType: 'batch',
      entityId: String(b.id),
      payload: { id: b.id, ...b },
      createdAt: b.createdAt || new Date().toISOString(),
    });
  }

  // Suppliers
  const suppliers = await db.suppliers.toArray();
  for (const s of suppliers) {
    itemsToQueue.push({
      entityType: 'supplier',
      entityId: String(s.id),
      payload: { id: s.id, ...s },
      createdAt: s.createdAt || new Date().toISOString(),
    });
  }

  // Customers
  const customers = await db.customers.toArray();
  for (const c of customers) {
    itemsToQueue.push({
      entityType: 'customer',
      entityId: String(c.id),
      payload: { id: c.id, ...c },
      createdAt: c.createdAt || new Date().toISOString(),
    });
  }

  // Bills (Sales) & BillItems
  const bills = await db.bills.toArray();
  for (const bill of bills) {
    const items = bill.id ? await db.billItems.where('billId').equals(bill.id).toArray() : [];
    itemsToQueue.push({
      entityType: 'bill',
      entityId: String(bill.id),
      payload: { bill, items },
      createdAt: bill.createdAt || new Date().toISOString(),
    });
  }

  // Bill Returns
  const returns = await db.billReturns.toArray();
  for (const ret of returns) {
    itemsToQueue.push({
      entityType: 'bill_return',
      entityId: String(ret.id),
      payload: ret,
      createdAt: ret.createdAt || new Date().toISOString(),
    });
  }

  // Purchases & PurchaseLines
  const purchases = await db.purchases.toArray();
  for (const p of purchases) {
    const lines = p.id ? await db.purchaseLines.where('purchaseId').equals(p.id).toArray() : [];
    itemsToQueue.push({
      entityType: 'purchase',
      entityId: String(p.id),
      payload: { purchase: p, lines },
      createdAt: p.createdAt || new Date().toISOString(),
    });
  }

  // Stock Movements
  const movements = await db.stockMovements.toArray();
  for (const m of movements) {
    itemsToQueue.push({
      entityType: 'stock_movement',
      entityId: String(m.id),
      payload: m,
      createdAt: m.at || new Date().toISOString(),
    });
  }

  // Udhaar Payments
  const udhaarPayments = await db.udhaarPayments.toArray();
  for (const up of udhaarPayments) {
    itemsToQueue.push({
      entityType: 'udhaar_payment',
      entityId: String(up.id),
      payload: up,
      createdAt: up.createdAt || new Date().toISOString(),
    });
  }

  // Daily Closings
  const closings = await db.dailyClosings.toArray();
  for (const cl of closings) {
    itemsToQueue.push({
      entityType: 'daily_closing',
      entityId: String(cl.id),
      payload: cl,
      createdAt: cl.createdAt || new Date().toISOString(),
    });
  }

  // Approval Requests
  const approvalRequests = await db.approvalRequests.toArray();
  for (const ar of approvalRequests) {
    itemsToQueue.push({
      entityType: 'approval_request',
      entityId: String(ar.id),
      payload: ar,
      createdAt: ar.createdAt || new Date().toISOString(),
    });
  }

  // 3. Batch enqueue into db.syncOutbox avoiding duplicates
  const existingOutbox = await db.syncOutbox.toArray();
  const outboxMap = new Map<string, SyncOutboxItem[]>();
  for (const item of existingOutbox) {
    const key = `${item.entityType}:${item.entityId}`;
    const list = outboxMap.get(key) || [];
    list.push(item);
    outboxMap.set(key, list);
  }

  const toUpdate: { id: number; changes: Partial<SyncOutboxItem> }[] = [];
  const toAdd: Omit<SyncOutboxItem, 'id'>[] = [];
  const idsToDelete: number[] = [];

  for (const itm of itemsToQueue) {
    const key = `${itm.entityType}:${itm.entityId}`;
    const list = outboxMap.get(key);
    if (list && list.length > 0) {
      toUpdate.push({
        id: list[0].id!,
        changes: {
          payloadJson: JSON.stringify(itm.payload),
          status: 'pending',
          retryCount: 0,
          createdAt: itm.createdAt,
        },
      });
      if (list.length > 1) {
        for (let i = 1; i < list.length; i++) {
          if (list[i].id) idsToDelete.push(list[i].id!);
        }
      }
    } else {
      toAdd.push({
        entityType: itm.entityType,
        entityId: itm.entityId,
        payloadJson: JSON.stringify(itm.payload),
        status: 'pending',
        retryCount: 0,
        createdAt: itm.createdAt,
      });
    }
  }

  if (toAdd.length > 0) {
    await db.syncOutbox.bulkAdd(toAdd);
  }

  if (toUpdate.length > 0 || idsToDelete.length > 0) {
    await db.transaction('rw', db.syncOutbox, async () => {
      for (const u of toUpdate) {
        await db.syncOutbox.update(u.id, u.changes);
      }
      if (idsToDelete.length > 0) {
        await db.syncOutbox.bulkDelete(idsToDelete);
      }
    });
  }

  // 4. Immediately trigger runSyncCycle to push outbox to Supabase hospivo_sync_events
  const syncResult = await runSyncCycle({ force: true });

  return {
    success: syncResult.success,
    enqueuedCount: itemsToQueue.length,
    syncedCount: syncResult.processedCount,
    lastError: syncResult.lastError,
  };
}

// ---------------------------------------------------------------------------
// MULTI-DEVICE REGISTRATION & CONNECTED DEVICES LIST
// ---------------------------------------------------------------------------

export interface ConnectedDeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion?: string;
  lastSeenAt: string;
  isCurrentDevice: boolean;
}

const APP_VERSION = (import.meta as any).env?.VITE_APP_VERSION || '4.12.8';
export const MAX_DEVICE_NAME_LENGTH = 40;

/**
 * Generates a clear, distinguishable default device name based on platform/OS/browser
 * and avoids colliding with existing device names in the same store.
 */
export function detectDefaultDeviceName(params?: {
  isNative?: boolean;
  userAgent?: string;
  deviceId?: string;
  existingNames?: string[];
  isTablet?: boolean;
}): string {
  const isNative = params?.isNative ?? Capacitor.isNativePlatform();
  const ua = params?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  const isTablet =
    params?.isTablet ??
    (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)));

  let baseName = 'Counter PC 1 (Billing Desk)';

  if (isNative) {
    const modelMatch = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/i);
    const rawModel = modelMatch?.[1]?.trim() || '';
    const cleanModel =
      rawModel && !/^(K|Mobile|Linux|U)$/i.test(rawModel) ? rawModel.slice(0, 22) : '';
    if (cleanModel) {
      baseName = isTablet ? `Android Tablet (${cleanModel})` : `Android Phone (${cleanModel})`;
    } else {
      baseName = isTablet ? 'Android Tablet' : 'Android Device';
    }
  } else if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
    const browser = /EdgA|EdgiOS|Edg\//i.test(ua)
      ? 'Edge'
      : /Firefox|FxiOS/i.test(ua)
        ? 'Firefox'
        : /CriOS|Chrome/i.test(ua)
          ? 'Chrome'
          : /Safari/i.test(ua)
            ? 'Safari'
            : '';
    if (/iPad/i.test(ua)) {
      baseName = browser ? `iPad · ${browser}` : 'iPad Browser';
    } else if (/iPhone|iPod/i.test(ua)) {
      baseName = browser ? `iPhone · ${browser}` : 'iPhone Browser';
    } else if (/Android/i.test(ua)) {
      baseName = browser ? `Android · ${browser}` : 'Mobile Browser';
    } else {
      baseName = 'Mobile Browser';
    }
  } else if (/Windows|Macintosh|Mac OS|Linux|CrOS/i.test(ua)) {
    const os = /Windows/i.test(ua)
      ? 'Windows PC'
      : /Macintosh|Mac OS/i.test(ua)
        ? 'Mac'
        : /CrOS/i.test(ua)
          ? 'Chromebook'
          : 'Linux PC';
    const browser = /Edg\//i.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/i.test(ua)
        ? 'Opera'
        : /Firefox\//i.test(ua)
          ? 'Firefox'
          : /Chrome\//i.test(ua)
            ? 'Chrome'
            : /Safari\//i.test(ua)
              ? 'Safari'
              : '';
    baseName = browser ? `${os} · ${browser}` : os;
  }

  const existing = (params?.existingNames || []).map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (existing.includes(baseName.toLowerCase())) {
    const suffix = params?.deviceId ? params.deviceId.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase() : '';
    if (suffix && !existing.includes(`${baseName} (${suffix})`.toLowerCase())) {
      return `${baseName} (${suffix})`.slice(0, MAX_DEVICE_NAME_LENGTH);
    }
    let counter = 2;
    while (existing.includes(`${baseName} #${counter}`.toLowerCase())) {
      counter++;
    }
    return `${baseName} #${counter}`.slice(0, MAX_DEVICE_NAME_LENGTH);
  }

  return baseName.slice(0, MAX_DEVICE_NAME_LENGTH);
}

function detectDevicePlatform(): string {
  if (Capacitor.isNativePlatform()) {
    return 'Android App';
  }
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')) {
    return 'Android Browser';
  }
  return 'Web / Desktop';
}

/**
 * Registers or refreshes the current device under the active cloud shop in Supabase
 * `hospivo_sync_events` (`entity_type = 'device'`) and updates the local cache.
 */
export async function registerCurrentDeviceInCloud(
  overrideDeviceName?: string
): Promise<ConnectedDeviceInfo | null> {
  const config = await getCloudConfig();
  const resolvedDeviceId = config.deviceId || 'device-local';
  const savedDeviceItem = await db.settings.get('device_name');
  const savedDeviceName = ((savedDeviceItem?.value as string) || '').trim();

  let existingOtherNames: string[] = [];
  try {
    const cacheItem = await db.settings.get('connected_devices_cache');
    const cached = Array.isArray(cacheItem?.value) ? (cacheItem.value as ConnectedDeviceInfo[]) : [];
    existingOtherNames = cached
      .filter((d) => d?.deviceId && d.deviceId !== resolvedDeviceId && d.deviceName)
      .map((d) => d.deviceName);
  } catch {
    // Non-fatal
  }

  let deviceName = (overrideDeviceName || savedDeviceName || '').trim();
  if (!deviceName) {
    deviceName = detectDefaultDeviceName({
      deviceId: resolvedDeviceId,
      existingNames: existingOtherNames,
    });
    await db.settings.put({ key: 'device_name', value: deviceName });
  }
  const platform = detectDevicePlatform();
  const lastSeenAt = new Date().toISOString();

  const currentInfo: ConnectedDeviceInfo = {
    deviceId: resolvedDeviceId,
    deviceName,
    platform,
    appVersion: APP_VERSION,
    lastSeenAt,
    isCurrentDevice: true,
  };

  // Always update local cache first
  try {
    const cacheItem = await db.settings.get('connected_devices_cache');
    const existingList = Array.isArray(cacheItem?.value) ? (cacheItem.value as ConnectedDeviceInfo[]) : [];
    const nextList = [
      currentInfo,
      ...existingList
        .filter((d) => d.deviceId !== resolvedDeviceId)
        .map((d) => ({ ...d, isCurrentDevice: false })),
    ];
    await db.settings.put({ key: 'connected_devices_cache', value: nextList });
  } catch {
    // Non-fatal
  }

  if (!config.cloudEnabled || !isBackendConfigured()) {
    return currentInfo;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return currentInfo;
  }

  try {
    const session = await getCurrentCloudSession();
    if (!session.isAuthenticated || !session.cloudShopUuid) {
      return currentInfo;
    }

    const eventId = `device:${session.cloudShopUuid}:${resolvedDeviceId}`;
    const payloadObj = {
      device_id: resolvedDeviceId,
      deviceId: resolvedDeviceId,
      device_name: deviceName,
      deviceName,
      platform,
      app_version: APP_VERSION,
      appVersion: APP_VERSION,
      user_id: session.user?.id || null,
      userId: session.user?.id || null,
      store_id: session.cloudShopUuid,
      storeId: session.cloudShopUuid,
      last_active_at: lastSeenAt,
      lastActiveAt: lastSeenAt,
      lastSeenAt,
      shopSyncId: config.shopSyncId,
    };

    const eventRow = {
      id: eventId,
      shop_id: session.cloudShopUuid,
      shop_sync_id: config.shopSyncId,
      entity_type: 'device',
      entity_id: resolvedDeviceId,
      payload_json: JSON.stringify(payloadObj),
      client_created_at: Date.now(),
    };

    const { error: upsertErr } = await supabase
      .from('hospivo_sync_events')
      .upsert([eventRow], { onConflict: 'id' });

    if (upsertErr) {
      await supabase.from('hospivo_sync_events').insert([
        {
          ...eventRow,
          id: `${eventId}:${Date.now()}`,
        },
      ]);
    }
  } catch (err) {
    console.warn('Could not register device in cloud:', err);
  }

  return currentInfo;
}

/**
 * Lists all devices connected to the active cloud shop (deduplicated by deviceId),
 * merging remote Supabase `device` events with the local cache and current device.
 */
export async function listConnectedDevices(): Promise<ConnectedDeviceInfo[]> {
  const config = await getCloudConfig();
  const resolvedDeviceId = config.deviceId || 'device-local';
  const byId = new Map<string, ConnectedDeviceInfo>();

  // 1. Seed from local cache
  try {
    const cacheItem = await db.settings.get('connected_devices_cache');
    const cached = Array.isArray(cacheItem?.value) ? (cacheItem.value as ConnectedDeviceInfo[]) : [];
    for (const d of cached) {
      if (d?.deviceId) {
        byId.set(d.deviceId, {
          ...d,
          isCurrentDevice: d.deviceId === resolvedDeviceId,
        });
      }
    }
  } catch {
    // Ignore cache read error
  }

  // 2. Always include this device
  byId.set(resolvedDeviceId, {
    deviceId: resolvedDeviceId,
    deviceName: config.deviceName,
    platform: detectDevicePlatform(),
    lastSeenAt: byId.get(resolvedDeviceId)?.lastSeenAt || new Date().toISOString(),
    isCurrentDevice: true,
  });

  // 3. Query remote devices for this cloud shop when authenticated & online
  if (config.cloudEnabled && isBackendConfigured() && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    try {
      const session = await getCurrentCloudSession();
      if (session.isAuthenticated && session.cloudShopUuid) {
        const { data, error } = await supabase
          .from('hospivo_sync_events')
          .select('entity_type, entity_id, payload_json, client_created_at, created_at')
          .eq('shop_id', session.cloudShopUuid)
          .in('entity_type', ['device', 'device_revoked'])
          .order('client_created_at', { ascending: false })
          .limit(100);

        if (!error && Array.isArray(data)) {
          const revokedAtById = new Map<string, string>();
          for (const row of data as any[]) {
            let p: Record<string, any> = {};
            if (row?.payload_json) {
              try {
                p = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
              } catch {
                p = {};
              }
            } else if (row?.payload) {
              p = row.payload;
            }
            const devId = String(p.deviceId || p.device_id || row?.entity_id || row?.device_id || '').trim();
            if (!devId) continue;
            const fallbackTs = row?.client_created_at
              ? new Date(Number(row.client_created_at)).toISOString()
              : String(row?.created_at || '');

            if (row?.entity_type === 'device_revoked') {
              const revTs = String(p.revokedAt || fallbackTs || new Date().toISOString());
              const prevRev = revokedAtById.get(devId);
              if (!prevRev || revTs > prevRev) {
                revokedAtById.set(devId, revTs);
              }
              continue;
            }

            const prev = byId.get(devId);
            const rowTime = String(p.lastActiveAt || p.last_active_at || p.lastSeenAt || fallbackTs || '');
            if (!prev || rowTime >= prev.lastSeenAt) {
              byId.set(devId, {
                deviceId: devId,
                deviceName: String(p.deviceName || p.device_name || prev?.deviceName || 'Billing Desk'),
                platform: String(p.platform || prev?.platform || 'Web / Desktop'),
                appVersion: p.appVersion || p.app_version || prev?.appVersion,
                lastSeenAt: rowTime || new Date().toISOString(),
                isCurrentDevice: devId === resolvedDeviceId,
              });
            }
          }

          for (const [revId, revTs] of revokedAtById.entries()) {
            const dev = byId.get(revId);
            if (!dev || revTs >= dev.lastSeenAt) {
              byId.delete(revId);
              if (revId === resolvedDeviceId) {
                await wipeDeviceOnRemoteRevocation();
                return [];
              }
            }
          }

          await db.settings.put({
            key: 'connected_devices_cache',
            value: Array.from(byId.values()),
          });
        }
      }
    } catch (err) {
      console.warn('Could not list connected cloud devices:', err);
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.isCurrentDevice && !b.isCurrentDevice) return -1;
    if (!a.isCurrentDevice && b.isCurrentDevice) return 1;
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
}

/**
 * Renames any linked device (including the current device), persists locally,
 * and syncs the updated device_name to Supabase `hospivo_sync_events`.
 */
export async function renameConnectedDevice(
  targetDeviceId: string,
  rawNewName: string
): Promise<ConnectedDeviceInfo[]> {
  const cleanName = rawNewName.trim().slice(0, MAX_DEVICE_NAME_LENGTH);
  if (!cleanName) {
    throw new Error('Device name cannot be empty');
  }

  const config = await getCloudConfig();
  const resolvedCurrentId = config.deviceId || 'device-local';
  const isCurrent = targetDeviceId === resolvedCurrentId;
  const nowIso = new Date().toISOString();

  if (isCurrent) {
    await db.settings.put({ key: 'device_name', value: cleanName });
  }

  let targetPlatform = isCurrent ? detectDevicePlatform() : 'Web / Desktop';
  try {
    const cacheItem = await db.settings.get('connected_devices_cache');
    const existingList = Array.isArray(cacheItem?.value) ? (cacheItem.value as ConnectedDeviceInfo[]) : [];
    const existingEntry = existingList.find((d) => d.deviceId === targetDeviceId);
    if (existingEntry?.platform) targetPlatform = existingEntry.platform;

    const updatedEntry: ConnectedDeviceInfo = {
      deviceId: targetDeviceId,
      deviceName: cleanName,
      platform: targetPlatform,
      appVersion: existingEntry?.appVersion || APP_VERSION,
      lastSeenAt: isCurrent ? nowIso : existingEntry?.lastSeenAt || nowIso,
      isCurrentDevice: isCurrent,
    };

    const nextList = [updatedEntry, ...existingList.filter((d) => d.deviceId !== targetDeviceId)];
    await db.settings.put({ key: 'connected_devices_cache', value: nextList });
  } catch {
    // Non-fatal
  }

  if (config.cloudEnabled && isBackendConfigured() && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    try {
      const session = await getCurrentCloudSession();
      if (session.isAuthenticated && session.cloudShopUuid) {
        const eventId = `device:${session.cloudShopUuid}:${targetDeviceId}`;
        const payloadObj = {
          device_id: targetDeviceId,
          deviceId: targetDeviceId,
          device_name: cleanName,
          deviceName: cleanName,
          platform: targetPlatform,
          app_version: APP_VERSION,
          appVersion: APP_VERSION,
          user_id: session.user?.id || null,
          userId: session.user?.id || null,
          store_id: session.cloudShopUuid,
          storeId: session.cloudShopUuid,
          last_active_at: nowIso,
          lastActiveAt: nowIso,
          lastSeenAt: nowIso,
          shopSyncId: config.shopSyncId,
        };
        const eventRow = {
          id: eventId,
          shop_id: session.cloudShopUuid,
          shop_sync_id: config.shopSyncId,
          entity_type: 'device',
          entity_id: targetDeviceId,
          payload_json: JSON.stringify(payloadObj),
          client_created_at: Date.now(),
        };
        const { error: upsertErr } = await supabase
          .from('hospivo_sync_events')
          .upsert([eventRow], { onConflict: 'id' });
        if (upsertErr) {
          await supabase.from('hospivo_sync_events').insert([
            {
              ...eventRow,
              id: `${eventId}:${Date.now()}`,
            },
          ]);
        }
      }
    } catch (err) {
      console.warn('Could not sync renamed device to cloud:', err);
    }
  }

  emitSyncApplied(['device']);
  return listConnectedDevices();
}

export const STALE_DEVICE_DAYS = 7;

export function isDeviceStale(lastSeenAt: string, now: Date = new Date()): boolean {
  const ts = Date.parse(lastSeenAt);
  if (!Number.isFinite(ts)) return false;
  return now.getTime() - ts > STALE_DEVICE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Completely signs out and wipes ALL local pharmacy/account data on a device
 * that was remotely deleted/revoked by the owner.
 */
export async function wipeDeviceOnRemoteRevocation(): Promise<void> {
  stopRealtimeSync();
  // 1. Delete saved local backup files BEFORE clearing settings/storage
  await deleteAllLocalBackupFiles().catch(() => {});

  // 2. Sign out of Supabase Auth locally on this device only
  if (isBackendConfigured()) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  // 3. Delete & re-open Dexie IndexedDB database (clears all tables & settings)
  await resetDatabase();

  // 4. Clear browser/WebView localStorage, sessionStorage, and Cache Storage
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  }
  if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key).catch(() => false)));
    } catch {
      // ignore
    }
  }

  emitSyncApplied(['device_revoked', 'workspace_reset']);
}

/**
 * PIN-protected remote device deletion:
 * Removes the device from Supabase `hospivo_sync_events`, emits a `device_revoked`
 * event so the target device wipes its local data and signs out, and updates local cache.
 */
export async function deleteConnectedDevice(targetDeviceId: string): Promise<ConnectedDeviceInfo[]> {
  const config = await getCloudConfig();
  const resolvedCurrentId = config.deviceId || 'device-local';
  const nowIso = new Date().toISOString();

  // 1. Remove from local cache immediately
  try {
    const cacheItem = await db.settings.get('connected_devices_cache');
    const existingList = Array.isArray(cacheItem?.value) ? (cacheItem.value as ConnectedDeviceInfo[]) : [];
    await db.settings.put({
      key: 'connected_devices_cache',
      value: existingList.filter((d) => d.deviceId !== targetDeviceId),
    });
  } catch {
    // Non-fatal
  }

  // 2. Record audit log before wiping if self-delete
  await addAudit('Cloud', 'device_deleted', targetDeviceId, 'Removed linked device from Connected Devices').catch(
    () => { }
  );

  // 3. Push `device_revoked` event & remove `device` event in Supabase
  if (config.cloudEnabled && isBackendConfigured() && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    try {
      const session = await getCurrentCloudSession();
      if (session.isAuthenticated && session.cloudShopUuid) {
        const revokeId = `device_revoked:${session.cloudShopUuid}:${targetDeviceId}`;
        const revokeRow = {
          id: revokeId,
          shop_id: session.cloudShopUuid,
          shop_sync_id: config.shopSyncId,
          entity_type: 'device_revoked',
          entity_id: targetDeviceId,
          payload_json: JSON.stringify({
            deviceId: targetDeviceId,
            revokedAt: nowIso,
            shopId: session.cloudShopUuid,
          }),
          client_created_at: Date.now(),
        };
        const { error: upsertErr } = await supabase
          .from('hospivo_sync_events')
          .upsert([revokeRow], { onConflict: 'id' });
        if (upsertErr) {
          await supabase.from('hospivo_sync_events').insert([
            { ...revokeRow, id: `${revokeId}:${Date.now()}` },
          ]);
        }

        await supabase
          .from('hospivo_sync_events')
          .delete()
          .eq('shop_id', session.cloudShopUuid)
          .eq('entity_type', 'device')
          .eq('entity_id', targetDeviceId);
      }
    } catch (err) {
      console.warn('Could not revoke device in cloud:', err);
    }
  }

  // 4. If deleting THIS device, wipe local data & sign out immediately
  if (targetDeviceId === resolvedCurrentId) {
    await wipeDeviceOnRemoteRevocation();
    return [];
  }

  emitSyncApplied(['device']);
  return listConnectedDevices();
}



