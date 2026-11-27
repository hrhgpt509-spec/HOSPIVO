import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db';
import { supabase, isBackendConfigured, sanitizeEnvValue, resolveSupabaseUrl } from '../lib/supabase';
import {
  signUpOwner,
  signInOwner,
  signOutOwner,
  provisionCloudShop,
  getCurrentCloudSession,
  sendMagicLink,
  sendEmailOtp,
  verifyEmailOtp,
  completeCloudSignInFromSession,
  createRecoveryOwnerPin,
  classifyCloudSignInScenario,
  resolveCloudSignInChoice,
  recordCloudSignInFailure,
  MAX_CLOUD_SIGNIN_ATTEMPTS,
  CLOUD_SIGNIN_COOLDOWN_SECONDS,
} from './cloudAuth';
import { runWithSyncWorkspaceBypass } from '../db';
import { enqueueSyncItem, getHomeSyncState } from './cloudSync';
import { verifyPin } from './pin';

function createMockQueryChain(resolvedData: any[] = []) {
  const query: any = {
    eq: vi.fn().mockImplementation(() => query),
    gt: vi.fn().mockImplementation(() => query),
    order: vi.fn().mockImplementation(() => query),
    limit: vi.fn().mockImplementation(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData[0] || null, error: null }),
    then: (resolve: any) => Promise.resolve({ data: resolvedData, error: null }).then(resolve),
  };
  return query;
}

