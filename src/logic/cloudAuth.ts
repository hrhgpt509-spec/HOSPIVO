import { supabase, isBackendConfigured } from '../lib/supabase';
import { db } from '../db';
import { addAudit } from '../db/audit';
import { generateShopSyncId } from './cloudSync';

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

  // Query Supabase for existing shops owned by this user
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

      const localShops = await db.shop.toArray();
      if (localShops.length > 0 && localShops[0].id) {
        await db.shop.update(localShops[0].id, {
          cloudShopUuid: existingShop.id,
          shopSyncId: existingShop.syncId,
          ownerEmail: cleanEmail,
          mode: 'cloud',
        });
      }
    }
  } catch (lookupErr) {
    console.warn('Error checking existing shops:', lookupErr);
  }

  return { user, shop: existingShop, error: null };
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
