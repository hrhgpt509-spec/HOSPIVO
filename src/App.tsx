import { useState, useEffect, useRef, useCallback } from 'react';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Setup } from './screens/Setup';
import { FeedbackOverlay } from './components/FeedbackOverlay';
import { db, type DBUser } from './db';

// 5 minutes of inactivity triggers the auto-lock screen
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

type AppScreen = 'loading' | 'setup' | 'login' | 'home';

export function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<DBUser | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setIsLocked(true);
    }, INACTIVITY_TIMEOUT_MS);
  }, []);

  // Check database state and dev-reset query flag on initial load
  useEffect(() => {
    async function initApp() {
      // DEV ONLY: remove before release
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === '1') {
        await db.delete();
        await db.open();
        const url = new URL(window.location.href);
        url.searchParams.delete('reset');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
      }

      try {
        const shopCount = await db.shop.count();
        if (shopCount === 0) {
          setScreen('setup');
        } else {
          setScreen('login');
        }
      } catch (err) {
        console.error('Failed to query shop database:', err);
        setScreen('login');
      }
    }

    initApp();
  }, []);

  // Listen for user interactions to reset the 5-minute inactivity timer
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => {
      resetInactivityTimer();
    };

    events.forEach((event) => window.addEventListener(event, handleActivity));
    resetInactivityTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity));
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [resetInactivityTimer]);

  const handleLoginSuccess = (user: DBUser) => {
    setCurrentUser(user);
    setScreen('home');
    setIsLocked(false);
    resetInactivityTimer();
  };

  const handleUnlock = () => {
    setIsLocked(false);
    resetInactivityTimer();
  };

  const renderActiveScreen = () => {
    if (screen === 'loading') {
      return (
        <div className="w-full min-h-screen bg-[#F4F6F5] flex items-center justify-center">
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

    if (screen === 'setup') {
      return (
        <Setup
          onComplete={() => {
            setScreen('login');
          }}
        />
      );
    }

    if (screen === 'home') {
      return <Home currentUser={currentUser} />;
    }

    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        isLocked={false}
        onResetToSetup={() => setScreen('setup')}
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
