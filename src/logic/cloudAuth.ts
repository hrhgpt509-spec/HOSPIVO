import { supabase, isBackendConfigured } from '../lib/supabase';
import { db, type DBUser } from '../db';
import { addAudit } from '../db/audit';
import { hashPin, validatePin } from './pin';
import {
  generateShopSyncId,
  getCloudConfig,
  runSyncCycle,
  pullRemoteEvents,
  pullAndHydrateStaffAccounts,
  syncAllUsersToCloud,
  backfillLocalDataToCloud,
  enqueueSyncItem,
  switchToCloudWorkspace,
  switchToLocalWorkspace,
  inspectLocalModeData,
  stashLocalDataAndStartCleanCloud,
  captureWorkspaceSnapshot,
  deduplicateLocalUsers,
  startRealtimeSync,
  stopRealtimeSync,
  emitSyncApplied,
  registerCurrentDeviceInCloud,
  type LocalDataSummary,
} from './cloudSync';

export type CloudSignInScenario =
  | 'direct_cloud_sync'
  | 'prompt_push_local_to_empty_cloud'
  | 'prompt_merge_local_with_cloud'
  | 'clean_cloud_setup';

export type CloudSignInChoice =
  | 'push_local'
  | 'start_clean_cloud'
  | 'merge_local_and_cloud'
  | 'use_cloud_only';

export function classifyCloudSignInScenario(params: {
  hasLocalData: boolean;
  existingShop: ExistingShopInfo | null;
  currentScope?: string | null;
}): CloudSignInScenario {
  const { hasLocalData, existingShop, currentScope } = params;
  if (existingShop) {
    if (!hasLocalData || currentScope === `cloud:${existingShop.id}`) {
      return 'direct_cloud_sync';
    }
    return 'prompt_merge_local_with_cloud';
  }
  return hasLocalData ? 'prompt_push_local_to_empty_cloud' : 'clean_cloud_setup';
}

export interface CloudSessionInfo {
  user: { id: string; email?: string } | null;
  cloudShopUuid: string | null;
  ownerEmail: string | null;
  shopSyncId: string | null;
  isConfigured: boolean;
  isAuthenticated: boolean;
}

export interface ExistingShopInfo {
  id: string;
  name: string;
  syncId: string;
}

/**
 * Signs up a new owner account on Supabase.
 */
export async function signUpOwner(
  email: string,
  password: string
): Promise<{ user: any; error: string | null }> {
  if (!isBackendConfigured()) {
    return { user: null, error: 'Backend is not configured' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
  });

  if (error) {
    return { user: null, error: error.message };
  }

  if (data?.user) {
    await db.settings.put({ key: 'owner_email', value: cleanEmail });
    await db.settings.put({ key: 'cloud_enabled', value: true });
  }

  return { user: data?.user ?? null, error: null };
}

/**
 * Signs in an existing owner with email and password, and searches for their existing shop.
 */
