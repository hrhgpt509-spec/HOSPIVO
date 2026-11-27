import { useState, useEffect, useRef } from 'react';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Setup } from './screens/Setup';
import { FeedbackOverlay } from './components/FeedbackOverlay';
import { db, type DBUser } from './db';
import {
  ensureCloudSyncActive,
  initNetworkSyncListeners,
  stopRealtimeSync,
  subscribeToSyncUpdates,
} from './logic/cloudSync';
import { supabase, isBackendConfigured } from './lib/supabase';
import { initAndroidBackListener } from './logic/androidBack';
import { WelcomeIntro } from './screens/WelcomeIntro';
import { ShopSelector } from './screens/ShopSelector';
import { hasSeenIntro, markIntroSeen, resolveBootScreen, nextScreen } from './logic/onboarding';
import {
  cancelNewShopSetup,
  prepareNewShopSetup,
  registerCurrentShopInDirectory,
} from './logic/multiShop';
import { initAutoBackupScheduler } from './logic/autoBackup';
import { initNotificationDeepLinks } from './logic/notifications';

// Default 5 minutes of inactivity triggers auto-lock
export const DEFAULT_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

export function shouldRunAutoLock(screen: string, currentUser: unknown): boolean {
  return screen === 'home' && currentUser !== null && currentUser !== undefined;
}

type AppScreen = 'loading' | 'intro' | 'setup' | 'shop_select' | 'login' | 'home';

export function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<DBUser | null>(null);
  const [isAddingShop, setIsAddingShop] = useState<boolean>(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check database state on initial load
  useEffect(() => {
    async function initApp() {
      try {
        const shopCount = await db.shop.count();
        const introSeen = await hasSeenIntro();
        setScreen(resolveBootScreen({ shopCount, introSeen }));
      } catch (err) {
        console.error('Failed to query shop database:', err);
        setScreen('login');
      }
    }

    initApp();

    // Listen for clean cloud setup workspace resets (e.g. user chose "No, Start Clean Cloud Setup")
    const unsubWorkspaceReset = subscribeToSyncUpdates(() => {
      db.shop.count().then((count) => {
        if (count === 0) {
          setCurrentUser(null);
          setIsLocked(false);
          setIsAddingShop(false);
          setScreen('setup');
        }
      }).catch(() => {});
    }, ['workspace_reset']);

    // When switching to a different account/cloud shop from inside Home ("Keep separate"),
    // unmount the old user's Home immediately so zero previous-account state stays visible.
    const unsubWorkspaceSwitched = subscribeToSyncUpdates(() => {
      setCurrentUser((prevUser) => {
        if (prevUser) {
          setIsLocked(false);
          setScreen('shop_select');
          return null;
        }
        return prevUser;
      });
    }, ['workspace_switched']);

    return () => {
      unsubWorkspaceReset();
      unsubWorkspaceSwitched();
    };
  }, []);

  // Register Android Capacitor 'backButton' handler once at app root
  useEffect(() => {
    return initAndroidBackListener();
  }, []);

  // Silent automatic cloud sync, offline/online & Capacitor Network listeners, and Realtime subscription
  useEffect(() => {
    const cleanupNetworkListeners = initNetworkSyncListeners();
    const cleanupAutoBackup = initAutoBackupScheduler();
    const cleanupNotifLinks = initNotificationDeepLinks();

    let authSubscription: { unsubscribe: () => void } | null = null;
    if (isBackendConfigured() && typeof supabase.auth?.onAuthStateChange === 'function') {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          stopRealtimeSync();
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          void ensureCloudSyncActive();
        }
      });
      authSubscription = data?.subscription || null;
    }

    return () => {
      cleanupNetworkListeners();
      cleanupAutoBackup();
      cleanupNotifLinks();
      authSubscription?.unsubscribe();
    };
  }, []);

  // Inactivity / auto-lock timer:
  // MUST ONLY run after a user has unlocked the POS with their PIN (screen === 'home' && currentUser).
  // Never runs on "Who is using?" (screen === 'login') or inside First-Time Setup (screen === 'setup').
  useEffect(() => {
    if (!shouldRunAutoLock(screen, currentUser)) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    let timeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS;
    db.settings.get('auto_lock_minutes').then((setting) => {
      if (setting && typeof setting.value === 'number' && setting.value > 0) {
        timeoutMs = setting.value * 60 * 1000;
      }
    }).catch(() => {});

    const resetTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        // Return to "Who is using?" screen on inactivity
        setCurrentUser(null);
        setIsLocked(false);
        setScreen('login');
      }, timeoutMs);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [screen, currentUser]);

  const handleLoginSuccess = (user: DBUser) => {
    setCurrentUser(user);
    setScreen('home');
    setIsLocked(false);
  };

  const handleUnlock = () => {
    setIsLocked(false);
  };

  const renderActiveScreen = () => {
    if (screen === 'loading') {
      return (
        <div className="w-full min-h-dvh bg-[#F4F6F5] dark:bg-[#0f1713] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-[#1B8F4A] border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (isLocked) {
      return (
        <Login
          isLocked={true}
          lockedUser={currentUser}
          onUnlock={handleUnlock}
          onLoginSuccess={handleLoginSuccess}
        />
      );
    }

    if (screen === 'intro') {
      return (
        <WelcomeIntro
          onDone={() => {
            void markIntroSeen();
            setScreen(nextScreen('intro_done'));
          }}
        />
      );
    }

    if (screen === 'setup') {
      return (
        <Setup
          onComplete={() => {
            void markIntroSeen();
            void registerCurrentShopInDirectory().catch(() => {});
            setIsAddingShop(false);
            setScreen(nextScreen('setup_complete'));
          }}
          onCancel={
            isAddingShop
              ? () => {
                  void cancelNewShopSetup().then(() => {
                    setIsAddingShop(false);
                    setScreen(nextScreen('cancel_add_shop'));
                  });
                }
              : undefined
          }
        />
      );
    }

    if (screen === 'shop_select') {
      return (
        <ShopSelector
          onEnter={() => setScreen(nextScreen('shop_entered'))}
          onBack={currentUser ? () => setScreen('home') : undefined}
          onAddShop={() => {
            void prepareNewShopSetup().then(() => {
              setCurrentUser(null);
              setIsLocked(false);
              setIsAddingShop(true);
              setScreen(nextScreen('add_shop'));
            });
          }}
        />
      );
    }

    if (screen === 'home') {
      return (
        <Home
          currentUser={currentUser}
          onLock={() => {
            setIsLocked(true);
          }}
          onSwitchUser={() => {
            setCurrentUser(null);
            setIsLocked(false);
            setScreen('login');
          }}
          onOpenMultiShop={() => setScreen(nextScreen('switch_shop'))}
        />
      );
    }

    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        isLocked={false}
        onSwitchShop={() => setScreen(nextScreen('switch_shop'))}
      />
    );
  };

  return (
    <>
      <FeedbackOverlay />
      {renderActiveScreen()}
    </>
  );
}

export default App;
