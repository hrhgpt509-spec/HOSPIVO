import { db } from '../db';
import {
  captureWorkspaceSnapshot,
  clearShopScopedSettings,
  clearWorkspaceTables,
  deduplicateLocalUsers,
  emitSyncApplied,
  generateShopSyncId,
  pullAndHydrateStaffAccounts,
  restoreWorkspaceSnapshot,
  runSyncCycle,
  startRealtimeSync,
  stopRealtimeSync,
  type WorkspaceSnapshot,
} from './cloudSync';
import { getCurrentCloudSession, listCloudShopsForUser } from './cloudAuth';

export const SHOP_DIRECTORY_KEY = 'shop_directory';
export const WORKSPACE_SNAPSHOT_PREFIX = 'workspace_snapshot::';
export const PREVIOUS_WORKSPACE_KEY = 'new_shop_previous_workspace';

export interface ShopDirectoryEntry {
  workspaceId: string;
  name: string;
  address: string;
  ownerName: string;
  mode: 'local' | 'cloud';
  shopSyncId: string;
  cloudShopUuid?: string;
  ownerEmail?: string;
  ownerUserId?: string;
  staffCount: number;
  updatedAt: string;
}

export function workspaceSnapshotKey(workspaceId: string): string {
  return `${WORKSPACE_SNAPSHOT_PREFIX}${workspaceId}`;
}

