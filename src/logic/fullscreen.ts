import { db } from '../db';

/**
 * Reads "fullscreenOnLogin" setting from the database (defaults to true).
 */
export async function isFullscreenOnLoginEnabled(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return true;
    const setting = await db.settings.get('fullscreenOnLogin');
    if (setting && typeof setting.value === 'boolean') {
      return setting.value;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Requests full screen on document.documentElement:
 * - Does nothing if already in full screen or if the browser does not support it.
 * - Otherwise calls document.documentElement.requestFullscreen({ navigationUI: "hide" }).
 * - Catches every error and ignores it silently. Never shows an error message to the user.
 */
export async function enterFullscreen(): Promise<void> {
  try {
    if (typeof document === 'undefined') return;

    // Do nothing if already in full screen
    if (document.fullscreenElement) {
      return;
    }

    // Do nothing if the browser does not support requestFullscreen
    if (!document.documentElement || typeof document.documentElement.requestFullscreen !== 'function') {
      return;
    }

    // Check setting: default true
    const enabled = await isFullscreenOnLoginEnabled();
    if (!enabled) {
      return;
    }

    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Catch every error and ignore it silently. Never show an error message.
  }
}
