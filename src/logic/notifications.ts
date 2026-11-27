import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db } from '../db';

export type NotificationCadence = 'instant' | 'daily' | 'weekly';
export type NotificationCategoryId =
  | 'expiry'
  | 'low_stock'
  | 'business_summary'
  | 'udhaar'
  | 'backup_sync';

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface NotificationCategoryConfig {
  enabled: boolean;
  cadence: NotificationCadence;
  dayOfWeek: number; // 0 = Sun .. 6 = Sat
  time: string; // 'HH:MM'
}

export interface NotificationsConfig {
  masterEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStart: string; // '22:30'
  quietEnd: string; // '08:00'
  expiryWindowDays: 15 | 30 | 60;
  categories: Record<NotificationCategoryId, NotificationCategoryConfig>;
}

export const NOTIFICATIONS_CONFIG_KEY = 'notifications_config';

export const DEFAULT_NOTIFICATIONS_CONFIG: NotificationsConfig = {
  masterEnabled: true,
  quietHoursEnabled: true,
  quietStart: '22:30',
  quietEnd: '08:00',
  expiryWindowDays: 30,
  categories: {
    expiry: { enabled: true, cadence: 'daily', dayOfWeek: 1, time: '09:00' },
    low_stock: { enabled: true, cadence: 'daily', dayOfWeek: 1, time: '09:30' },
    business_summary: { enabled: true, cadence: 'daily', dayOfWeek: 0, time: '21:30' },
    udhaar: { enabled: true, cadence: 'weekly', dayOfWeek: 1, time: '10:00' },
    backup_sync: { enabled: true, cadence: 'daily', dayOfWeek: 0, time: '20:00' },
  },
};

export const NOTIFICATION_CATEGORY_IDS: Record<
  NotificationCategoryId,
  { numericId: number; targetScreen: string }
> = {
  expiry: { numericId: 4101, targetScreen: 'expiry' },
  low_stock: { numericId: 4102, targetScreen: 'stock_dekho_low' },
  business_summary: { numericId: 4103, targetScreen: 'owner_reports' },
  udhaar: { numericId: 4104, targetScreen: 'udhaar' },
  backup_sync: { numericId: 4105, targetScreen: 'owner_backup' },
};

export async function getNotificationsConfig(): Promise<NotificationsConfig> {
  try {
    const item = await db.settings.get(NOTIFICATIONS_CONFIG_KEY);
    if (item && item.value && typeof item.value === 'object') {
      const raw = item.value as Partial<NotificationsConfig>;
      return {
        ...DEFAULT_NOTIFICATIONS_CONFIG,
        ...raw,
        categories: {
          ...DEFAULT_NOTIFICATIONS_CONFIG.categories,
          ...(raw.categories || {}),
        },
      };
    }
  } catch {
    // Fallback
  }
  return {
    ...DEFAULT_NOTIFICATIONS_CONFIG,
    categories: { ...DEFAULT_NOTIFICATIONS_CONFIG.categories },
  };
}

export async function saveNotificationsConfig(
  config: NotificationsConfig
): Promise<NotificationsConfig> {
  await db.settings.put({ key: NOTIFICATIONS_CONFIG_KEY, value: config });
  await scheduleLocalNotificationsFromConfig(config).catch(() => {});
  return config;
}

/**
 * Checks if `now` falls inside the configured Quiet Hours window (supports overnight windows like 22:30 -> 08:00).
 */