describe('cloudAuth unit tests', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.settings.clear();
    await db.shop.clear();

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

  it('sanitizeEnvValue and resolveSupabaseUrl handle quotes, brackets, https URLs, and /api/sb proxy', () => {
    // Sanitize quotes, brackets, and whitespace
    expect(sanitizeEnvValue('"https://example.supabase.co"')).toBe('https://example.supabase.co');
    expect(sanitizeEnvValue("'https://example.supabase.co'")).toBe('https://example.supabase.co');
    expect(sanitizeEnvValue('(https://example.supabase.co)')).toBe('https://example.supabase.co');
    expect(sanitizeEnvValue('[https://example.supabase.co]')).toBe('https://example.supabase.co');
    expect(sanitizeEnvValue('  (sb_secret_key_123)  ')).toBe('sb_secret_key_123');

    // Valid https URL is used directly
    expect(resolveSupabaseUrl('https://njsxgbslgzlzdprcngzw.supabase.co')).toBe('https://njsxgbslgzlzdprcngzw.supabase.co');
    expect(resolveSupabaseUrl('"https://njsxgbslgzlzdprcngzw.supabase.co"')).toBe('https://njsxgbslgzlzdprcngzw.supabase.co');

    // Unset or /api/sb resolves to origin + /api/sb on web
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    expect(resolveSupabaseUrl('', false)).toBe(`${origin}/api/sb`);
    expect(resolveSupabaseUrl('/api/sb', false)).toBe(`${origin}/api/sb`);
    expect(resolveSupabaseUrl('/custom/sb', false)).toBe(`${origin}/custom/sb`);

    // On native Android/iOS (Capacitor), /api/sb or unset must resolve directly to HTTPS Supabase URL
    expect(resolveSupabaseUrl('/api/sb', true)).toBe('https://njsxgbslgzlzdprcngzw.supabase.co');
    expect(resolveSupabaseUrl('', true)).toBe('https://njsxgbslgzlzdprcngzw.supabase.co');
    expect(resolveSupabaseUrl('https://custom.supabase.co', true)).toBe('https://custom.supabase.co');
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

    // Mock supabase.from with table dispatch
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'shops') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'shop-uuid-789',
                  shop_name: 'Existing Cloud Meds',
                  shop_sync_id: 'HOSP-SYNC-9999',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue(createMockQueryChain([])),
      };
    });
    vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

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

  it('hydrates empty local db.shop on a second device when signing into an existing shop', async () => {
    // Empty local shop table (simulating fresh second device)
    await db.shop.clear();
    expect(await db.shop.count()).toBe(0);

    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: {
        user: { id: 'usr-999', email: 'owner@remote.com' } as any,
        session: {} as any,
      },
      error: null,
    });

    const mockFromMulti = vi.fn().mockImplementation((table: string) => {
      if (table === 'shops') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'shop-uuid-multi',
                  shop_name: 'Remote Branch Pharmacy',
                  shop_sync_id: 'HOSP-REMO-7777',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue(createMockQueryChain([])),
      };
    });
    vi.spyOn(supabase, 'from').mockImplementation(mockFromMulti as any);

    const res = await signInOwner('owner@remote.com', 'password123');
    if (res.error !== 'Backend is not configured') {
      const shopCount = await db.shop.count();
      expect(shopCount).toBe(1);

      const shops = await db.shop.toArray();
      const restoredShop = shops[0];
      expect(restoredShop?.name).toBe('Remote Branch Pharmacy');
      expect(restoredShop?.cloudShopUuid).toBe('shop-uuid-multi');
      expect(restoredShop?.shopSyncId).toBe('HOSP-REMO-7777');
      expect(restoredShop?.mode).toBe('cloud');
    }
  });

  it('sendEmailOtp sends 6-digit OTP code with lowercase email without redirect link', async () => {
    const signInWithOtpSpy = vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValueOnce({
      data: {} as any,
      error: null,
    });

    const res = await sendEmailOtp('Owner.Store@Pharma.COM ', { createUser: true });
    expect(res.error).toBeNull();
    expect(res.success).toBe(true);

    expect(signInWithOtpSpy).toHaveBeenCalledWith({
      email: 'owner.store@pharma.com',
      options: {
        shouldCreateUser: true,
      },
    });

    const savedEmail = await db.settings.get('owner_email');
    expect(savedEmail?.value).toBe('owner.store@pharma.com');
    const cloudEnabled = await db.settings.get('cloud_enabled');
    expect(cloudEnabled?.value).toBe(true);
  });

  it('sendEmailOtp (sign-in) never creates users and returns a clear error when no account exists', async () => {
    const signInWithOtpSpy = vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValueOnce({
      data: {} as any,
      error: { message: 'Signups not allowed for otp', code: 'otp_disabled' } as any,
    });

    const res = await sendEmailOtp('Gone@Test.com');
    expect(signInWithOtpSpy).toHaveBeenCalledWith({
      email: 'gone@test.com',
      options: { shouldCreateUser: false },
    });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('account_not_found');
    expect(res.error).toBe('No account found for this email. Please set up your account.');

    // Nothing is saved when no OTP was sent
    const cloudEnabled = await db.settings.get('cloud_enabled');
    expect(cloudEnabled).toBeUndefined();
  });

  it('sendEmailOtp (sign-in) maps any auth rejection (invalid grant, user not found) to the no-account message', async () => {
    for (const rejection of [
      { message: 'Invalid grant', status: 400, code: 'invalid_grant' },
      { message: 'User not found', status: 400 },
      { message: 'Signups not allowed for this instance', status: 422 },
    ]) {
      vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValueOnce({
        data: {} as any,
        error: rejection as any,
      });
      const res = await sendEmailOtp('nobody@test.com');
      expect(res).toMatchObject({
        success: false,
        errorCode: 'account_not_found',
        error: 'No account found for this email. Please set up your account.',
      });
    }
  });

  it('sendEmailOtp never throws: network failures and rate limits return clear messages', async () => {
    // fetch itself throws (offline)
    vi.spyOn(supabase.auth, 'signInWithOtp').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const offline = await sendEmailOtp('owner@test.com');
    expect(offline.success).toBe(false);
    expect(offline.errorCode).toBe('network');
    expect(offline.error).toMatch(/internet/i);

    // Supabase returns a retryable fetch error object
    vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValueOnce({
      data: {} as any,
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } as any,
    });
    const retryable = await sendEmailOtp('owner@test.com');
    expect(retryable.errorCode).toBe('network');
    expect(retryable.error).toBe('Could not reach the server. Please check your internet and try again.');

    // Timeout / abort error
    vi.spyOn(supabase.auth, 'signInWithOtp').mockRejectedValueOnce(new DOMException('The user aborted a request.', 'AbortError'));
    const timeout = await sendEmailOtp('owner@test.com');
    expect(timeout.errorCode).toBe('network');
    expect(timeout.error).toBe('Could not reach the server. Please check your internet and try again.');

    // Rate limit must NOT be reported as "no account"
    vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValueOnce({
      data: {} as any,
      error: { message: 'Email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' } as any,
    });
    const limited = await sendEmailOtp('owner@test.com');
    expect(limited.errorCode).toBe('rate_limited');

    // Sign-up path keeps the real Supabase message (no "no account" mapping)
    vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValueOnce({
      data: {} as any,
      error: { message: 'Email address is invalid', status: 400 } as any,
    });
    const signup = await sendEmailOtp('bad@test', { createUser: true });
    expect(signup.errorCode).toBe('unknown');
    expect(signup.error).toBe('Email address is invalid');

    expect(await db.settings.get('cloud_enabled')).toBeUndefined();
  });

  it('verifyEmailOtp validates 6-digit length and returns error if invalid', async () => {
    const res = await verifyEmailOtp('owner@test.com', '123');
    expect(res.error).toBe('Please enter a valid 6-digit OTP');
    expect(res.user).toBeNull();
  });

  it('verifyEmailOtp returns network error code on connection failure', async () => {
    vi.spyOn(supabase.auth, 'verifyOtp').mockResolvedValueOnce({
      data: null as any,
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } as any,
    });
    const res = await verifyEmailOtp('owner@test.com', '123456');
    expect(res.errorCode).toBe('network');
    expect(res.error).toBe('Could not reach the server. Please check your internet and try again.');
  });

  it('verifyEmailOtp verifies OTP for new shop user', async () => {
    vi.spyOn(supabase.auth, 'verifyOtp').mockResolvedValueOnce({
      data: {
        user: { id: 'usr-otp-new', email: 'otpnew@test.com' } as any,
        session: {} as any,
      },
      error: null,
    });

    const mockFrom = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }));
    vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

    const res = await verifyEmailOtp('OtpNew@Test.COM ', '654321');
    expect(res.error).toBeNull();
    expect(res.user?.id).toBe('usr-otp-new');
    expect(res.isNewShop).toBe(true);
    expect(res.shop).toBeNull();

    const savedEmail = await db.settings.get('owner_email');
    expect(savedEmail?.value).toBe('otpnew@test.com');
  });

  it('verifyEmailOtp verifies OTP and hydrates existing shop on second device', async () => {
    await db.shop.clear();
    expect(await db.shop.count()).toBe(0);

    vi.spyOn(supabase.auth, 'verifyOtp').mockResolvedValueOnce({
      data: {
        user: { id: 'usr-otp-hydrated', email: 'branch@store.com' } as any,
        session: {} as any,
      },
      error: null,
    });

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'shops') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'shop-uuid-otp',
                  shop_name: 'OTP Verified Branch',
                  shop_sync_id: 'HOSP-OTPV-8888',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue(createMockQueryChain([])),
      };
    });
    vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

    const res = await verifyEmailOtp('branch@store.com', '123456');
    expect(res.error).toBeNull();
    expect(res.isNewShop).toBe(false);
    expect(res.shop?.id).toBe('shop-uuid-otp');
    expect(res.shop?.name).toBe('OTP Verified Branch');

    const shop = (await db.shop.toArray())[0];
    expect(shop).toBeDefined();
    expect(shop.name).toBe('OTP Verified Branch');
    expect(shop.cloudShopUuid).toBe('shop-uuid-otp');
    expect(shop.shopSyncId).toBe('HOSP-OTPV-8888');
    expect(shop.mode).toBe('cloud');
  });

  it('verifyEmailOtp hydrates shop profile and owner/staff users on clean Dexie database', async () => {
    await db.shop.clear();
    await db.users.clear();
    expect(await db.shop.count()).toBe(0);
    expect(await db.users.count()).toBe(0);

    vi.spyOn(supabase.auth, 'verifyOtp').mockResolvedValueOnce({
      data: {
        user: { id: 'usr-otp-hydrated-users', email: 'owner@durga.com' } as any,
        session: {} as any,
      },
      error: null,
    });

    const mockStaffEvents = [
      {
        id: 1,
        shop_id: 'shop-uuid-durga',
        entity_type: 'staff',
        entity_id: 'owner',
        payload_json: JSON.stringify({
          id: 'owner',
          name: 'Shri Ram Owner',
          role: 'owner',
          pinHash: 'hashed_owner_pin',
          pinSalt: 'salt_owner',
          pinLength: 4,
          active: true,
          approvalPin: { hash: 'approval_hash_1', salt: 'approval_salt_1' },
        }),
      },
      {
        id: 2,
        shop_id: 'shop-uuid-durga',
        entity_type: 'staff',
        entity_id: 'staff_1',
        payload_json: JSON.stringify({
          id: 'staff_1',
          name: 'Ramesh Cashier',
          role: 'cashier',
          pinHash: 'hashed_staff_pin',
          pinSalt: 'salt_staff',
          pinLength: 4,
          active: true,
        }),
      },
    ];

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'shops') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'shop-uuid-durga',
                  shop_name: 'Maa Durga Medical Hall',
                  shop_sync_id: 'HOSP-DURG-9999',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'hospivo_sync_events') {
        return {
          select: vi.fn().mockReturnValue(createMockQueryChain(mockStaffEvents)),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });
    vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

    const res = await verifyEmailOtp('owner@durga.com', '123456');
    expect(res.error).toBeNull();
    expect(res.isNewShop).toBe(false);
    expect(res.shop?.name).toBe('Maa Durga Medical Hall');

    // Verify shop profile is hydrated
    const shop = (await db.shop.toArray())[0];
    expect(shop).toBeDefined();
    expect(shop.name).toBe('Maa Durga Medical Hall');
    expect(shop.cloudShopUuid).toBe('shop-uuid-durga');

    // Verify owner & staff users are hydrated into Dexie db.users
    const users = await db.users.toArray();
    expect(users.length).toBe(2);

    const owner = await db.users.get('owner');
    expect(owner).toBeDefined();
    expect(owner?.name).toBe('Shri Ram Owner');
    expect(owner?.role).toBe('owner');
    expect(owner?.pinHash).toBe('hashed_owner_pin');

    const staff1 = await db.users.get('staff_1');
    expect(staff1).toBeDefined();
    expect(staff1?.name).toBe('Ramesh Cashier');
    expect(staff1?.role).toBe('cashier');

    // Verify approval PIN was also restored
    const approvalSetting = await db.settings.get('approval_pin');
    expect(approvalSetting?.value).toEqual({ hash: 'approval_hash_1', salt: 'approval_salt_1' });
  });

  it('sendMagicLink sends OTP with normalized lowercase email', async () => {
    vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValueOnce({
      data: {} as any,
      error: null,
    });

    const res = await sendMagicLink('Owner.Pharmacy@Test.COM ');
    expect(res.error).toBeNull();

    const savedEmail = await db.settings.get('owner_email');
    expect(savedEmail?.value).toBe('owner.pharmacy@test.com');
    const cloudEnabled = await db.settings.get('cloud_enabled');
    expect(cloudEnabled?.value).toBe(true);
  });

  it('completeCloudSignInFromSession handles new shop account without existing shop', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'usr-new-1', email: 'newowner@test.com' },
        } as any,
      },
      error: null,
    });

    const mockFrom = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }));
    vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

    const res = await completeCloudSignInFromSession();
    expect(res.error).toBeNull();
    expect(res.user?.id).toBe('usr-new-1');
    expect(res.isNewShop).toBe(true);
    expect(res.shop).toBeNull();
  });

  it('completeCloudSignInFromSession hydrates existing shop on second device', async () => {
    await db.shop.clear();
    expect(await db.shop.count()).toBe(0);

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'usr-existing-2', email: 'existing@store.com' },
        } as any,
      },
      error: null,
    });

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'shops') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'shop-uuid-magic',
                  shop_name: 'Magic Branch Store',
                  shop_sync_id: 'HOSP-MAGI-1111',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue(createMockQueryChain([])),
      };
    });
    vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

    const res = await completeCloudSignInFromSession();
    expect(res.error).toBeNull();
    expect(res.isNewShop).toBe(false);
    expect(res.shop?.id).toBe('shop-uuid-magic');
    expect(res.shop?.name).toBe('Magic Branch Store');

    const shop = (await db.shop.toArray())[0];
    expect(shop).toBeDefined();
    expect(shop.name).toBe('Magic Branch Store');
    expect(shop.cloudShopUuid).toBe('shop-uuid-magic');
    expect(shop.shopSyncId).toBe('HOSP-MAGI-1111');
    expect(shop.mode).toBe('cloud');
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

  it('creates and syncs a recovery Owner PIN when hospivo_sync_events has 0 users', async () => {
    await db.users.clear();
    await db.syncOutbox.clear();
    await db.settings.put({ key: 'cloud_enabled', value: true });
    await db.settings.put({ key: 'cloud_shop_uuid', value: 'shop-uuid-zero-users' });
    await db.settings.put({ key: 'shop_sync_id', value: 'HOSP-ZERO-0000' });

    // Mock getCurrentCloudSession auth user
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'usr-auth-recovered', email: 'owner@zero.com' },
        } as any,
      },
      error: null,
    });

    // Mock hospivo_sync_events insert/upsert
    const insertedEvents: any[] = [];
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'hospivo_sync_events') {
        return {
          upsert: vi.fn().mockImplementation((evts) => {
            insertedEvents.push(...evts);
            return Promise.resolve({ error: null });
          }),
          insert: vi.fn().mockImplementation((evts) => {
            insertedEvents.push(...evts);
            return Promise.resolve({ error: null });
          }),
          select: vi.fn().mockReturnValue(createMockQueryChain([])),
        };
      }
      return {
        select: vi.fn().mockReturnValue(createMockQueryChain([])),
      };
    });
    vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

    // Call createRecoveryOwnerPin
    const res = await createRecoveryOwnerPin({
      name: 'Maa Durga Owner',
      pin: '4321',
    });

    expect(res.success).toBe(true);
    expect(res.user).toBeDefined();
    expect(res.user?.name).toBe('Maa Durga Owner');
    expect(res.user?.role).toBe('owner');
    expect(res.user?.pinLength).toBe(4);
    expect(res.user?.authUserId).toBe('usr-auth-recovered');

    // Verify stored user in local Dexie
    const localUser = await db.users.get('owner');
    expect(localUser).toBeDefined();
    expect(localUser?.name).toBe('Maa Durga Owner');

    // Verify PIN works with verifyPin
    const isValidPin = await verifyPin('4321', localUser!);
    expect(isValidPin).toBe(true);
    const isWrongPin = await verifyPin('0000', localUser!);
    expect(isWrongPin).toBe(false);

    // Verify sync outbox item was created and processed
    const outboxItems = await db.syncOutbox.toArray();
    expect(outboxItems.length).toBeGreaterThan(0);
    const staffItem = outboxItems.find((item) => item.entityType === 'staff');
    expect(staffItem).toBeDefined();
    expect(staffItem?.status).toBe('synced');

    // Verify event was pushed to hospivo_sync_events
    expect(insertedEvents.length).toBeGreaterThan(0);
    const pushedStaffEvent = insertedEvents.find((e) => e.entity_type === 'staff');
    expect(pushedStaffEvent).toBeDefined();
    expect(pushedStaffEvent.shop_id).toBe('shop-uuid-zero-users');
    expect(pushedStaffEvent.entity_id).toBe('owner');
  });

  it('createRecoveryOwnerPin validates required name and 4-digit PIN', async () => {
    const invalidNameRes = await createRecoveryOwnerPin({ name: '', pin: '1234' });
    expect(invalidNameRes.success).toBe(false);
    expect(invalidNameRes.error).toBe('Owner name is required');

    const invalidPinRes = await createRecoveryOwnerPin({ name: 'Owner', pin: '12' });
    expect(invalidPinRes.success).toBe(false);
    expect(invalidPinRes.error).toBe('owner_pin_length');
  });

  describe('Strict Local vs Cloud Separation & Decision Prompts (All 5 Scenarios)', () => {
    it('classifies all 5 sign-in scenarios accurately', () => {
      // Scenario 1 / 5: Local data + empty cloud -> prompt push local
      expect(
        classifyCloudSignInScenario({ hasLocalData: true, existingShop: null, currentScope: 'local' })
      ).toBe('prompt_push_local_to_empty_cloud');

      // Scenario 2: Fresh device (no local data) + existing cloud -> direct seamless sync
      expect(
        classifyCloudSignInScenario({
          hasLocalData: false,
          existingShop: { id: 'shop-1', name: 'A', syncId: 'HOSP-1111-2222' },
          currentScope: 'local',
        })
      ).toBe('direct_cloud_sync');

      // Scenario 2b: Already bound to same cloud shop -> direct seamless sync
      expect(
        classifyCloudSignInScenario({
          hasLocalData: true,
          existingShop: { id: 'shop-1', name: 'A', syncId: 'HOSP-1111-2222' },
          currentScope: 'cloud:shop-1',
        })
      ).toBe('direct_cloud_sync');

      // Scenario 3: Local mode data + existing cloud shop -> prompt merge vs cloud-only
      expect(
        classifyCloudSignInScenario({
          hasLocalData: true,
          existingShop: { id: 'shop-1', name: 'A', syncId: 'HOSP-1111-2222' },
          currentScope: 'local',
        })
      ).toBe('prompt_merge_local_with_cloud');

      // Scenario 5: No local data + empty cloud account -> clean cloud setup
      expect(
        classifyCloudSignInScenario({ hasLocalData: false, existingShop: null, currentScope: 'local' })
      ).toBe('clean_cloud_setup');
    });

    it('Scenario 1 (Local -> Empty Cloud): prompts user; NO stashes local data without pushing to cloud; YES provisions & pushes', async () => {
      await runWithSyncWorkspaceBypass(async () => {
        await db.users.clear();
        await db.bills.clear();
        await db.syncOutbox.clear();
      });

      await db.users.put({
        id: 'staff_local_1',
        name: 'Suraj Dev',
        role: 'cashier',
        pinHash: 'h',
        pinSalt: 's',
        active: true,
      });

      vi.spyOn(supabase.auth, 'verifyOtp').mockResolvedValueOnce({
        data: { user: { id: 'usr-empty-cloud', email: 'empty@cloud.com' } as any, session: {} as any },
        error: null,
      });
      vi.spyOn(supabase, 'from').mockImplementation(() => ({
        select: vi.fn().mockReturnValue(createMockQueryChain([])),
      }) as any);

      // Deferred OTP verification must NOT wipe local data or push yet; returns prompt scenario
      const otpRes = await verifyEmailOtp('empty@cloud.com', '123456', { deferHydration: true });
      expect(otpRes.error).toBeNull();
      expect(otpRes.scenario).toBe('prompt_push_local_to_empty_cloud');
      expect(otpRes.localSummary?.usersCount).toBe(1);
      expect(await db.users.count()).toBe(1);

      // Choice NO: do NOT push local data to cloud; stash local data cleanly & start clean cloud setup
      const noRes = await resolveCloudSignInChoice({
        choice: 'start_clean_cloud',
        email: 'empty@cloud.com',
      });
      expect(noRes.startedCleanSetup).toBe(true);
      expect(await db.shop.count()).toBe(0);
      expect(await db.users.count()).toBe(0);
      expect(await db.syncOutbox.count()).toBe(0);
      expect((await db.settings.get('active_data_scope'))?.value).toBe('cloud_setup_clean');
      expect((await db.settings.get('local_mode_snapshot'))?.value).toBeDefined();

      // Now test Choice YES on a fresh local store -> pushes local data to newly provisioned cloud shop
      await db.settings.put({ key: 'active_data_scope', value: 'local' });
      await db.shop.add({
        name: 'Local Push Pharmacy',
        ownerName: 'Sunil Kumar',
        address: '',
        phone: '',
        gstNo: '',
        drugLicenceNos: '',
        mode: 'local',
      });
      await db.users.put({
        id: 'owner',
        name: 'Sunil Kumar',
        role: 'owner',
        pinHash: 'oh',
        pinSalt: 'os',
        active: true,
      });

      const pushedEvents: any[] = [];
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: { id: 'usr-empty-cloud', email: 'empty@cloud.com' } as any },
        error: null,
      });
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { user: { id: 'usr-empty-cloud', email: 'empty@cloud.com' } } as any },
        error: null,
      });
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'shops') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'shop-new-999' }, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'shop_members') {
          return {
            select: vi.fn().mockReturnValue(createMockQueryChain([])),
            insert: vi.fn().mockResolvedValue({ error: null }),
          } as any;
        }
        if (table === 'hospivo_sync_events') {
          return {
            upsert: vi.fn().mockImplementation((evts: any[]) => {
              pushedEvents.push(...evts);
              return Promise.resolve({ error: null });
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue(createMockQueryChain([])),
          } as any;
        }
        return { select: vi.fn().mockReturnValue(createMockQueryChain([])) } as any;
      });

      const yesRes = await resolveCloudSignInChoice({
        choice: 'push_local',
        email: 'empty@cloud.com',
        localShopName: 'Local Push Pharmacy',
      });
      expect(yesRes.cloudShopUuid).toBe('shop-new-999');
      expect(pushedEvents.some((e) => e.entity_type === 'staff' && e.entity_id === 'owner')).toBe(true);
    });

    it('Scenario 3 (Local Data -> Existing Cloud Shop): YES merges with strict staff deduplication (no duplicate Suraj Dev); NO switches cleanly without leaking local bills', async () => {
      await runWithSyncWorkspaceBypass(async () => {
        await db.users.clear();
        await db.bills.clear();
        await db.syncOutbox.clear();
      });
      await db.settings.put({ key: 'active_data_scope', value: 'local' });

      // Device has local "Suraj Dev" (staff_local_1) + local bill
      await db.users.put({
        id: 'staff_local_1',
        name: 'Suraj Dev',
        role: 'cashier',
        pinHash: 'lh',
        pinSalt: 'ls',
        active: true,
      });
      await db.bills.add({
        billNo: 'LOCAL-MERGE/0001',
        financialYear: '2026-27',
        date: '2026-11-20',
        customerName: 'Local Buyer',
        customerPhone: '',
        doctorName: '',
        subtotalPaise: 5000,
        discountPaise: 0,
        discountPercent: 0,
        roundOffPaise: 0,
        totalPaise: 5000,
        taxablePaise: 4464,
        gstPaise: 536,
        paymentMode: 'cash',
        cashReceivedPaise: 5000,
        changePaise: 0,
        status: 'completed',
        cashierId: 'staff_local_1',
        cashierName: 'Suraj Dev',
        createdAt: '2026-11-20T09:00:00.000Z',
      });

      const cloudEvents = [
        {
          seq: 1,
          shop_id: 'shop-existing-555',
          entity_type: 'staff',
          entity_id: 'staff_cloud_99',
          payload_json: JSON.stringify({
            id: 'staff_cloud_99',
            name: 'Suraj Dev',
            role: 'cashier',
            pinHash: 'ch',
            pinSalt: 'cs',
            active: true,
          }),
        },
        {
          seq: 2,
          shop_id: 'shop-existing-555',
          entity_type: 'bill',
          entity_id: '200',
          payload_json: JSON.stringify({
            bill: {
              id: 200,
              billNo: 'CLOUD-MERGE/0001',
              financialYear: '2026-27',
              date: '2026-11-20',
              customerName: 'Laptop Buyer',
              customerPhone: '',
              doctorName: '',
              subtotalPaise: 12000,
              discountPaise: 0,
              discountPercent: 0,
              roundOffPaise: 0,
              totalPaise: 12000,
              taxablePaise: 10714,
              gstPaise: 1286,
              paymentMode: 'upi',
              cashReceivedPaise: 12000,
              changePaise: 0,
              status: 'completed',
              cashierId: 'staff_cloud_99',
              cashierName: 'Suraj Dev',
              createdAt: '2026-11-20T10:00:00.000Z',
            },
            items: [],
          }),
        },
      ];

      const pushedDuringMerge: any[] = [];
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { user: { id: 'usr-merge', email: 'merge@cloud.com' } } as any },
        error: null,
      });
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'hospivo_sync_events') {
          return {
            upsert: vi.fn().mockImplementation((evts: any[]) => {
              pushedDuringMerge.push(...evts);
              return Promise.resolve({ error: null });
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue(createMockQueryChain(cloudEvents)),
          } as any;
        }
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue(createMockQueryChain([])),
        } as any;
      });

      const existingShop = {
        id: 'shop-existing-555',
        name: 'Existing Cloud Pharmacy',
        syncId: 'HOSP-EXST-5555',
      };

      // YES: Merge local + cloud with strict deduplication
      await resolveCloudSignInChoice({
        choice: 'merge_local_and_cloud',
        email: 'merge@cloud.com',
        existingShop,
      });

      const mergedUsers = await db.users.toArray();
      expect(mergedUsers.length).toBe(1); // Suraj Dev NOT duplicated!
      expect(mergedUsers[0].name).toBe('Suraj Dev');

      const mergedBills = await db.bills.toArray();
      expect(mergedBills.map((b) => b.billNo).sort()).toEqual(['CLOUD-MERGE/0001', 'LOCAL-MERGE/0001']);
      expect(pushedDuringMerge.some((e) => e.entity_type === 'bill')).toBe(true);

      // NO: Use cloud only — local bill is stashed, NEVER leaked into cloud
      await db.settings.put({ key: 'active_data_scope', value: 'local' });
      pushedDuringMerge.length = 0;

      await resolveCloudSignInChoice({
        choice: 'use_cloud_only',
        email: 'merge@cloud.com',
        existingShop,
      });

      const cloudOnlyBills = await db.bills.toArray();
      expect(cloudOnlyBills.map((b) => b.billNo)).toEqual(['CLOUD-MERGE/0001']);
      expect(pushedDuringMerge.filter((e) => e.entity_type !== 'device').length).toBe(0);
    });

    it('Scenario 4 (Sign-Out): stops cloud sync cleanly and keeps device data usable in Local Mode with zero future cloud queueing', async () => {
      await db.settings.put({ key: 'cloud_enabled', value: true });
      await db.settings.put({ key: 'cloud_shop_uuid', value: 'shop-signout-1' });
      await db.settings.put({ key: 'owner_email', value: 'owner@signout.com' });
      const shop = (await db.shop.toArray())[0];
      if (shop?.id) await db.shop.update(shop.id, { mode: 'cloud' });

      await db.users.put({
        id: 'owner',
        name: 'Sunil Kumar',
        role: 'owner',
        pinHash: 'h',
        pinSalt: 's',
        active: true,
      });

      vi.spyOn(supabase.auth, 'signOut').mockResolvedValueOnce({ error: null });

      await signOutOwner();

      // Cloud sync disabled, device data stays intact & usable in Local Mode
      const homeState = await getHomeSyncState();
      expect(homeState.cloudEnabled).toBe(false);
      expect(homeState.status).toBe('local');
      expect((await db.shop.toArray())[0]?.mode).toBe('local');
      expect((await db.users.get('owner'))?.name).toBe('Sunil Kumar');

      // Future writes do NOT enqueue cloud sync items until signed back in
      const queuedAfterSignOut = await enqueueSyncItem('bill', 999, { billNo: 'LOCAL-ONLY/1' });
      expect(queuedAfterSignOut).toBeNull();
    });

    it('allows 4 failed sign-in verification attempts before triggering 60s cooldown', () => {
      expect(MAX_CLOUD_SIGNIN_ATTEMPTS).toBe(4);
      expect(CLOUD_SIGNIN_COOLDOWN_SECONDS).toBe(60);

      // Attempts 1, 2, 3 show remaining attempts with zero cooldown
      const try1 = recordCloudSignInFailure(0);
      expect(try1).toEqual({ failedAttempts: 1, remainingAttempts: 3, isLockedOut: false, cooldownSeconds: 0 });

      const try2 = recordCloudSignInFailure(try1.failedAttempts);
      expect(try2).toEqual({ failedAttempts: 2, remainingAttempts: 2, isLockedOut: false, cooldownSeconds: 0 });

      const try3 = recordCloudSignInFailure(try2.failedAttempts);
      expect(try3).toEqual({ failedAttempts: 3, remainingAttempts: 1, isLockedOut: false, cooldownSeconds: 0 });

      // 4th failed attempt triggers 60-second cooldown
      const try4 = recordCloudSignInFailure(try3.failedAttempts);
      expect(try4).toEqual({ failedAttempts: 4, remainingAttempts: 0, isLockedOut: true, cooldownSeconds: 60 });
    });
  });
});
