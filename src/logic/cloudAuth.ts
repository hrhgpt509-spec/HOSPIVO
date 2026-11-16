import { supabase, isBackendConfigured } from '../lib/supabase';
import { db, type DBUser } from '../db';
import { addAudit } from '../db/audit';
import { hashPin, validatePin } from './pin';
import {
  generateShopSyncId,
  runSyncCycle,
  pullAndHydrateStaffAccounts,
  syncAllUsersToCloud,
  enqueueSyncItem,
} from './cloudSync';

export interface CloudSessionInfo {
  user: { id: string; email?: string } | null;
  cloudShopUuid: string | null;
  ownerEmail: string | null;
  shopSyncId: string | null;
  isConfigured: boolean;
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
 * Checks if the user already has an existing shop; if so, hydrates local Dexie and runs syncCycle.
 */
async function hydrateOrFindExistingShop(
  user: any,
  cleanEmail: string
): Promise<{ shop: ExistingShopInfo | null; isNewShop: boolean }> {
  let existingShop: ExistingShopInfo | null = null;
  try {
    const { data: shopsData } = await supabase
      .from('shops')
      .select('id, shop_name, shop_sync_id')
      .eq('owner_user_id', user.id)
      .maybeSingle();

    if (shopsData) {
      existingShop = {
        id: shopsData.id,
        name: shopsData.shop_name,
        syncId: shopsData.shop_sync_id,
      };
    } else {
      // Check shop_members table as well
      const { data: memberData } = await supabase
        .from('shop_members')
        .select('shop_id, role, shops(id, shop_name, shop_sync_id)')
        .eq('user_id', user.id)
        .maybeSingle();

      const memberShop = (memberData as any)?.shops;
      if (memberShop) {
        existingShop = {
          id: memberShop.id,
          name: memberShop.shop_name,
          syncId: memberShop.shop_sync_id,
        };
      }
    }

    if (existingShop) {
      // Update local storage with existing shop details
      await db.settings.put({ key: 'cloud_shop_uuid', value: existingShop.id });
      await db.settings.put({ key: 'shop_sync_id', value: existingShop.syncId });
      await db.settings.put({ key: 'cloud_enabled', value: true });
      await db.settings.put({ key: 'owner_email', value: cleanEmail });

      const localShops = await db.shop.toArray();
      if (localShops.length > 0 && localShops[0].id) {
        await db.shop.update(localShops[0].id, {
          name: existingShop.name || localShops[0].name,
          cloudShopUuid: existingShop.id,
          shopSyncId: existingShop.syncId,
          ownerEmail: cleanEmail,
          mode: 'cloud',
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

      // 1. Direct pull and hydration of all staff / user accounts into local Dexie
      try {
        await pullAndHydrateStaffAccounts(existingShop.id);
      } catch (staffHydrateErr) {
        console.warn('Initial staff hydration warning:', staffHydrateErr);
      }

      // 2. Auto-trigger sync cycle to hydrate remote catalog & remaining deltas
      try {
        await runSyncCycle({ force: true });
      } catch (syncErr) {
        console.warn('Initial shop hydration warning:', syncErr);
      }

      return { shop: existingShop, isNewShop: false };
    }
  } catch (lookupErr) {
    console.warn('Error checking existing shops:', lookupErr);
  }

  return { shop: null, isNewShop: true };
}

/**
 * Sends a 6-digit OTP code to the given email address.
 * Does NOT pass emailRedirectTo so Supabase delivers the 6-digit OTP numeric code.
 */
export async function sendEmailOtp(
  email: string
): Promise<{ error: string | null }> {
  if (!isBackendConfigured()) {
    return { error: 'Backend is not configured' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: true,
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
 * Verifies a 6-digit Email OTP and checks for an existing shop on Supabase.
 * Hydrates local Dexie and runs sync cycle if found, or flags isNewShop: true.
 */
export async function verifyEmailOtp(
  email: string,
  token: string
): Promise<{
  user: any;
  shop: ExistingShopInfo | null;
  isNewShop: boolean;
  error: string | null;
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
      return { user: null, shop: null, isNewShop: false, error: error.message };
    }

    const user = data?.user || (await supabase.auth.getUser()).data.user;
    if (!user) {
      return { user: null, shop: null, isNewShop: false, error: 'User session not found' };
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
 * Signs out the current cloud owner session and updates local settings.
 */
export async function signOutOwner(): Promise<void> {
  if (isBackendConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase sign-out warning:', err);
    }
  }

  await db.settings.put({ key: 'owner_email', value: '' });
  await addAudit('Cloud', 'owner_sign_out', 'Owner', 'Signed out of cloud account');
}

/**
 * Provisions a shop row in public.shops and public.shop_members on Supabase,
 * and saves the returned cloudShopUuid in local Dexie settings.
 */
export async function provisionCloudShop(
  shopName: string,
  providedSyncId?: string
): Promise<{ shopUuid: string | null; shopSyncId: string }> {
  // Determine shop sync ID
  let shopSyncId = providedSyncId?.trim().toUpperCase();
  if (!shopSyncId) {
    const existingSyncIdItem = await db.settings.get('shop_sync_id');
    shopSyncId = (existingSyncIdItem?.value as string) || generateShopSyncId();
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

    // Check if shop already exists
    let shopUuid: string | null = null;
    const { data: existingShop } = await supabase
      .from('shops')
      .select('id, shop_name, shop_sync_id')
      .or(`owner_user_id.eq.${user.id},shop_sync_id.eq.${shopSyncId}`)
      .maybeSingle();

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

      // Persist in local Dexie
      await db.settings.put({ key: 'cloud_shop_uuid', value: shopUuid });
      await db.settings.put({ key: 'owner_email', value: user.email || '' });
      await db.settings.put({ key: 'cloud_enabled', value: true });

      const localShops = await db.shop.toArray();
      if (localShops.length > 0 && localShops[0].id) {
        await db.shop.update(localShops[0].id, {
          cloudShopUuid: shopUuid,
          ownerEmail: user.email || '',
          shopSyncId,
          mode: 'cloud',
        });
      }

      // Back up all local users to cloud and trigger sync push
      await syncAllUsersToCloud();
      try {
        await runSyncCycle({ force: true });
      } catch (syncErr) {
        console.warn('Post-provisioning user sync warning:', syncErr);
      }

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
      ownerEmail: savedEmail,
      shopSyncId: syncId,
      isConfigured: false,
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
      ownerEmail: user?.email || savedEmail,
      shopSyncId: syncId,
      isConfigured: true,
    };
  } catch (err) {
    console.warn('getCurrentCloudSession error:', err);
    return {
      user: null,
      cloudShopUuid: shopUuid,
      ownerEmail: savedEmail,
      shopSyncId: syncId,
      isConfigured: true,
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
