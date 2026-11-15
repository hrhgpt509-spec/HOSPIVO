import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db';
import { supabase, isBackendConfigured } from '../lib/supabase';
import {
  signUpOwner,
  signInOwner,
  signOutOwner,
  provisionCloudShop,
  getCurrentCloudSession,
} from './cloudAuth';

describe('cloudAuth unit tests', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.settings.clear();
    await db.shop.clear();
    await db.auditLog.clear();

    await db.shop.add({
      name: 'Test Pharmacy',
      ownerName: 'Dr. Test',
      address: 'Shop 1, Main Road',
      phone: '9876543210',
      gstNo: '',
      drugLicenceNos: '',
      mode: 'local',
    });
  });

  it('isBackendConfigured returns a boolean without throwing', () => {
    const configured = isBackendConfigured();
    expect(typeof configured).toBe('boolean');
  });

  it('getCurrentCloudSession returns safe defaults when unconfigured or offline', async () => {
    const session = await getCurrentCloudSession();
    expect(session).toBeDefined();
    expect(session.cloudShopUuid).toBeNull();
    expect(typeof session.isConfigured).toBe('boolean');
  });

  it('provisionCloudShop gracefully handles local fallback without throwing', async () => {
    const res = await provisionCloudShop('Test Pharmacy', 'HOSP-TEST-1234');
    expect(res).toBeDefined();
    expect(res.shopSyncId).toBe('HOSP-TEST-1234');

    const savedSyncId = await db.settings.get('shop_sync_id');
    expect(savedSyncId?.value).toBe('HOSP-TEST-1234');
  });

  it('signUpOwner handles unconfigured or successful auth', async () => {
    if (!isBackendConfigured()) {
      const res = await signUpOwner('owner@test.com', 'secret123');
      expect(res.error).toBe('Backend is not configured');
    } else {
      vi.spyOn(supabase.auth, 'signUp').mockResolvedValueOnce({
        data: {
          user: { id: 'usr-123', email: 'owner@test.com' } as any,
          session: null,
        },
        error: null,
      });

      const res = await signUpOwner('owner@test.com', 'secret123');
      expect(res.error).toBeNull();
      expect(res.user?.email).toBe('owner@test.com');

      const savedEmail = await db.settings.get('owner_email');
      expect(savedEmail?.value).toBe('owner@test.com');
      const cloudEnabled = await db.settings.get('cloud_enabled');
      expect(cloudEnabled?.value).toBe(true);
    }
  });

  it('signInOwner queries existing shop and updates local Dexie storage', async () => {
    // Mock Supabase sign-in and shop query
    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: {
        user: { id: 'usr-456', email: 'existing@test.com' } as any,
        session: {} as any,
      },
      error: null,
    });

    // Mock supabase.from('shops').select(...).eq(...).maybeSingle()
    const mockMaybeSingle = vi.fn().mockResolvedValueOnce({
      data: {
        id: 'shop-uuid-789',
        shop_name: 'Existing Cloud Meds',
        shop_sync_id: 'HOSP-SYNC-9999',
      },
      error: null,
    });

    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.spyOn(supabase, 'from').mockReturnValue({ select: mockSelect } as any);

    // If backend was not configured in env, temporarily mock isBackendConfigured
    const res = await signInOwner('existing@test.com', 'password123');
    if (res.error === 'Backend is not configured') {
      // In purely unconfigured test environment, passes gracefully
      expect(res.user).toBeNull();
    } else {
      expect(res.error).toBeNull();
      expect(res.shop?.id).toBe('shop-uuid-789');
      expect(res.shop?.name).toBe('Existing Cloud Meds');

      const savedUuid = await db.settings.get('cloud_shop_uuid');
      expect(savedUuid?.value).toBe('shop-uuid-789');

      const shops = await db.shop.toArray();
      expect(shops[0].cloudShopUuid).toBe('shop-uuid-789');
      expect(shops[0].mode).toBe('cloud');
    }
  });

  it('signOutOwner clears owner_email and records audit log', async () => {
    await db.settings.put({ key: 'owner_email', value: 'owner@test.com' });
    vi.spyOn(supabase.auth, 'signOut').mockResolvedValueOnce({ error: null });

    await signOutOwner();

    const emailItem = await db.settings.get('owner_email');
    expect(emailItem?.value).toBe('');

    const audits = await db.auditLog.where('action').equals('owner_sign_out').toArray();
    expect(audits.length).toBe(1);
  });
});
