import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import { enterFullscreen, isFullscreenOnLoginEnabled } from './fullscreen';

describe('fullscreen logic tests', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults isFullscreenOnLoginEnabled to true when not set', async () => {
    const enabled = await isFullscreenOnLoginEnabled();
    expect(enabled).toBe(true);
  });

  it('respects isFullscreenOnLoginEnabled from db.settings', async () => {
    await db.settings.put({ key: 'fullscreenOnLogin', value: false });
    expect(await isFullscreenOnLoginEnabled()).toBe(false);

    await db.settings.put({ key: 'fullscreenOnLogin', value: true });
    expect(await isFullscreenOnLoginEnabled()).toBe(true);
  });

  it('calls requestFullscreen({ navigationUI: "hide" }) on documentElement', async () => {
    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    const mockDocument = {
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: requestFullscreenMock,
      },
    };

    (globalThis as any).document = mockDocument;

    try {
      await enterFullscreen();
      expect(requestFullscreenMock).toHaveBeenCalledWith({ navigationUI: 'hide' });
    } finally {
      delete (globalThis as any).document;
    }
  });

  it('does nothing if already in fullscreen', async () => {
    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    const mockDocument = {
      fullscreenElement: {},
      documentElement: {
        requestFullscreen: requestFullscreenMock,
      },
    };

    (globalThis as any).document = mockDocument;

    try {
      await enterFullscreen();
      expect(requestFullscreenMock).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as any).document;
    }
  });

  it('does nothing if fullscreenOnLogin is set to false', async () => {
    await db.settings.put({ key: 'fullscreenOnLogin', value: false });

    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    const mockDocument = {
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: requestFullscreenMock,
      },
    };

    (globalThis as any).document = mockDocument;

    try {
      await enterFullscreen();
      expect(requestFullscreenMock).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as any).document;
    }
  });

  it('silently ignores errors from requestFullscreen', async () => {
    const requestFullscreenMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    const mockDocument = {
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: requestFullscreenMock,
      },
    };

    (globalThis as any).document = mockDocument;

    try {
      await expect(enterFullscreen()).resolves.toBeUndefined();
      expect(requestFullscreenMock).toHaveBeenCalled();
    } finally {
      delete (globalThis as any).document;
    }
  });
});