export async function signInOwner(
  email: string,
  password: string
): Promise<{
  user: any;
  shop: ExistingShopInfo | null;
  error: string | null;
}> {
  if (!isBackendConfigured()) {
    return { user: null, shop: null, error: 'Backend is not configured' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (error) {
    return { user: null, shop: null, error: error.message };
  }

  const user = data?.user;
  if (!user) {
    return { user: null, shop: null, error: 'User session not found' };
  }

  await db.settings.put({ key: 'owner_email', value: cleanEmail });
  await db.settings.put({ key: 'cloud_enabled', value: true });

  const shopResult = await hydrateOrFindExistingShop(user, cleanEmail);
  return { user, shop: shopResult.shop, error: null };
}

/**
 * Pure read-only lookup for ALL cloud shops belonging to the given Supabase user ID
 * (from both public.shops as owner and public.shop_members as member).
 * Supports multi-shop accounts while staying backwards-compatible with single-row test mocks.
 */
export async function listCloudShopsForUser(userId: string): Promise<ExistingShopInfo[]> {
  const seen = new Map<string, ExistingShopInfo>();

  try {
    const ownedQuery: any = supabase
      .from('shops')
      .select('id, shop_name, shop_sync_id')
      .eq('owner_user_id', userId);

    // Support both real Supabase array responses (thenable) and legacy maybeSingle-only unit test mocks
    let ownedRows: any[] = [];
    if (ownedQuery && typeof ownedQuery.then === 'function') {
      const { data } = await ownedQuery;
      if (Array.isArray(data)) ownedRows = data;
      else if (data) ownedRows = [data];
    } else if (ownedQuery && typeof ownedQuery.maybeSingle === 'function') {
      const { data } = await ownedQuery.maybeSingle();
      if (data) ownedRows = [data];
    }

    for (const row of ownedRows) {
      if (row?.id && !seen.has(row.id)) {
        seen.set(row.id, {
          id: row.id,
          name: row.shop_name,
          syncId: row.shop_sync_id,
        });
      }
    }

    const memberQuery: any = supabase
      .from('shop_members')
      .select('shop_id, role, shops(id, shop_name, shop_sync_id)')
      .eq('user_id', userId);

    let memberRows: any[] = [];
    if (memberQuery && typeof memberQuery.then === 'function') {
      const { data } = await memberQuery;
      if (Array.isArray(data)) memberRows = data;
      else if (data) memberRows = [data];
    } else if (memberQuery && typeof memberQuery.maybeSingle === 'function') {
      const { data } = await memberQuery.maybeSingle();
      if (data) memberRows = [data];
    }

    for (const row of memberRows) {
      const memberShop = row?.shops;
      if (memberShop?.id && !seen.has(memberShop.id)) {
        seen.set(memberShop.id, {
          id: memberShop.id,
          name: memberShop.shop_name,
          syncId: memberShop.shop_sync_id,
        });
      }
    }
  } catch (lookupErr) {
    console.warn('Error listing existing cloud shops:', lookupErr);
  }

  return Array.from(seen.values());
}

/**
 * Pure read-only lookup for an existing cloud shop belonging to the given Supabase user ID.
 */
export async function findExistingCloudShop(userId: string): Promise<ExistingShopInfo | null> {
  const shops = await listCloudShopsForUser(userId);
  return shops[0] ?? null;
}

/**
 * Hydrates an existing cloud shop cleanly WITHOUT mixing local-only records into the cloud.
 * Any prior local-mode records are safely stashed in `local_mode_snapshot`.
 */
export async function hydrateExistingCloudShopOnly(
  existingShop: ExistingShopInfo,
  cleanEmail: string
): Promise<void> {
  await db.settings.put({ key: 'cloud_shop_uuid', value: existingShop.id });
  await db.settings.put({ key: 'shop_sync_id', value: existingShop.syncId });
  await db.settings.put({ key: 'cloud_enabled', value: true });
  await db.settings.put({ key: 'owner_email', value: cleanEmail });

  // Isolate local-only workspace from cloud shop data so local staff/bills never duplicate or mix
  await switchToCloudWorkspace(existingShop.id, {
    name: existingShop.name,
    syncId: existingShop.syncId,
    ownerEmail: cleanEmail,
  });

  // 1. Direct pull and hydration of all staff / user accounts into local Dexie (ordered & deduplicated)
  try {
    await pullAndHydrateStaffAccounts(existingShop.id);
  } catch (staffHydrateErr) {
    console.warn('Initial staff hydration warning:', staffHydrateErr);
  }

  // 2. Auto-trigger sync cycle to hydrate remote catalog, bills, inventory, batches, and Udhaar
  try {
    await runSyncCycle({ force: true });
  } catch (syncErr) {
    console.warn('Initial shop hydration warning:', syncErr);
  }

  // 3. Final deduplication pass, register device, and start silent Realtime subscription
  await deduplicateLocalUsers().catch(() => {});
  void registerCurrentDeviceInCloud().catch(() => {});
  void startRealtimeSync(existingShop.id).catch(() => {});
}

/**
 * Merges existing local mode data with an existing cloud shop using strict deduplication
 * (no duplicate staff like "Suraj Dev", no duplicate bills/stock movements), then syncs both ways.
 */
export async function mergeLocalWithCloudShop(
  existingShop: ExistingShopInfo,
  cleanEmail: string
): Promise<void> {
  await db.settings.put({ key: 'cloud_shop_uuid', value: existingShop.id });
  await db.settings.put({ key: 'shop_sync_id', value: existingShop.syncId });
  await db.settings.put({ key: 'cloud_enabled', value: true });
  await db.settings.put({ key: 'owner_email', value: cleanEmail });
  await db.settings.put({ key: 'active_data_scope', value: `cloud:${existingShop.id}` });
  await db.settings.put({ key: 'last_pulled_seq', value: 0 });

  // Update local shop record in place (preserving local shop profile while linking cloud shop)
  const localShops = await db.shop.toArray();
  if (localShops.length > 0 && localShops[0].id !== undefined) {
    await db.shop.update(localShops[0].id, {
      name: existingShop.name || localShops[0].name,
      cloudShopUuid: existingShop.id,
      shopSyncId: existingShop.syncId,
      ownerEmail: cleanEmail,
      mode: 'cloud',
      lastPulledSeq: 0,
    });
  } else {
    await db.shop.add({
      name: existingShop.name,
      ownerName: 'Owner',
      address: '',
      phone: '',
      gstNo: '',
      drugLicenceNos: '',
      mode: 'cloud',
      cloudShopUuid: existingShop.id,
      shopSyncId: existingShop.syncId,
      ownerEmail: cleanEmail,
      lastPulledSeq: 0,
    });
  }

  // 1. Pull cloud staff first (ordered & deduplicated against local staff like "Suraj Dev")
  try {
    await pullAndHydrateStaffAccounts(existingShop.id);
  } catch (staffErr) {
    console.warn('Merge staff hydration warning:', staffErr);
  }

  // 2. Pull all existing cloud events and merge idempotently into local Dexie
  try {
    const cfg = await getCloudConfig();
    await pullRemoteEvents(cfg, existingShop.id);
  } catch (pullErr) {
    console.warn('Merge remote pull warning:', pullErr);
  }

  // 3. Enforce strict user deduplication before pushing merged data back to cloud
  await deduplicateLocalUsers().catch(() => {});

  // 4. Push merged local + cloud records cleanly to Supabase so all devices stay consistent
  try {
    await backfillLocalDataToCloud();
  } catch (backfillErr) {
    console.warn('Merge backfill warning:', backfillErr);
  }

  emitSyncApplied(['shop', 'staff', 'bill', 'medicine', 'batch', 'customer', 'udhaar_payment', 'sync_status']);
  void registerCurrentDeviceInCloud().catch(() => {});
  void startRealtimeSync(existingShop.id).catch(() => {});
}

/**
 * Applies the user's explicit decision after signing in with Email OTP:
 *  - 'push_local': Local setup -> Empty cloud account (YES)
 *  - 'start_clean_cloud': Local setup -> Empty cloud account (NO)
 *  - 'merge_local_and_cloud': Local data -> Existing cloud shop (YES)
 *  - 'use_cloud_only': Local data -> Existing cloud shop (NO)
 */
export async function resolveCloudSignInChoice(params: {
  choice: CloudSignInChoice;
  email: string;
  existingShop?: ExistingShopInfo | null;
  localShopName?: string;
  shopSyncId?: string;
}): Promise<{
  cloudShopUuid?: string;
  shopName?: string;
  shopSyncId?: string;
  startedCleanSetup?: boolean;
}> {
  const cleanEmail = params.email.trim().toLowerCase();

  if (params.choice === 'push_local') {
    const localShop = (await db.shop.toArray())[0];
    const resolvedName = (params.localShopName || localShop?.name || '').trim();
    if (!resolvedName) {
      return {};
    }
    const prov = await provisionCloudShop(resolvedName, params.shopSyncId || localShop?.shopSyncId);
    return {
      cloudShopUuid: prov.shopUuid || undefined,
      shopName: resolvedName,
      shopSyncId: prov.shopSyncId,
    };
  }

  if (params.choice === 'start_clean_cloud') {
    await stashLocalDataAndStartCleanCloud(cleanEmail);
    return {
      startedCleanSetup: true,
    };
  }

  if (params.choice === 'merge_local_and_cloud' && params.existingShop) {
    await mergeLocalWithCloudShop(params.existingShop, cleanEmail);
    return {
      cloudShopUuid: params.existingShop.id,
      shopName: params.existingShop.name,
      shopSyncId: params.existingShop.syncId,
    };
  }

  if (params.choice === 'use_cloud_only' && params.existingShop) {
    await hydrateExistingCloudShopOnly(params.existingShop, cleanEmail);
    return {
      cloudShopUuid: params.existingShop.id,
      shopName: params.existingShop.name,
      shopSyncId: params.existingShop.syncId,
    };
  }

  return {};
}

/**
 * Checks if the user already has an existing shop; if so, hydrates local Dexie and runs syncCycle.
 */
async function hydrateOrFindExistingShop(
  user: any,
  cleanEmail: string
): Promise<{ shop: ExistingShopInfo | null; isNewShop: boolean }> {
  const existingShop = await findExistingCloudShop(user.id);
  if (existingShop) {
    await hydrateExistingCloudShopOnly(existingShop, cleanEmail);
    return { shop: existingShop, isNewShop: false };
  }
  return { shop: null, isNewShop: true };
}

export const ACCOUNT_NOT_FOUND_MESSAGE =
  'No account found for this email. Please set up your account.';
export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Please check your internet and try again.';
export const RATE_LIMIT_MESSAGE = 'Too many tries. Please wait a minute and try again.';

export type SendOtpErrorCode = 'account_not_found' | 'network' | 'rate_limited' | 'unknown';

function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  const e = err as { name?: string; message?: string; status?: number; code?: string } | null;
  if (!e) return false;
  if (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || e.name === 'AbortError') return true;
  if (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504) return true;
  if (e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.code === 'ENOTFOUND') return true;
  return /failed to fetch|fetch failed|network|networkerror|load failed|timed? ?out|abort|connection|offline|econnrefused/i.test(
    e.message || ''
  );
}

function isRateLimited(err: unknown): boolean {
  const e = err as { status?: number; code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.status === 429 ||
    e.code === 'over_email_send_rate_limit' ||
    e.code === 'over_request_rate_limit' ||
    /rate limit|too many requests/i.test(e.message || '')
  );
}

function isUserNotFound(err: unknown): boolean {
  const e = err as { name?: string; message?: string; status?: number; code?: string } | null;
  if (!e) return false;
  const msg = (e.message || '').toLowerCase();
  const code = (e.code || '').toLowerCase();
  if (
    code === 'otp_disabled' ||
    code === 'user_not_found' ||
    code === 'signup_disabled' ||
    code === 'invalid_grant'
  ) {
    return true;
  }
  if (
    /signups? not allowed|user not found|invalid grant|no user|account not found|not registered|does not exist|cannot create/i.test(
      msg
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Sends a 6-digit OTP code to the given email address.
 * Does NOT pass emailRedirectTo so Supabase delivers the 6-digit OTP numeric code.
 *
 * Sign-in (default): shouldCreateUser is false, so Supabase refuses to send an OTP for an
 * email that has no account (e.g. after all cloud data was wiped). Any such auth rejection
 * (user not found, signups not allowed, invalid grant, ...) returns
 * { success: false, errorCode: 'account_not_found' } and no OTP is sent.
 * Network failures and rate limits get their own clear messages. This function never throws.
 * New-shop setup passes { createUser: true } to allow creating the account.
 */
export async function sendEmailOtp(
  email: string,
  options: { createUser?: boolean } = {}
): Promise<{ success: boolean; error: string | null; errorCode?: SendOtpErrorCode }> {
  if (!isBackendConfigured()) {
    return { success: false, error: 'Backend is not configured' };
  }

  const createUser = options.createUser === true;
  const cleanEmail = email.trim().toLowerCase();

  let error: unknown = null;
  try {
    const res = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: createUser,
      },
    });
    error = res.error;
  } catch (thrown) {
    // fetch itself failed (offline, DNS, CORS) or the client threw
    console.warn('sendEmailOtp exception:', thrown);
    if (isRateLimited(thrown)) {
      return { success: false, error: RATE_LIMIT_MESSAGE, errorCode: 'rate_limited' };
    }
    if (isNetworkFailure(thrown)) {
      return { success: false, error: NETWORK_ERROR_MESSAGE, errorCode: 'network' };
    }
    if (!createUser && isUserNotFound(thrown)) {
      return { success: false, error: ACCOUNT_NOT_FOUND_MESSAGE, errorCode: 'account_not_found' };
    }
    const msg = (thrown as { message?: string })?.message;
    return { success: false, error: msg || NETWORK_ERROR_MESSAGE, errorCode: 'network' };
  }

  if (error) {
    if (isNetworkFailure(error)) {
      return { success: false, error: NETWORK_ERROR_MESSAGE, errorCode: 'network' };
    }
    if (isRateLimited(error)) {
      return { success: false, error: RATE_LIMIT_MESSAGE, errorCode: 'rate_limited' };
    }
    if (
      !createUser &&
      (isUserNotFound(error) ||
        (error as any).status === 400 ||
        (error as any).status === 403 ||
        (error as any).status === 422)
    ) {
      // shouldCreateUser:false -> Supabase rejects emails that have no account
      return { success: false, error: ACCOUNT_NOT_FOUND_MESSAGE, errorCode: 'account_not_found' };
    }
    const msg = (error as { message?: string }).message;
    return { success: false, error: msg || 'Could not send OTP', errorCode: 'unknown' };
  }

  await db.settings.put({ key: 'owner_email', value: cleanEmail });
  await db.settings.put({ key: 'cloud_enabled', value: true });

  return { success: true, error: null };
}

/**
 * Verifies a 6-digit Email OTP and checks for an existing shop on Supabase.
 * When `options.deferHydration` is true (interactive UI), returns the detected
 * `scenario` and `localSummary` so the UI can ask the user before pushing/merging local data:
 *  - 'direct_cloud_sync': existing cloud shop with no conflicting local data -> hydrates seamlessly
 *  - 'prompt_push_local_to_empty_cloud': local data exists + empty cloud account -> prompt YES/NO
 *  - 'prompt_merge_local_with_cloud': local data exists + existing cloud shop -> prompt YES/NO
 *  - 'clean_cloud_setup': no local data + empty cloud account -> proceed cleanly with cloud setup
 */
export async function verifyEmailOtp(
  email: string,
  token: string,
  options?: { deferHydration?: boolean }
): Promise<{
  user: any;
  shop: ExistingShopInfo | null;
  isNewShop: boolean;
  scenario?: CloudSignInScenario;
  localSummary?: LocalDataSummary;
  error: string | null;
  errorCode?: SendOtpErrorCode;
}> {
  if (!isBackendConfigured()) {
    return { user: null, shop: null, isNewShop: false, error: 'Backend is not configured' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = token.trim();

  if (!cleanToken || cleanToken.length !== 6) {
    return { user: null, shop: null, isNewShop: false, error: 'Please enter a valid 6-digit OTP' };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
    });

    if (error) {
      if (isNetworkFailure(error)) {
        return { user: null, shop: null, isNewShop: false, error: NETWORK_ERROR_MESSAGE, errorCode: 'network' };
      }
      return { user: null, shop: null, isNewShop: false, error: error.message };
    }

    const user = data?.user || (await supabase.auth.getUser()).data.user;
    if (!user) {
      return { user: null, shop: null, isNewShop: false, error: 'User session not found' };
    }

    if (options?.deferHydration) {
      const existingShop = await findExistingCloudShop(user.id);
      const localCheck = await inspectLocalModeData(existingShop?.id);
      const scenario = classifyCloudSignInScenario({
        hasLocalData: localCheck.hasLocalData,
        existingShop,
        currentScope: localCheck.currentScope,
      });

      if (scenario === 'direct_cloud_sync' && existingShop) {
        await hydrateExistingCloudShopOnly(existingShop, cleanEmail);
        return {
          user,
          shop: existingShop,
          isNewShop: false,
          scenario,
          localSummary: localCheck.summary,
          error: null,
        };
      }

      if (scenario === 'clean_cloud_setup') {
        await db.settings.put({ key: 'owner_email', value: cleanEmail });
        return {
          user,
          shop: null,
          isNewShop: true,
          scenario,
          localSummary: localCheck.summary,
          error: null,
        };
      }

      // Prompt needed: do NOT alter local data or push/pull yet until user chooses
      await db.settings.put({ key: 'owner_email', value: cleanEmail });
      return {
        user,
        shop: existingShop,
        isNewShop: !existingShop,
        scenario,
        localSummary: localCheck.summary,
        error: null,
      };
    }

    await db.settings.put({ key: 'owner_email', value: cleanEmail });
    await db.settings.put({ key: 'cloud_enabled', value: true });

    const shopResult = await hydrateOrFindExistingShop(user, cleanEmail);
    return {
      user,
      shop: shopResult.shop,
      isNewShop: shopResult.isNewShop,
      error: null,
    };
  } catch (err: any) {
    console.warn('verifyEmailOtp exception:', err);
    if (isNetworkFailure(err)) {
      return { user: null, shop: null, isNewShop: false, error: NETWORK_ERROR_MESSAGE, errorCode: 'network' };
    }
    return { user: null, shop: null, isNewShop: false, error: err?.message || 'Failed to verify OTP' };
  }
}

/**
 * Sends a Supabase Magic Link (OTP) to the given email address.
 * Uses Supabase's built-in email service with 1-click redirect (no custom SMTP needed).
 */
export async function sendMagicLink(
  email: string
): Promise<{ error: string | null }> {
  if (!isBackendConfigured()) {
    return { error: 'Backend is not configured' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    return { error: error.message };
  }

  await db.settings.put({ key: 'owner_email', value: cleanEmail });
  await db.settings.put({ key: 'cloud_enabled', value: true });

  return { error: null };
}

/**
 * Completes sign-in from an active Supabase session (e.g. after clicking a Magic Link or redirect).
 * Checks if the user already has an existing shop; if so, hydrates local Dexie and runs syncCycle.
 * If not, returns isNewShop: true so Setup can provision a new shop.
 */
export async function completeCloudSignInFromSession(): Promise<{
  user: any;
  shop: ExistingShopInfo | null;
  isNewShop: boolean;
  error: string | null;
}> {
  if (!isBackendConfigured()) {
    return { user: null, shop: null, isNewShop: false, error: 'Backend is not configured' };
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return { user: null, shop: null, isNewShop: false, error: sessionError.message };
    }

    const user = session?.user;
    if (!user) {
      return { user: null, shop: null, isNewShop: false, error: 'No active session' };
    }

    const cleanEmail = (user.email || '').trim().toLowerCase();
    await db.settings.put({ key: 'owner_email', value: cleanEmail });
    await db.settings.put({ key: 'cloud_enabled', value: true });

    const shopResult = await hydrateOrFindExistingShop(user, cleanEmail);
    return {
      user,
      shop: shopResult.shop,
      isNewShop: shopResult.isNewShop,
      error: null,
    };
  } catch (err: any) {
    console.warn('completeCloudSignInFromSession exception:', err);
    return { user: null, shop: null, isNewShop: false, error: err?.message || 'Failed to complete sign-in' };
  }
}

/**
 * Signs out the current cloud owner session, stops all cloud sync cleanly,
 * and leaves the device's current data intact and immediately usable in Local Mode
 * without any future cloud pushes/pulls until signed back in.
 */
export async function signOutOwner(): Promise<void> {
  stopRealtimeSync();

  // Snapshot the signed-in cloud workspace cleanly under its own scope key before disconnecting
  try {
    const currentScope = (await db.settings.get('active_data_scope'))?.value as string | undefined;
    if (currentScope && currentScope.startsWith('cloud:')) {
      const snap = await captureWorkspaceSnapshot();
      await db.settings.put({ key: `workspace_snapshot::${currentScope}`, value: snap });
    }
  } catch (snapErr) {
    console.warn('Could not snapshot cloud workspace on sign-out:', snapErr);
  }

  if (isBackendConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase sign-out warning:', err);
    }
  }

  // Restore offline Local Mode snapshot if this device had Local Mode data prior to cloud sign-in
  await switchToLocalWorkspace().catch((err) => {
    console.warn('Could not restore local workspace on sign-out:', err);
  });

  await db.settings.put({ key: 'cloud_enabled', value: false });
  await db.settings.put({ key: 'owner_email', value: '' });
  await db.settings.delete('cloud_shop_uuid');
  await db.settings.put({ key: 'last_cloud_sync_status', value: 'never' });
  await db.settings.delete('last_cloud_sync_at');

  // Clear pending cloud outbox items so nothing pushes unexpectedly later
  await db.syncOutbox.where('status').equals('pending').delete().catch(() => {});

  // Ensure active db.shop is cleanly in Local Mode with no stale cloud references
  try {
    const localShops = await db.shop.toArray();
    if (localShops.length > 0 && localShops[0].id !== undefined) {
      await db.shop.update(localShops[0].id, {
        mode: 'local',
        cloudShopUuid: undefined,
        ownerEmail: undefined,
      });
    }
  } catch (err) {
    console.warn('Could not update local shop mode on sign-out:', err);
  }

  await addAudit('Cloud', 'owner_sign_out', 'Owner', 'Signed out of cloud account; continuing in Local Mode');
  emitSyncApplied(['shop', 'staff', 'bill', 'medicine', 'batch', 'customer', 'udhaar_payment', 'sync_status', 'workspace_switched']);
}