export function isQuietHoursActive(
  config: Pick<NotificationsConfig, 'quietHoursEnabled' | 'quietStart' | 'quietEnd'>,
  now: Date = new Date()
): boolean {
  if (!config.quietHoursEnabled) return false;
  const parseMins = (hhmm: string) => {
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const current = now.getHours() * 60 + now.getMinutes();
  const start = parseMins(config.quietStart);
  const end = parseMins(config.quietEnd);

  if (start === end) return false;
  if (start < end) {
    return current >= start && current < end;
  }
  // Overnight window (e.g. 22:30 -> 08:00)
  return current >= start || current < end;
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await LocalNotifications.checkPermissions();
      if (res.display === 'granted') return 'granted';
      if (res.display === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await LocalNotifications.requestPermissions();
      if (res.display === 'granted') return 'granted';
      if (res.display === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'denied';
  }
}

export async function scheduleLocalNotificationsFromConfig(
  config: NotificationsConfig
): Promise<number> {
  if (!Capacitor.isNativePlatform()) {
    return 0;
  }

  const allIds = Object.values(NOTIFICATION_CATEGORY_IDS).map((c) => ({ id: c.numericId }));
  try {
    await LocalNotifications.cancel({ notifications: allIds });
  } catch {
    // Non-fatal
  }

  if (!config.masterEnabled) return 0;

  const perm = await getNotificationPermissionStatus();
  if (perm !== 'granted') return 0;

  const notificationsToSchedule: any[] = [];
  const labelMap: Record<NotificationCategoryId, { title: string; body: string }> = {
    expiry: {
      title: 'Hospivo · Expiry Alert',
      body: `Check medicines expiring within ${config.expiryWindowDays} days.`,
    },
    low_stock: {
      title: 'Hospivo · Low Stock Alert',
      body: 'Review low-stock & out-of-stock medicines for reorder.',
    },
    business_summary: {
      title: 'Hospivo · Daily Business Summary',
      body: 'Tap to view today’s sales, bills, and collections.',
    },
    udhaar: {
      title: 'Hospivo · Udhaar Credit Reminders',
      body: 'Review pending customer Udhaar balances.',
    },
    backup_sync: {
      title: 'Hospivo · Backup & Sync Check',
      body: 'Verify your latest pharmacy backup and cloud sync status.',
    },
  };

  (Object.keys(NOTIFICATION_CATEGORY_IDS) as NotificationCategoryId[]).forEach((catId) => {
    const catCfg = config.categories[catId];
    if (!catCfg?.enabled || catCfg.cadence === 'instant') return;

    const [hhStr, mmStr] = (catCfg.time || '09:00').split(':');
    const hour = Number(hhStr) || 9;
    const minute = Number(mmStr) || 0;
    const meta = NOTIFICATION_CATEGORY_IDS[catId];

    const onSchedule: any =
      catCfg.cadence === 'weekly'
        ? { weekday: catCfg.dayOfWeek + 1, hour, minute } // Capacitor weekday: 1=Sun..7=Sat
        : { hour, minute };

    notificationsToSchedule.push({
      id: meta.numericId,
      title: labelMap[catId].title,
      body: labelMap[catId].body,
      schedule: { on: onSchedule, repeats: true, allowWhileIdle: true },
      extra: { targetScreen: meta.targetScreen },
    });
  });

  if (notificationsToSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: notificationsToSchedule });
  }

  return notificationsToSchedule.length;
}

export const NOTIFICATION_DEEP_LINK_EVENT = 'hospivo:notification-navigate';

export function initNotificationDeepLinks(): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  let listenerHandle: { remove: () => Promise<void> } | null = null;

  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const targetScreen = action?.notification?.extra?.targetScreen;
    if (typeof targetScreen === 'string' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(NOTIFICATION_DEEP_LINK_EVENT, { detail: { targetScreen } })
      );
    }
  }).then((handle) => {
    listenerHandle = handle;
  }).catch(() => {});

  return () => {
    void listenerHandle?.remove().catch(() => {});
  };
}

/**
 * Fires an immediate local Android notification when a counter staff member
 * submits a new Remote Approval request (respecting master toggle & quiet hours).
 */
export async function notifyPendingApprovalRequest(
  summary: string,
  requestedBy: string
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const config = await getNotificationsConfig();
    if (!config.masterEnabled || isQuietHoursActive(config)) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 100000) + 9000,
          title: `Approval Needed (${requestedBy || 'Staff'})`,
          body: summary,
          schedule: { at: new Date(Date.now() + 250) },
          extra: { targetScreen: 'owner_approvals' },
        },
      ],
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Fires an immediate Android local security notification when a staff operator
 * uses the Permission PIN to authorize an excess discount on a bill.
 * Tapping it deep-links straight to the Owner Permission PIN rotation prompt.
 */
export async function notifyPermissionPinUsed(params: {
  operatorName: string;
  billNo: string;
  discountPercent: number;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const config = await getNotificationsConfig();
    if (!config.masterEnabled || isQuietHoursActive(config)) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 100000) + 9500,
          title: 'Security Alert: Permission PIN Used',
          body: `${params.operatorName} gave ${params.discountPercent}% discount on ${params.billNo}. Tap to change Permission PIN.`,
          schedule: { at: new Date(Date.now() + 250) },
          extra: { targetScreen: 'owner_pin_rotate' },
        },
      ],
    });
  } catch {
    // Non-fatal
  }
}
