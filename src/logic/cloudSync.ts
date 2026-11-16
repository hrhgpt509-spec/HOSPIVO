import {
  db,
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
  type StockMovement,
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
  processedCount: number;
  pendingCount: number;
  failedCount: number;
  lastError: string | null;
}

export interface HomeSyncState {
  cloudEnabled: boolean;
  status: 'local' | 'synced' | 'syncing' | 'offline' | 'failed';
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  chipLabel: string;
  chipColorClass: string;
  bannerVisible: boolean;
  bannerType: 'offline' | 'failed' | null;
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
  const cloudUrl = (urlItem?.value as string) || envUrl;
  const cloudAnonKey = (keyItem?.value as string) || envKey;
  const deviceName = (deviceItem?.value as string) || 'Counter PC 1 (Billing Desk)';
  const lastCloudSyncAt = (lastSyncItem?.value as number) || null;
  const lastStatus = (statusItem?.value as CloudConfig['lastStatus']) || 'never';
  const lastError = (errorItem?.value as string) || null;
  const lastPulledSeq = (seqItem?.value as number) || 0;

  return {
    cloudEnabled,
    cloudUrl,
    cloudAnonKey,
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

let isSyncRunning = false;

/**
 * Appends a record to the syncOutbox table whenever cloudEnabled is true.
 * Returns the created syncOutbox item ID, or null if cloud mode is disabled.
 */
export async function enqueueSyncItem(
  entityType: SyncEntityType,
  entityId: string | number,
  payload: unknown
): Promise<number | null> {
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

  // Non-blocking sync cycle trigger only if credentials configured
  if (config.cloudUrl && config.cloudAnonKey) {
    runSyncCycle().catch(() => {});
  }

  return id as number;
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

  const entityType = event.entity_type as SyncEntityType;

  switch (entityType) {
    case 'medicine': {
      const med = (payload.medicine || payload) as Medicine;
      if (med && (med.name || med.id)) {
        const existing = med.id ? await db.medicines.get(Number(med.id)) : null;
        if (existing) {
          await db.medicines.update(Number(med.id), { ...med, id: Number(med.id) });
        } else {
          let matched = null;
          if (med.shortCode) {
            matched = await db.medicines.where('shortCode').equals(med.shortCode).first();
          }
          if (!matched && med.barcode) {
            matched = await db.medicines.where('barcode').equals(med.barcode).first();
          }
          if (matched && matched.id) {
            await db.medicines.update(matched.id, { ...med, id: matched.id });
          } else {
            await db.medicines.put(med);
          }
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
        if (existing && existing.id) {
          await db.batches.update(existing.id, { ...batch, id: existing.id });
        } else {
          await db.batches.put(batch);
        }
      }
      break;
    }

    case 'supplier': {
      const supp = (payload.supplier || payload) as Supplier;
      if (supp && supp.name) {
        const existing = supp.id ? await db.suppliers.get(Number(supp.id)) : null;
        if (existing) {
          await db.suppliers.update(Number(supp.id), supp);
        } else {
          await db.suppliers.put(supp);
        }
      }
      break;
    }

    case 'customer': {
      const cust = (payload.customer || payload) as Customer;
      if (cust && cust.name) {
        const existing = cust.id ? await db.customers.get(Number(cust.id)) : null;
        if (existing) {
          await db.customers.update(Number(cust.id), cust);
        } else {
          await db.customers.put(cust);
        }
      }
      break;
    }

    case 'staff': {
      const user = (payload.user || payload) as DBUser & { approvalPin?: { hash: string; salt: string } };
      if (user && user.id) {
        const existing = await db.users.get(String(user.id));
        const userData: DBUser = {
          id: String(user.id),
          name: user.name || (user.id === 'owner' ? 'Owner' : 'Staff'),
          role: user.role || (user.id === 'owner' ? 'owner' : 'cashier'),
          pinHash: user.pinHash,
          pinSalt: user.pinSalt,
          pinLength: user.pinLength || 4,
          active: user.active !== false,
          createdAt: user.createdAt || new Date().toISOString(),
          ...(user.authUserId ? { authUserId: user.authUserId } : existing?.authUserId ? { authUserId: existing.authUserId } : {}),
        };

        if (existing) {
          await db.users.update(String(user.id), userData);
        } else {
          await db.users.put(userData);
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
      const items = payload.items as BillItem[];
      if (bill && (bill.id || bill.billNo)) {
        const existing = bill.id ? await db.bills.get(Number(bill.id)) : null;
        if (existing) {
          await db.bills.update(Number(bill.id), bill);
        } else {
          await db.bills.put(bill);
        }
        if (Array.isArray(items)) {
          for (const itm of items) {
            const ex = itm.id ? await db.billItems.get(Number(itm.id)) : null;
            if (!ex) {
              await db.billItems.put(itm);
            }
          }
        }
      }
      break;
    }

    case 'bill_return': {
      const ret = (payload.billReturn || payload) as BillReturn;
      if (ret && (ret.id || ret.returnNo)) {
        await db.billReturns.put(ret);
      }
      break;
    }

    case 'purchase': {
      const purchase = (payload.purchase || payload) as Purchase;
      if (purchase && purchase.id) {
        await db.purchases.put(purchase);
      }
      break;
    }

    case 'stock_movement': {
      const movement = (payload.movement || payload) as StockMovement;
      if (movement && movement.at && movement.batchId) {
        const existing = movement.id ? await db.stockMovements.get(Number(movement.id)) : null;
        if (!existing) {
          const dup = await db.stockMovements
            .where('batchId')
            .equals(Number(movement.batchId))
            .filter((m) => m.at === movement.at && m.qtyUnits === movement.qtyUnits && m.type === movement.type)
            .first();
          if (!dup) {
            await db.stockMovements.put(movement);
          }
        }
      }
      break;
    }

    case 'udhaar_payment': {
      const payment = (payload.payment || payload) as UdhaarPayment;
      if (payment && payment.id) {
        const existing = await db.udhaarPayments.get(Number(payment.id));
        if (!existing) {
          await db.udhaarPayments.put(payment);
        }
      }
      break;
    }

    case 'daily_closing': {
      const closing = (payload.closing || payload) as DailyClosing;
      if (closing && (closing.id || closing.date)) {
        const existing = closing.id ? await db.dailyClosings.get(Number(closing.id)) : null;
        if (existing) {
          await db.dailyClosings.update(Number(closing.id), closing);
        } else {
          await db.dailyClosings.put(closing);
        }
      }
      break;
    }

    case 'audit': {
      const audit = payload.audit || payload;
      if (audit && audit.timestamp && audit.action) {
        const existing = audit.id ? await db.auditLog.get(Number(audit.id)) : null;
        if (!existing) {
          await db.auditLog.put(audit);
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
        } catch (applyErr) {
          console.warn('Failed to apply remote event:', applyErr);
        }
      }

      if (typeof event.seq === 'number' && event.seq > currentSeq) {
        currentSeq = event.seq;
      }
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

/**
 * Runs a sync cycle, processing pending syncOutbox items in FIFO order,
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

    // Check offline status
    const isOffline =
      typeof navigator !== 'undefined' &&
      navigator.onLine === false &&
      !options?.force &&
      !options?.loopbackTransport;

    if (isOffline) {
      await saveCloudConfig({ lastStatus: 'offline' });
      return {
        success: false,
        offline: true,
        processedCount: 0,
        pendingCount,
        failedCount: 0,
        lastError: 'Device is offline',
      };
    }

    // 1. Loopback test transport
    if (options?.loopbackTransport) {
      const ok = await options.loopbackTransport(pendingItems);
      if (ok) {
        for (const item of pendingItems) {
          if (item.id) {
            await db.syncOutbox.update(item.id, {
              status: 'synced',
              syncedAt: new Date().toISOString(),
            });
          }
        }
        await saveCloudConfig({
          lastCloudSyncAt: Date.now(),
          lastStatus: 'synced',
          lastError: null,
        });
        return {
          success: true,
          offline: false,
          processedCount: pendingCount,
          pendingCount: 0,
          failedCount: 0,
          lastError: null,
        };
      }
    }

    // Resolve cloud shop UUID
    const session = await getCurrentCloudSession();
    let cloudShopUuid = session.cloudShopUuid;
    if (!cloudShopUuid && session.user) {
      try {
        const shops = await db.shop.toArray();
        const currentShopName = shops[0]?.name || 'My Medical Store';
        const prov = await provisionCloudShop(currentShopName, config.shopSyncId);
        cloudShopUuid = prov.shopUuid;
      } catch (provErr) {
        console.warn('Auto-provision shop warning:', provErr);
      }
    }

    // 2. Remote push phase
    if (pendingCount > 0) {
      if (isBackendConfigured() && cloudShopUuid) {
        try {
          const events = pendingItems.map((item) => {
            let parsedPayload: any = null;
            try {
              parsedPayload = JSON.parse(item.payloadJson);
            } catch {
              parsedPayload = item.payloadJson;
            }
            return {
              shop_id: cloudShopUuid,
              shop_sync_id: config.shopSyncId,
              device_name: config.deviceName,
              device_id: config.deviceId || config.deviceName,
              entity_type: item.entityType,
              entity_id: item.entityId,
              payload_json: item.payloadJson,
              payload: parsedPayload,
              client_created_at: item.createdAt,
            };
          });

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

          // Successfully pushed batch
          for (const item of pendingItems) {
            if (item.id) {
              await db.syncOutbox.update(item.id, {
                status: 'synced',
                syncedAt: new Date().toISOString(),
              });
            }
          }
        } catch (pushErr: any) {
          const errMsg = pushErr?.message || 'Sync push network error';
          for (const item of pendingItems) {
            if (item.id) {
              await db.syncOutbox.update(item.id, {
                retryCount: (item.retryCount || 0) + 1,
                lastError: errMsg,
              });
            }
          }
          await saveCloudConfig({
            lastStatus: 'failed',
            lastError: errMsg,
          });
          return {
            success: false,
            offline: false,
            processedCount: 0,
            pendingCount,
            failedCount: pendingCount,
            lastError: errMsg,
          };
        }
      } else if (config.cloudUrl && config.cloudAnonKey) {
        // Fallback REST fetch transport
        try {
          const events = pendingItems.map((item) => ({
            shop_sync_id: config.shopSyncId,
            device_name: config.deviceName,
            entity_type: item.entityType,
            entity_id: item.entityId,
            payload: JSON.parse(item.payloadJson),
            created_at: item.createdAt,
          }));

          const cleanUrl = config.cloudUrl.replace(/\/+$/, '');
          const endpoint = `${cleanUrl}/rest/v1/hospivo_sync_events`;

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

          for (const item of pendingItems) {
            if (item.id) {
              await db.syncOutbox.update(item.id, {
                status: 'synced',
                syncedAt: new Date().toISOString(),
              });
            }
          }
        } catch (err: any) {
          const errMsg = err?.message || 'Sync network error';
          for (const item of pendingItems) {
            if (item.id) {
              await db.syncOutbox.update(item.id, {
                retryCount: (item.retryCount || 0) + 1,
                lastError: errMsg,
              });
            }
          }

          await saveCloudConfig({
            lastStatus: 'failed',
            lastError: errMsg,
          });

          return {
            success: false,
            offline: false,
            processedCount: 0,
            pendingCount,
            failedCount: pendingCount,
            lastError: errMsg,
          };
        }
      }
    }

    // 3. Remote pull phase (pull remote deltas & approvals)
    if (cloudShopUuid) {
      await pullRemoteEvents(config, cloudShopUuid).catch(() => {});
    }
    await syncApprovalRequests(config, cloudShopUuid).catch(() => {});

    await saveCloudConfig({
      lastCloudSyncAt: Date.now(),
      lastStatus: 'synced',
      lastError: null,
    });

    return {
      success: true,
      offline: false,
      processedCount: pendingCount,
      pendingCount: 0,
      failedCount: 0,
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
  runSyncCycle().catch(() => {});
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
      status: 'local',
      pendingCount: 0,
      lastSyncedAt: null,
      lastError: null,
      chipLabel: 'Local mode',
      chipColorClass: 'bg-surface-container-low text-on-surface-variant border-outline-variant',
      bannerVisible: false,
      bannerType: null,
    };
  }

  const pendingCount = await db.syncOutbox.where('status').equals('pending').count();
  if (config.lastStatus === 'failed') {
    return {
      cloudEnabled: true,
      status: 'failed',
      pendingCount,
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
      status: 'offline',
      pendingCount,
      lastSyncedAt: config.lastCloudSyncAt,
      lastError: 'Device is offline',
      chipLabel: `Offline · ${pendingCount} pending`,
      chipColorClass: 'bg-[#FEF6EE] text-[#B54708] border-[#FEDF89]',
      bannerVisible: pendingCount > 0,
      bannerType: 'offline',
    };
  }

  const timeStr = config.lastCloudSyncAt ? formatTimeHoursMinutes(config.lastCloudSyncAt) : '--:--';
  return {
    cloudEnabled: true,
    status: 'synced',
    pendingCount,
    lastSyncedAt: config.lastCloudSyncAt,
    lastError: null,
    chipLabel: `Cloud-enabled · Synced: ${timeStr}`,
    chipColorClass: 'bg-[#E8F5E9] text-[#1B8F4A] border-[#A5D6A7]',
    bannerVisible: false,
    bannerType: null,
  };
}

// ---------------------------------------------------------------------------
// BROWSER ONLINE EVENT LISTENER
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    runSyncCycle().catch(() => {});
  });
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
 * and upserts them into local Dexie IndexedDB.
 */
export async function pullAndHydrateStaffAccounts(cloudShopUuid: string): Promise<number> {
  if (!isBackendConfigured() || !cloudShopUuid) return 0;
  try {
    const { data: staffEvents, error } = await supabase
      .from('hospivo_sync_events')
      .select('*')
      .eq('shop_id', cloudShopUuid)
      .eq('entity_type', 'staff');

    if (error) {
      console.warn('pullAndHydrateStaffAccounts query error:', error);
      return 0;
    }

    if (Array.isArray(staffEvents)) {
      for (const evt of staffEvents) {
        await applyRemoteEvent(evt);
      }
      return staffEvents.length;
    }
  } catch (err) {
    console.warn('pullAndHydrateStaffAccounts exception:', err);
  }
  return 0;
}