/**
 * Provisions a shop row in public.shops and public.shop_members on Supabase,
 * and saves the returned cloudShopUuid in local Dexie settings.
 * Pass `{ forceCreateNew: true }` when creating a new shop (clean setup or multi-shop "+ Add Another Shop")
 * so an existing shop belonging to the same user is NEVER reused or overwritten.
 */
export async function provisionCloudShop(
  shopName: string,
  providedSyncId?: string,
  options?: { forceCreateNew?: boolean }
): Promise<{ shopUuid: string | null; shopSyncId: string }> {
  // Determine shop sync ID
  let shopSyncId = providedSyncId?.trim().toUpperCase();
  if (!shopSyncId) {
    if (options?.forceCreateNew) {
      shopSyncId = generateShopSyncId();
    } else {
      const existingSyncIdItem = await db.settings.get('shop_sync_id');
      shopSyncId = (existingSyncIdItem?.value as string) || generateShopSyncId();
    }
  }
  await db.settings.put({ key: 'shop_sync_id', value: shopSyncId });

  if (!isBackendConfigured()) {
    // Graceful offline fallback
    const localUuid = (await db.settings.get('cloud_shop_uuid'))?.value as string || null;
    return { shopUuid: localUuid, shopSyncId };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      console.warn('provisionCloudShop: No active user session');
      const localUuid = (await db.settings.get('cloud_shop_uuid'))?.value as string || null;
      return { shopUuid: localUuid, shopSyncId };
    }

    // Check if shop already exists (skip lookup when explicitly creating a brand-new shop)
    let shopUuid: string | null = null;
    let existingShop: { id: string; shop_name: string; shop_sync_id: string } | null = null;

    if (!options?.forceCreateNew) {
      const { data } = await supabase
        .from('shops')
        .select('id, shop_name, shop_sync_id')
        .or(`owner_user_id.eq.${user.id},shop_sync_id.eq.${shopSyncId}`)
        .maybeSingle();
      existingShop = data || null;
    }

    if (existingShop) {
      shopUuid = existingShop.id;
      // Optionally update name if it changed
      if (existingShop.shop_name !== shopName) {
        await supabase
          .from('shops')
          .update({ shop_name: shopName })
          .eq('id', shopUuid);
      }
    } else {
      // Insert new shop
      const { data: newShop, error: insertError } = await supabase
        .from('shops')
        .insert({
          owner_user_id: user.id,
          shop_name: shopName,
          shop_sync_id: shopSyncId,
        })
        .select('id')
        .single();

      if (insertError) {
        throw insertError;
      }
      shopUuid = newShop.id;
    }

    // Ensure shop_members row exists
    if (shopUuid) {
      const { data: member } = await supabase
        .from('shop_members')
        .select('id')
        .eq('shop_id', shopUuid)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member) {
        await supabase.from('shop_members').insert({
          shop_id: shopUuid,
          user_id: user.id,
          role: 'owner',
        });
      }

      // Persist in local Dexie & mark active workspace scope to this cloud shop
      await db.settings.put({ key: 'cloud_shop_uuid', value: shopUuid });
      await db.settings.put({ key: 'owner_email', value: user.email || '' });
      await db.settings.put({ key: 'cloud_enabled', value: true });
      await db.settings.put({ key: 'active_data_scope', value: `cloud:${shopUuid}` });

      const localShops = await db.shop.toArray();
      if (localShops.length > 0 && localShops[0].id) {
        await db.shop.update(localShops[0].id, {
          cloudShopUuid: shopUuid,
          ownerEmail: user.email || '',
          shopSyncId,
          mode: 'cloud',
        });
      }

      // Deduplicate users and backfill all existing local shop records (staff, medicines, batches, bills, Udhaar) to cloud
      await deduplicateLocalUsers().catch(() => {});
      try {
        const backfillRes = await backfillLocalDataToCloud();
        if (!backfillRes.success) {
          await syncAllUsersToCloud();
          await runSyncCycle({ force: true });
        }
      } catch (syncErr) {
        console.warn('Post-provisioning sync warning:', syncErr);
      }

      void startRealtimeSync(shopUuid).catch(() => {});

      await addAudit(
        'Cloud',
        'shop_provisioned',
        shopName,
        `Cloud shop provisioned with UUID ${shopUuid} and Sync ID ${shopSyncId}`
      );
    }

    return { shopUuid, shopSyncId };
  } catch (err) {
    console.warn('provisionCloudShop error (offline or network failure):', err);
    const localUuid = (await db.settings.get('cloud_shop_uuid'))?.value as string || null;
    return { shopUuid: localUuid, shopSyncId };
  }
}