async function readDirectory(): Promise<ShopDirectoryEntry[]> {
  try {
    const item = await db.settings.get(SHOP_DIRECTORY_KEY);
    return Array.isArray(item?.value) ? (item.value as ShopDirectoryEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeDirectory(entries: ShopDirectoryEntry[]): Promise<void> {
  await db.settings.put({ key: SHOP_DIRECTORY_KEY, value: entries });
}

/**
 * Resolves the canonical workspaceId for the currently active Dexie shop
 * (e.g. `cloud:<uuid>` or `local:<syncId>`) and migrates legacy `'local'` scope cleanly.
 */
export async function resolveActiveWorkspaceId(): Promise<string | null> {
  const [scopeItem, shop, syncIdItem, cloudUuidItem] = await Promise.all([
    db.settings.get('active_data_scope'),
    db.shop.toCollection().first(),
    db.settings.get('shop_sync_id'),
    db.settings.get('cloud_shop_uuid'),
  ]);

  const rawScope = typeof scopeItem?.value === 'string' ? scopeItem.value : '';
  if (rawScope.startsWith('cloud:') && rawScope.length > 6) {
    return rawScope;
  }

  const cloudUuid = shop?.cloudShopUuid || (cloudUuidItem?.value as string | undefined);
  if (shop?.mode === 'cloud' && cloudUuid) {
    const id = `cloud:${cloudUuid}`;
    await db.settings.put({ key: 'active_data_scope', value: id });
    return id;
  }

  if (rawScope.startsWith('local:') && rawScope.length > 6) {
    return rawScope;
  }

  if (!shop) {
    return null;
  }

  let syncId = (shop.shopSyncId || (syncIdItem?.value as string | undefined) || '').trim().toUpperCase();
  if (!syncId) {
    syncId = generateShopSyncId();
    await db.settings.put({ key: 'shop_sync_id', value: syncId });
    if (shop.id !== undefined) {
      await db.shop.update(shop.id, { shopSyncId: syncId });
    }
  }

  const localWorkspaceId = `local:${syncId}`;
  await db.settings.put({ key: 'active_data_scope', value: localWorkspaceId });
  return localWorkspaceId;
}

/**
 * Registers or refreshes the currently active Dexie shop inside `shop_directory`
 * and stores its latest snapshot so switching shops never loses data.
 */
export async function registerCurrentShopInDirectory(
  overrideOwnerUserId?: string
): Promise<ShopDirectoryEntry | null> {
  const shop = await db.shop.toCollection().first();
  if (!shop) return null;

  const workspaceId = await resolveActiveWorkspaceId();
  if (!workspaceId) return null;

  const [staffCount, session, existingDir] = await Promise.all([
    db.users.filter((u) => u.active !== false).count(),
    getCurrentCloudSession().catch(() => null),
    readDirectory(),
  ]);

  const syncId =
    (shop.shopSyncId || ((await db.settings.get('shop_sync_id'))?.value as string | undefined) || '')
      .trim()
      .toUpperCase() || generateShopSyncId();

  const existing = existingDir.find((e) => e.workspaceId === workspaceId);
  const ownerUserId =
    overrideOwnerUserId ||
    (shop.mode === 'cloud' ? session?.user?.id : undefined) ||
    existing?.ownerUserId;

  const entry: ShopDirectoryEntry = {
    workspaceId,
    name: shop.name || existing?.name || 'My Medical Store',
    address: shop.address || '',
    ownerName: shop.ownerName || existing?.ownerName || '',
    mode: shop.mode === 'cloud' && workspaceId.startsWith('cloud:') ? 'cloud' : 'local',
    shopSyncId: syncId,
    ...(shop.cloudShopUuid ? { cloudShopUuid: shop.cloudShopUuid } : {}),
    ...(shop.ownerEmail || session?.ownerEmail
      ? { ownerEmail: (shop.ownerEmail || session?.ownerEmail || '').trim().toLowerCase() }
      : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    staffCount,
    updatedAt: new Date().toISOString(),
  };

  const nextDir = [entry, ...existingDir.filter((e) => e.workspaceId !== workspaceId)];
  await writeDirectory(nextDir);

  return entry;
}

/**
 * Lists all shops visible for the current signed-in cloud account OR local device mode.
 * Strictly prevents shops belonging to a different cloud account from ever appearing.
 */
export async function getAvailableShops(): Promise<{
  shops: ShopDirectoryEntry[];
  activeWorkspaceId: string | null;
  isCloudAuthenticated: boolean;
  ownerEmail: string | null;
}> {
  const activeEntry = await registerCurrentShopInDirectory();
  const activeWorkspaceId = activeEntry?.workspaceId ?? (await resolveActiveWorkspaceId());

  const session = await getCurrentCloudSession().catch(() => ({
    user: null,
    cloudShopUuid: null,
    ownerEmail: null,
    shopSyncId: null,
    isConfigured: false,
    isAuthenticated: false,
  }));

  const directory = await readDirectory();

  if (session.isAuthenticated && session.user) {
    const cleanEmail = (session.ownerEmail || session.user.email || '').trim().toLowerCase();
    const remoteShops = await listCloudShopsForUser(session.user.id);

    const byWorkspace = new Map<string, ShopDirectoryEntry>();

    // 1. Add all remote cloud shops belonging strictly to this authenticated user
    for (const remote of remoteShops) {
      const wsId = `cloud:${remote.id}`;
      const cached = directory.find((d) => d.workspaceId === wsId);
      byWorkspace.set(wsId, {
        workspaceId: wsId,
        name: remote.name || cached?.name || 'Cloud Shop',
        address: cached?.address || '',
        ownerName: cached?.ownerName || '',
        mode: 'cloud',
        shopSyncId: remote.syncId,
        cloudShopUuid: remote.id,
        ownerEmail: cleanEmail,
        ownerUserId: session.user.id,
        staffCount: cached?.staffCount ?? 0,
        updatedAt: cached?.updatedAt || new Date().toISOString(),
      });
    }

    // 2. Include locally cached directory entries that strictly belong to THIS signed-in account
    for (const entry of directory) {
      if (byWorkspace.has(entry.workspaceId)) continue;
      const belongsToAccount =
        entry.mode === 'cloud' &&
        ((entry.ownerUserId && entry.ownerUserId === session.user.id) ||
          (!entry.ownerUserId && entry.ownerEmail && entry.ownerEmail === cleanEmail));
      if (belongsToAccount) {
        byWorkspace.set(entry.workspaceId, entry);
      }
    }

    // 3. Always include the currently active workspace if it belongs to this account
    if (activeEntry && !byWorkspace.has(activeEntry.workspaceId)) {
      const activeBelongs =
        activeEntry.mode === 'cloud' &&
        (!activeEntry.ownerUserId ||
          activeEntry.ownerUserId === session.user.id ||
          activeEntry.ownerEmail === cleanEmail);
      if (activeBelongs) {
        byWorkspace.set(activeEntry.workspaceId, activeEntry);
      }
    }

    // Persist refreshed directory entries (keeping other workspaces' entries untouched in storage)
    const mergedDirectory = [...directory];
    for (const entry of byWorkspace.values()) {
      const idx = mergedDirectory.findIndex((d) => d.workspaceId === entry.workspaceId);
      if (idx >= 0) mergedDirectory[idx] = entry;
      else mergedDirectory.push(entry);
    }
    await writeDirectory(mergedDirectory);

    const shops = Array.from(byWorkspace.values()).sort((a, b) => {
      if (a.workspaceId === activeWorkspaceId) return -1;
      if (b.workspaceId === activeWorkspaceId) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    return {
      shops,
      activeWorkspaceId,
      isCloudAuthenticated: true,
      ownerEmail: cleanEmail || null,
    };
  }

  // Local mode (signed out): show strictly local shops on this device, never another cloud account's shops
  const localShops = directory.filter((e) => e.mode === 'local');
  if (activeEntry && !localShops.some((e) => e.workspaceId === activeEntry.workspaceId)) {
    localShops.unshift(activeEntry);
  }

  localShops.sort((a, b) => {
    if (a.workspaceId === activeWorkspaceId) return -1;
    if (b.workspaceId === activeWorkspaceId) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return {
    shops: localShops,
    activeWorkspaceId,
    isCloudAuthenticated: false,
    ownerEmail: null,
  };
}

/**
 * Switches the active Dexie workspace cleanly to another shop (local or cloud).
 * Saves a complete isolated snapshot of the current shop (all 20 tables + outbox + shop settings),
 * wipes active tables & shop settings, restores the target shop's isolated data (or hydrates it
 * from Supabase if it is a cloud shop not yet cached locally), and restarts silent Realtime sync.
 */
export async function switchActiveShop(
  target: ShopDirectoryEntry
): Promise<{ switched: boolean }> {
  const currentWorkspaceId = await resolveActiveWorkspaceId();
  if (currentWorkspaceId === target.workspaceId) {
    return { switched: false };
  }

  stopRealtimeSync();

  // 1. Save full isolated snapshot of the outgoing shop before leaving it
  if (
    currentWorkspaceId &&
    !currentWorkspaceId.endsWith('_setup_clean') &&
    !currentWorkspaceId.endsWith('_setup_new_shop')
  ) {
    await registerCurrentShopInDirectory();
    const outgoingSnap = await captureWorkspaceSnapshot();
    await db.settings.put({
      key: workspaceSnapshotKey(currentWorkspaceId),
      value: outgoingSnap,
    });
    if (currentWorkspaceId.startsWith('local:')) {
      await db.settings.put({ key: 'local_mode_snapshot', value: outgoingSnap });
    }
  }

  // 2. Clear active operational tables (including auditLog & syncOutbox) and shop-scoped settings
  await clearWorkspaceTables();
  await clearShopScopedSettings();

  // 3. Restore target snapshot if available locally
  const targetSnapItem = await db.settings.get(workspaceSnapshotKey(target.workspaceId));
  const targetSnap = targetSnapItem?.value as WorkspaceSnapshot | undefined;

  if (targetSnap) {
    await restoreWorkspaceSnapshot(targetSnap);
  }

  // 4. Configure active scope & cloud/local settings for the target shop
  await db.settings.put({ key: 'active_data_scope', value: target.workspaceId });
  await db.settings.put({ key: 'shop_sync_id', value: target.shopSyncId });

  if (target.mode === 'cloud' && target.cloudShopUuid) {
    await db.settings.put({ key: 'cloud_enabled', value: true });
    await db.settings.put({ key: 'cloud_shop_uuid', value: target.cloudShopUuid });
    if (target.ownerEmail) {
      await db.settings.put({ key: 'owner_email', value: target.ownerEmail });
    }

    const existingShop = await db.shop.toCollection().first();
    if (!existingShop) {
      await db.shop.add({
        name: target.name,
        ownerName: target.ownerName || 'Owner',
        address: target.address || '',
        phone: '',
        gstNo: '',
        drugLicenceNos: '',
        mode: 'cloud',
        cloudShopUuid: target.cloudShopUuid,
        shopSyncId: target.shopSyncId,
        ownerEmail: target.ownerEmail || '',
        lastPulledSeq: 0,
      });
      await db.settings.put({ key: 'last_pulled_seq', value: 0 });
    }

    // Hydrate or catch up silently from Supabase for this exact shop UUID
    try {
      if (!targetSnap) {
        await pullAndHydrateStaffAccounts(target.cloudShopUuid);
      }
      await runSyncCycle({ force: true });
      await deduplicateLocalUsers();
    } catch (syncErr) {
      console.warn('switchActiveShop cloud hydration warning:', syncErr);
    }

    void startRealtimeSync(target.cloudShopUuid).catch(() => {});
  } else {
    await db.settings.put({ key: 'cloud_enabled', value: false });
    await db.settings.delete('cloud_shop_uuid');
    await db.settings.put({ key: 'last_cloud_sync_status', value: 'never' });

    const existingShop = await db.shop.toCollection().first();
    if (!existingShop) {
      await db.shop.add({
        name: target.name,
        ownerName: target.ownerName || 'Owner',
        address: target.address || '',
        phone: '',
        gstNo: '',
        drugLicenceNos: '',
        mode: 'local',
        shopSyncId: target.shopSyncId,
      });
    } else if (existingShop.id !== undefined && existingShop.mode !== 'local') {
      await db.shop.update(existingShop.id, { mode: 'local' });
    }
  }

  await registerCurrentShopInDirectory(target.ownerUserId);

  emitSyncApplied([
    'workspace_switched',
    'shop',
    'staff',
    'bill',
    'medicine',
    'batch',
    'customer',
    'udhaar_payment',
    'sync_status',
  ]);
  return { switched: true };
}

/**
 * Prepares a clean, completely isolated workspace for creating a brand-new shop
 * via "+ Add Another Shop", safely saving the outgoing shop's snapshot first
 * so the user can either complete the new shop or cancel back cleanly.
 */
export async function prepareNewShopSetup(): Promise<{
  isCloudAuthenticated: boolean;
  ownerEmail: string | null;
}> {
  stopRealtimeSync();

  const currentWorkspaceId = await resolveActiveWorkspaceId();
  if (
    currentWorkspaceId &&
    !currentWorkspaceId.endsWith('_setup_clean') &&
    !currentWorkspaceId.endsWith('_setup_new_shop')
  ) {
    await registerCurrentShopInDirectory();
    const outgoingSnap = await captureWorkspaceSnapshot();
    await db.settings.put({
      key: workspaceSnapshotKey(currentWorkspaceId),
      value: outgoingSnap,
    });
    if (currentWorkspaceId.startsWith('local:')) {
      await db.settings.put({ key: 'local_mode_snapshot', value: outgoingSnap });
    }
    await db.settings.put({ key: PREVIOUS_WORKSPACE_KEY, value: currentWorkspaceId });
  }

  const session = await getCurrentCloudSession().catch(() => ({
    user: null,
    cloudShopUuid: null,
    ownerEmail: null,
    shopSyncId: null,
    isConfigured: false,
    isAuthenticated: false,
  }));

  // Completely clear active tables & shop-scoped settings so zero old data leaks into the new shop
  await clearWorkspaceTables();
  await clearShopScopedSettings();
  await db.settings.put({ key: 'last_pulled_seq', value: 0 });
  await db.settings.put({ key: 'cloud_enabled', value: false });
  await db.settings.put({ key: 'last_cloud_sync_status', value: 'never' });

  const cleanEmail = session.isAuthenticated
    ? (session.ownerEmail || session.user?.email || '').trim().toLowerCase()
    : '';
  if (cleanEmail) {
    await db.settings.put({ key: 'owner_email', value: cleanEmail });
  }

  await db.settings.put({
    key: 'active_data_scope',
    value: session.isAuthenticated ? 'cloud_setup_new_shop' : 'local_setup_new_shop',
  });

  emitSyncApplied(['shop', 'staff', 'sync_status']);

  return {
    isCloudAuthenticated: Boolean(session.isAuthenticated && session.user),
    ownerEmail: cleanEmail || null,
  };
}

/**
 * Cancels "+ Add Another Shop" setup and restores the previous shop workspace cleanly.
 */
export async function cancelNewShopSetup(): Promise<boolean> {
  const prevItem = await db.settings.get(PREVIOUS_WORKSPACE_KEY);
  const prevWorkspaceId = typeof prevItem?.value === 'string' ? prevItem.value : null;
  await db.settings.delete(PREVIOUS_WORKSPACE_KEY);

  if (!prevWorkspaceId) return false;

  const snapItem = await db.settings.get(workspaceSnapshotKey(prevWorkspaceId));
  const snap = snapItem?.value as WorkspaceSnapshot | undefined;
  if (!snap) return false;

  await restoreWorkspaceSnapshot(snap);
  await db.settings.put({ key: 'active_data_scope', value: prevWorkspaceId });

  if (prevWorkspaceId.startsWith('cloud:')) {
    const shopUuid = prevWorkspaceId.slice('cloud:'.length);
    if (shopUuid) {
      void startRealtimeSync(shopUuid).catch(() => {});
    }
  }

  emitSyncApplied(['shop', 'staff', 'bill', 'medicine', 'customer', 'sync_status']);
  return true;
}
