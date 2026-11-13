import {
  db,
  type SyncOutboxItem,
  type SyncEntityType,
  type ApprovalRequest,
} from '../db';
import { addAudit } from '../db/audit';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface CloudConfig {
  cloudEnabled: boolean;
  cloudUrl: string;
  cloudAnonKey: string;
  shopSyncId: string;
  deviceName: string;
  lastCloudSyncAt: number | null;
  lastStatus: 'synced' | 'failed' | 'offline' | 'never';
  lastError: string | null;
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
    lastSyncItem,
    statusItem,
    errorItem,
  ] = await Promise.all([
    db.settings.get('cloud_enabled'),
    db.settings.get('cloud_url'),
    db.settings.get('cloud_anon_key'),
    db.settings.get('shop_sync_id'),
    db.settings.get('device_name'),
    db.settings.get('last_cloud_sync_at'),
    db.settings.get('last_cloud_sync_status'),
    db.settings.get('last_cloud_sync_error'),
  ]);

  let shopSyncId = syncIdItem?.value as string;
  if (!shopSyncId) {
    shopSyncId = generateShopSyncId();
    await db.settings.put({ key: 'shop_sync_id', value: shopSyncId });
  }

  const cloudEnabled = Boolean(enabledItem?.value ?? false);
  const cloudUrl = (urlItem?.value as string) || '';
  const cloudAnonKey = (keyItem?.value as string) || '';
  const deviceName = (deviceItem?.value as string) || 'Counter PC 1 (Billing Desk)';
  const lastCloudSyncAt = (lastSyncItem?.value as number) || null;
  const lastStatus = (statusItem?.value as CloudConfig['lastStatus']) || 'never';
  const lastError = (errorItem?.value as string) || null;

  return {
    cloudEnabled,
    cloudUrl,
    cloudAnonKey,
    shopSyncId,
    deviceName,
    lastCloudSyncAt,
    lastStatus,
    lastError,
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

/**
 * Runs a sync cycle, processing pending syncOutbox items in FIFO order.
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

    if (pendingCount === 0) {
      // Nothing to push
      if (config.lastStatus !== 'failed') {
        await saveCloudConfig({ lastStatus: 'synced' });
      }
      return {
        success: true,
        offline: false,
        processedCount: 0,
        pendingCount: 0,
        failedCount: 0,
        lastError: null,
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

    // 2. Remote Supabase REST transport
    if (config.cloudUrl && config.cloudAnonKey) {
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

        // Successfully synced batch
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

        // 3. Pull any resolved approvals from remote
        await pullRemoteApprovals(config);

        return {
          success: true,
          offline: false,
          processedCount: pendingCount,
          pendingCount: 0,
          failedCount: 0,
          lastError: null,
        };
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

    // 3. Fallback when credentials are empty: items remain pending in outbox
    return {
      success: true,
      offline: false,
      processedCount: 0,
      pendingCount,
      failedCount: 0,
      lastError: null,
    };
  } finally {
    isSyncRunning = false;
  }
}

/**
 * Pulls resolved approvals from remote Supabase table if available.
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