/**
 * Gets the current Supabase cloud session and local cloud settings safely.
 */
export async function getCurrentCloudSession(): Promise<CloudSessionInfo> {
  const shopUuid = ((await db.settings.get('cloud_shop_uuid'))?.value as string) || null;
  const syncId = ((await db.settings.get('shop_sync_id'))?.value as string) || null;
  const savedEmail = ((await db.settings.get('owner_email'))?.value as string) || null;

  if (!isBackendConfigured()) {
    return {
      user: null,
      cloudShopUuid: shopUuid,
      ownerEmail: null,
      shopSyncId: syncId,
      isConfigured: false,
      isAuthenticated: false,
    };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user
      ? { id: session.user.id, email: session.user.email }
      : null;

    return {
      user,
      cloudShopUuid: shopUuid,
      ownerEmail: user ? user.email || savedEmail : null,
      shopSyncId: syncId,
      isConfigured: true,
      isAuthenticated: Boolean(user),
    };
  } catch (err) {
    console.warn('getCurrentCloudSession error:', err);
    return {
      user: null,
      cloudShopUuid: shopUuid,
      ownerEmail: null,
      shopSyncId: syncId,
      isConfigured: true,
      isAuthenticated: false,
    };
  }
}

/**
 * Creates an Owner user with a 4-digit PIN when restoring an existing cloud shop
 * where hospivo_sync_events contains 0 staff/user records.
 * 1) Links user to authenticated Supabase user.id
 * 2) Saves owner to local Dexie users table
 * 3) Queues staff sync item and runs sync cycle to push to Supabase hospivo_sync_events
 */
