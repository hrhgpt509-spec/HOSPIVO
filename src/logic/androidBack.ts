import { useEffect, useRef } from 'react';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface BackButtonEvent {
  canGoBack: boolean;
}

interface CapacitorAppPlugin {
  addListener(
    eventName: 'backButton',
    listenerFunc: (event: BackButtonEvent) => void
  ): Promise<PluginListenerHandle>;
  exitApp(): Promise<void>;
  minimizeApp?: () => Promise<void>;
}

export type BackHandler = () => boolean | void;

interface RegisteredHandler {
  id: number;
  handler: BackHandler;
}

const handlerStack: RegisteredHandler[] = [];
let nextHandlerId = 1;

/**
 * Registers a back-button handler on the LIFO stack.
 * The most recently mounted modal, bottom sheet, drawer, or nested view sits on top
 * and receives Android back presses first.
 * Return `false` from the handler to pass the event down to the next handler.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  const id = nextHandlerId++;
  handlerStack.push({ id, handler });

  return () => {
    const idx = handlerStack.findIndex((item) => item.id === id);
    if (idx !== -1) {
      handlerStack.splice(idx, 1);
    }
  };
}

/**
 * Executes handlers from top (most recent modal/sheet/view) to bottom.
 * Returns `true` if any handler consumed the back press, or `false` if the stack is empty.
 */
export function handleAndroidBackPress(): boolean {
  for (let i = handlerStack.length - 1; i >= 0; i--) {
    const entry = handlerStack[i];
    try {
      const result = entry.handler();
      if (result !== false) {
        return true;
      }
    } catch (err) {
      console.error('Error in back button handler:', err);
      return true;
    }
  }
  return false;
}

/**
 * Returns the current number of active registered back handlers (useful for tests/diagnostics).
 */
export function getBackHandlerCount(): number {
  return handlerStack.length;
}

/**
 * Clears all registered back handlers (for unit tests).
 */
export function clearBackHandlers(): void {
  handlerStack.length = 0;
}

/**
 * React hook that registers a back-button handler while `active` is true.
 * Automatically keeps the latest `onBack` callback without re-ordering the LIFO stack.
 */
export function useBackHandler(active: boolean, onBack: BackHandler): void {
  const callbackRef = useRef<BackHandler>(onBack);
  callbackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    return registerBackHandler(() => callbackRef.current());
  }, [active]);
}

let capAppPlugin: CapacitorAppPlugin | null = null;

function getCapAppPlugin(): CapacitorAppPlugin | null {
  if (typeof window === 'undefined') return null;
  if (!capAppPlugin) {
    try {
      capAppPlugin = registerPlugin<CapacitorAppPlugin>('App');
    } catch {
      capAppPlugin = null;
    }
  }
  return capAppPlugin;
}

/**
 * Initializes the global Android / Capacitor 'backButton' listener once at the App root.
 * - First closes any open modal, sheet, drawer, or nested view via the LIFO stack.
 * - Falls back to browser history if available (`canGoBack`).
 * - Only exits/minimizes the native app when at the root screen with nothing open.
 */
export function initAndroidBackListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  let pluginHandle: PluginListenerHandle | null = null;
  let disposed = false;

  const dispatchBack = (canGoBack = false) => {
    // 1. Let open modals, sheets, drawers, or inner views handle back first
    if (handleAndroidBackPress()) {
      return;
    }

    // 2. Fall back to WebView history if available
    if (canGoBack && window.history.length > 1) {
      window.history.back();
      return;
    }

    // 3. On root screen with no open overlays: minimize or exit native Android app
    const appPlugin = getCapAppPlugin();
    if (Capacitor.isNativePlatform() && appPlugin) {
      if (typeof appPlugin.minimizeApp === 'function') {
        void appPlugin.minimizeApp().catch(() => appPlugin.exitApp().catch(() => {}));
      } else {
        void appPlugin.exitApp().catch(() => {});
      }
    }
  };

  // Hook Capacitor App plugin 'backButton' event when available
  const appPlugin = getCapAppPlugin();
  if (appPlugin && Capacitor.isPluginAvailable('App')) {
    appPlugin
      .addListener('backButton', (event: BackButtonEvent) => {
        if (!disposed) {
          dispatchBack(Boolean(event?.canGoBack));
        }
      })
      .then((handle) => {
        if (disposed) {
          void handle.remove();
        } else {
          pluginHandle = handle;
        }
      })
      .catch(() => {
        // Plugin listener unavailable in pure browser environment
      });
  }

  // Also support native/Cordova-style DOM 'backbutton' & custom 'capacitorBackButton' events
  const onDomBackButton = (e: Event) => {
    const handled = handleAndroidBackPress();
    if (handled) {
      e.preventDefault();
    }
  };

  document.addEventListener('backbutton', onDomBackButton);
  window.addEventListener('capacitorBackButton', onDomBackButton);

  // Direct bridge for native Android MainActivity OnBackPressedCallback
  // (works even when @capacitor/app plugin is not installed)
  const win = window as unknown as { __hospivoHandleBack?: () => boolean };
  win.__hospivoHandleBack = () => handleAndroidBackPress();

  return () => {
    disposed = true;
    document.removeEventListener('backbutton', onDomBackButton);
    window.removeEventListener('capacitorBackButton', onDomBackButton);
    delete win.__hospivoHandleBack;
    if (pluginHandle) {
      void pluginHandle.remove();
      pluginHandle = null;
    }
  };
}