export async function createRecoveryOwnerPin(params: {
  name: string;
  pin: string;
  authUserId?: string;
}): Promise<{ success: boolean; user?: DBUser; error?: string }> {
  const cleanName = params.name.trim();
  if (!cleanName) {
    return { success: false, error: 'Owner name is required' };
  }

  const pinValidation = validatePin(params.pin, true, 4);
  if (!pinValidation.valid) {
    return { success: false, error: pinValidation.error || 'PIN must be 4 digits' };
  }

  // 1. Resolve auth user ID
  let authUserId = params.authUserId;
  if (!authUserId) {
    try {
      const session = await getCurrentCloudSession();
      authUserId = session.user?.id;
    } catch {
      // offline or unconfigured
    }
  }

  // 2. Hash PIN with unique salt
  const { hash, salt } = await hashPin(params.pin);

  // 3. Create or update owner DBUser
  const ownerUser: DBUser = {
    id: 'owner',
    name: cleanName,
    role: 'owner',
    pinHash: hash,
    pinSalt: salt,
    pinLength: 4,
    active: true,
    createdAt: new Date().toISOString(),
    ...(authUserId ? { authUserId } : {}),
  };

  await db.users.put(ownerUser);

  // Update shop ownerName in db.shop if exists
  const existingShop = await db.shop.toCollection().first();
  if (existingShop) {
    await db.shop.update(existingShop.id!, {
      ownerName: cleanName,
      ...(existingShop.mode !== 'cloud' ? { mode: 'cloud' } : {}),
    });
  }

  // Ensure cloud is marked enabled if shop has a cloudShopUuid
  const cloudShopUuid =
    ((await db.settings.get('cloud_shop_uuid'))?.value as string) ||
    existingShop?.cloudShopUuid ||
    null;
  if (cloudShopUuid) {
    await db.settings.put({ key: 'cloud_enabled', value: true });
  }

  // Audit log
  await addAudit('Login', 'recovery_owner_created', cleanName, 'Owner created via recovery PIN form');

  // 4. Queue user sync event & trigger sync cycle
  const approvalPin = (await db.settings.get('approval_pin'))?.value as
    | { hash: string; salt: string }
    | undefined;
  const payload = approvalPin ? { ...ownerUser, approvalPin } : ownerUser;
  await enqueueSyncItem('staff', 'owner', payload);
  await runSyncCycle({ force: true }).catch(() => {});

  return { success: true, user: ownerUser };
}

export const MAX_CLOUD_SIGNIN_ATTEMPTS = 4;
export const CLOUD_SIGNIN_COOLDOWN_SECONDS = 60;

export interface CloudSignInFailureState {
  failedAttempts: number;
  remainingAttempts: number;
  isLockedOut: boolean;
  cooldownSeconds: number;
}

/**
 * Tracks failed cloud sign-in / OTP verification attempts:
 * Allows 4 failed attempts before starting a 60-second cooldown on the 4th failure.
 */
export function recordCloudSignInFailure(previousFailures: number): CloudSignInFailureState {
  const failedAttempts = Math.max(0, previousFailures) + 1;
  if (failedAttempts >= MAX_CLOUD_SIGNIN_ATTEMPTS) {
    return {
      failedAttempts,
      remainingAttempts: 0,
      isLockedOut: true,
      cooldownSeconds: CLOUD_SIGNIN_COOLDOWN_SECONDS,
    };
  }
  return {
    failedAttempts,
    remainingAttempts: MAX_CLOUD_SIGNIN_ATTEMPTS - failedAttempts,
    isLockedOut: false,
    cooldownSeconds: 0,
  };
}
