import React, { useState, useEffect, useCallback } from 'react';
import { db, type DBUser } from '../db';
import { attemptUserLogin, getLoginLock } from '../logic/auth';
import { usePinKeyboard } from '../logic/usePinKeyboard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { triggerFeedback } from '../logic/feedback';

interface LoginProps {
  onLoginSuccess: (user: DBUser) => void;
  isLocked?: boolean;
  lockedUser?: DBUser | null;
  onUnlock?: () => void;
  onResetToSetup?: () => void;
}

const AVATAR_PALETTES = [
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200' },
];

export const Login: React.FC<LoginProps> = ({
  onLoginSuccess,
  isLocked = false,
  lockedUser = null,
  onUnlock,
  onResetToSetup,
}) => {
  const [users, setUsers] = useState<DBUser[]>([]);
  const [shopName, setShopName] = useState<string>('Shree Medical Store');
  const [selectedUser, setSelectedUser] = useState<DBUser | null>(null);
  const [pin, setPin] = useState<string>('');
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lockPin, setLockPin] = useState<string>('');
  const [lockError, setLockError] = useState<boolean>(false);
  const [lockCountdownSeconds, setLockCountdownSeconds] = useState<number>(0);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // Load real users and shop from database
  useEffect(() => {
    async function loadData() {
      try {
        const allUsers = await db.users.filter((u) => u.active !== false).toArray();
        allUsers.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
        setUsers(allUsers);

        const shop = await db.shop.toCollection().first();
        if (shop?.name) {
          setShopName(shop.name);
        }
      } catch (err) {
        console.error('Failed to load login users:', err);
      }
    }
    loadData();
  }, []);

  // Timer countdown for lockout
  useEffect(() => {
    if (lockCountdownSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setHasError(false);
          setErrorMessage('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockCountdownSeconds]);

  // Active user for lock screen defaults to lockedUser or first user
  const activeLockUser = lockedUser || selectedUser || users[0] || null;

  // On entering lock screen, check if activeLockUser is locked
  useEffect(() => {
    if (isLocked && activeLockUser) {
      getLoginLock(activeLockUser.id).then((lock) => {
        if (lock.isLocked) {
          setLockCountdownSeconds(lock.secondsLeft);
        }
      });
    }
  }, [isLocked, activeLockUser]);

  const handleSelectUser = async (user: DBUser) => {
    setSelectedUser(user);
    setPin('');
    setHasError(false);
    setErrorMessage('');
    const lock = await getLoginLock(user.id);
    if (lock.isLocked) {
      setLockCountdownSeconds(lock.secondsLeft);
    } else {
      setLockCountdownSeconds(0);
    }
  };

  const verifyLockPin = useCallback(
    async (pinToTest: string) => {
      if (!activeLockUser) return;
      const res = await attemptUserLogin(activeLockUser, pinToTest);
      if (res.status === 'ok') {
        triggerFeedback('success', 'Screen Khul Gayi', 'Welcome back');
        setLockPin('');
        setLockError(false);
        if (onUnlock) {
          onUnlock();
        }
      } else if (res.status === 'locked') {
        triggerFeedback('error', 'Screen Lock Hai', `${res.minutesLeft} minute baad try karein`);
        setLockError(true);
        setLockCountdownSeconds(res.secondsLeft);
        setLockPin('');
      } else {
        triggerFeedback('error', 'PIN galat hai');
        setLockError(true);
        setLockPin('');
      }
    },
    [activeLockUser, onUnlock]
  );

  const verifyPin = useCallback(
    async (pinToTest: string, user: DBUser) => {
      const res = await attemptUserLogin(user, pinToTest);
      if (res.status === 'ok') {
        triggerFeedback('success', 'Login Kamyab', `${user.name} logged in`);
        onLoginSuccess(user);
      } else if (res.status === 'locked') {
        triggerFeedback('error', 'PIN lock ho gaya', `${res.minutesLeft} minute baad try karein`);
        setHasError(true);
        setErrorMessage(`${res.minutesLeft} minute baad try karein`);
        setLockCountdownSeconds(res.secondsLeft);
        setPin('');
      } else {
        triggerFeedback('error', 'PIN galat hai');
        setHasError(true);
        setErrorMessage('PIN galat hai');
        setPin('');
      }
    },
    [onLoginSuccess]
  );

  const handleAddDigit = useCallback(
    (digit: string) => {
      if (lockCountdownSeconds > 0) return;

      if (isLocked) {
        const targetLen = 4;
        if (lockPin.length < targetLen) {
          const nextPin = lockPin + digit;
          setLockPin(nextPin);
          setLockError(false);
          if (nextPin.length === targetLen) {
            verifyLockPin(nextPin);
          }
        }
        return;
      }

      if (!selectedUser) return;
      const targetLen = 4;
      if (pin.length < targetLen) {
        const nextPin = pin + digit;
        setPin(nextPin);
        setHasError(false);
        setErrorMessage('');

        if (nextPin.length === targetLen) {
          verifyPin(nextPin, selectedUser);
        }
      }
    },
    [lockCountdownSeconds, isLocked, lockPin, verifyLockPin, selectedUser, pin, verifyPin]
  );

  const handleClear = useCallback(() => {
    if (isLocked) {
      setLockPin('');
      setLockError(false);
    } else {
      setPin('');
      setHasError(false);
      setErrorMessage('');
    }
  }, [isLocked]);

  const handleBackspace = useCallback(() => {
    if (isLocked) {
      setLockPin((prev) => prev.slice(0, -1));
      setLockError(false);
    } else {
      setPin((prev) => prev.slice(0, -1));
      setHasError(false);
      setErrorMessage('');
    }
  }, [isLocked]);

  // Shared keyboard navigation support for PIN entry
  usePinKeyboard({
    onDigit: handleAddDigit,
    onBackspace: handleBackspace,
    onClear: handleClear,
  });

  // -------------------------------------------------------------
  // STATE 3: Lock Screen (08c_Login_LockScreen.html)
  // -------------------------------------------------------------
  if (isLocked) {
    const lockTargetLen = 4;
    return (
      <div className="w-full min-h-screen bg-[#f1fcf6] flex items-center justify-center p-0 m-0 select-none relative overflow-hidden">
        {/* Background blurred representation of the app (matches 08c) */}
        <div className="absolute inset-0 w-full h-full flex flex-col bg-[#f1fcf6] p-4 filter blur-[6px] opacity-45 pointer-events-none scale-100">
          <div className="w-full h-16 bg-[#e5f0eb] rounded-xl flex items-center justify-between px-6 mb-4">
            <div className="flex items-center gap-4">
              <span className="text-2xl text-[#006b33] font-bold">HOSPIVO PHARMA POS</span>
              <span className="bg-[#dae5df] px-3 py-1 rounded-full text-sm text-[#3e4a3f]">
                Counter #01 • {shopName}
              </span>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-base text-[#141e1a] font-semibold">Bill No: #INV-88219</span>
              <span className="text-base text-[#141e1a]">Time: 14:32</span>
            </div>
          </div>
          <div className="w-full flex-1 flex gap-4 min-h-0">
            <div className="w-2/3 bg-white rounded-xl p-6 flex flex-col gap-4 shadow-sm">
              <div className="h-14 bg-[#ebf6f0] rounded-xl px-4 flex items-center justify-between">
                <span className="text-[#3e4a3f]">Dawai ka naam ya barcode scan karein (Search medicine)...</span>
                <svg className="w-6 h-6 text-[#6e7a6e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Centered Unlock Card (Matches 08c: 440px wide) */}
        <div className="relative z-10 w-[440px] max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col items-center">
          
          {/* Green top bar */}
          <div className="w-full h-2.5 bg-[#006b33]"></div>

          <div className="w-full p-8 flex flex-col items-center">
            
            {/* Padlock Icon & Auto-Lock Header */}
            <div className="w-14 h-14 rounded-full bg-[#ebf6f0] flex items-center justify-center text-[#006b33] mb-3 shadow-inner">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>

            <h2 className="text-2xl font-extrabold text-[#141e1a] tracking-tight text-center">
              Screen Lock Hai
            </h2>
            <p className="text-sm font-medium text-[#6e7a6e] mt-0.5 text-center">
              5 minute se koi action nahi hua (Auto-locked)
            </p>

            {/* Active User Pill in Modal */}
            <div className="mt-4 mb-4 px-4 py-2 bg-[#f1fcf6] rounded-xl border border-[#dae5df] flex items-center gap-3 w-full justify-center">
              <div className="w-8 h-8 rounded-full bg-[#006b33] text-white flex items-center justify-center font-bold text-sm">
                {activeLockUser?.role === 'owner' ? (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                  </svg>
                ) : (
                  activeLockUser?.name.charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-[#141e1a] leading-tight">
                  {activeLockUser?.name || 'Staff User'}
                </span>
                <span className="text-xs text-[#3e4a3f]">
                  {activeLockUser?.role === 'owner' ? 'Admin & Shop Incharge' : 'Counter Staff'}
                </span>
              </div>
            </div>

            {/* PIN Dots */}
            <div className="flex items-center gap-4 my-2">
              {Array.from({ length: lockTargetLen }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                    idx < lockPin.length
                      ? 'bg-[#006b33] border-[#006b33] scale-110'
                      : 'border-[#b6c2bb] bg-white'
                  }`}
                />
              ))}
            </div>

            {/* Wrong PIN feedback on lock screen */}
            {lockError && lockCountdownSeconds <= 0 && (
              <div className="mb-3 px-4 py-1.5 rounded-full bg-red-100 border border-red-300 text-red-700 flex items-center gap-2 animate-bounce">
                <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-bold tracking-wide">PIN galat hai</span>
              </div>
            )}

            {/* Lockout countdown on lock screen */}
            {lockCountdownSeconds > 0 && (
              <div className="mb-3 px-4 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 flex items-center gap-2 animate-pulse">
                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold tracking-wide">
                  {Math.ceil(lockCountdownSeconds / 60)} minute baad try karein ({lockCountdownSeconds}s)
                </span>
              </div>
            )}

            {/* Numpad 3x4 Grid (88px keys) */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleAddDigit(digit)}
                  className="w-[88px] h-[88px] rounded-xl bg-[#ebf6f0] hover:bg-[#e0ebe5] active:scale-95 text-[#141e1a] text-3xl font-bold flex items-center justify-center shadow-sm cursor-pointer transition-all duration-100 border border-slate-200"
                >
                  {digit}
                </button>
              ))}

              {/* Clear / Mitao (Backspace) */}
              <button
                type="button"
                onClick={handleBackspace}
                className="w-[88px] h-[88px] rounded-xl bg-[#ffdad6] hover:bg-[#ffdad6]/80 active:scale-95 text-[#93000a] flex flex-col items-center justify-center shadow-sm cursor-pointer transition-all duration-100"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
                </svg>
                <span className="text-xs font-bold leading-tight mt-0.5">Mitao</span>
              </button>

              {/* 0 button */}
              <button
                type="button"
                onClick={() => handleAddDigit('0')}
                className="w-[88px] h-[88px] rounded-xl bg-[#ebf6f0] hover:bg-[#e0ebe5] active:scale-95 text-[#141e1a] text-3xl font-bold flex items-center justify-center shadow-sm cursor-pointer transition-all duration-100 border border-slate-200"
              >
                0
              </button>

              {/* Unlock / Kholein button */}
              <button
                type="button"
                onClick={() => verifyLockPin(lockPin)}
                className="w-[88px] h-[88px] rounded-xl bg-[#8ef9a7] hover:bg-[#72dc8e] active:scale-95 text-[#00210b] flex flex-col items-center justify-center shadow-sm cursor-pointer transition-all duration-100"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="text-xs font-bold leading-tight mt-0.5">Kholein</span>
              </button>
            </div>

            {/* Bottom info strip in modal */}
            <div className="w-full flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 bg-[#ebf6f0] px-3 py-1.5 rounded-full">
                <span className="w-2.5 h-2.5 rounded-full bg-[#006b33] inline-block animate-pulse"></span>
                <span className="text-xs text-[#3e4a3f] font-medium">Local mode</span>
              </div>
              <span className="text-xs text-[#6e7a6e]">Terminal ID: HOS-402</span>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATES 1 & 2: 08a (Choose Name) & 08b (Active PIN / Wrong PIN)
  // -------------------------------------------------------------
  const selectedUserPinLength = 4;

  return (
    <div className="w-full min-h-screen bg-[#F4F6F5] text-slate-800 flex flex-col justify-center items-center p-4 md:p-8 select-none">
      
      {/* Master Outer Card Container (Matches 08a / 08b) */}
      <main className="w-full max-w-[1376px] bg-white rounded-3xl shadow-xl border border-slate-200/80 p-6 md:p-8 flex flex-col justify-between min-h-[820px] relative">
        
        {/* Top Branding / Header inside Card */}
        <header className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 md:w-14 md:h-14 bg-[#1B8F4A] rounded-2xl flex items-center justify-center text-white shadow-sm shadow-[#1B8F4A]/30">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Hospivo</h1>
              <p className="text-sm md:text-base text-slate-500 font-medium mt-1">{shopName} • दवा दुकान POS</p>
            </div>
          </div>

          {/* Secure Login Badge */}
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-sm md:text-base font-semibold">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
            </svg>
            <span>Surakshit Login (Secure Access)</span>
          </div>
        </header>

        {/* Main Content Area: Left Half (User List) & Right Half (Empty State or Active PIN Pad) */}
        <section className="grid grid-cols-12 gap-8 my-auto items-stretch py-4">
          
          {/* LEFT HALF (5.5 Columns): "Kaun hai?" with stacked user buttons */}
          <div className="col-span-12 lg:col-span-5 flex flex-col justify-center pr-0 lg:pr-4">
            
            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">Kaun hai?</h2>
              <p className="text-base md:text-lg font-medium text-slate-500 mt-1">Who is using?</p>
            </div>

            {/* Stacked Big Name Buttons (64px tall each) */}
            <div className="flex flex-col gap-3.5 max-w-[540px]">
              {users.map((user, idx) => {
                const isSelected = selectedUser?.id === user.id;
                const isOwner = user.role === 'owner';
                const palette = isOwner
                  ? AVATAR_PALETTES[0]
                  : AVATAR_PALETTES[(idx % (AVATAR_PALETTES.length - 1)) + 1];
                const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
                const roleDesc = isOwner
                  ? 'Admin & Shop Incharge'
                  : user.role === 'cashier'
                  ? 'Counter Staff'
                  : 'Runner';

                if (isSelected) {
                  // Active Green State (Matches 08b line 100)
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectUser(user)}
                      className="w-full h-16 px-5 bg-[#1B8F4A] border-2 border-[#1B8F4A] rounded-2xl flex items-center justify-between shadow-lg shadow-[#1B8F4A]/25 ring-4 ring-[#1B8F4A]/20 text-white cursor-pointer text-left transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-white text-[#1B8F4A] flex items-center justify-center text-xl font-extrabold shadow-sm">
                          {isOwner ? (
                            <svg className="w-6 h-6 text-[#1B8F4A]" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                            </svg>
                          ) : (
                            initial
                          )}
                        </div>
                        <div className="text-left">
                          <div className="text-xl font-bold text-white leading-tight">{user.name}</div>
                          <div className="text-xs text-green-100 font-medium leading-tight">{roleDesc}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-white">
                        <span className="px-2.5 py-0.5 rounded-md bg-white/20 text-white text-xs font-bold uppercase tracking-wider">
                          Chuna gaya
                        </span>
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </button>
                  );
                }

                // Normal Inactive State (Matches 08a lines 92-165)
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectUser(user)}
                    className="w-full h-16 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-[#1B8F4A] rounded-2xl px-5 flex items-center justify-between transition-all duration-150 shadow-sm group text-left cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-4">
                      {isOwner ? (
                        <div className={`w-11 h-11 rounded-xl ${palette.bg} ${palette.text} flex items-center justify-center font-bold`}>
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                          </svg>
                        </div>
                      ) : (
                        <div className={`w-11 h-11 rounded-full ${palette.bg} ${palette.text} flex items-center justify-center font-bold text-lg border-2 ${palette.border}`}>
                          {initial}
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-xl font-bold text-slate-900 group-hover:text-[#1B8F4A] leading-tight">
                          {user.name}
                        </span>
                        <span className="text-sm text-slate-500 font-medium leading-tight">
                          {roleDesc}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOwner && (
                        <span className="text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-800 px-3 py-1 rounded-lg border border-amber-200">
                          Malik
                        </span>
                      )}
                      <svg className="w-6 h-6 text-slate-400 group-hover:text-[#1B8F4A] group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path>
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Note under list */}
            <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-slate-600 text-sm max-w-[540px]">
              <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Har staff ka alag PIN hai. Kisi se PIN share na karein.</span>
            </div>

          </div>

          {/* RIGHT HALF (7 Columns): Either Empty State (08a) OR Active PIN Pad (08b) */}
          <div className="col-span-12 lg:col-span-7 flex flex-col justify-center pl-0 lg:pl-4">
            
            {!selectedUser ? (
              // 08a: Empty state "Naam chuniye"
              <div className="w-full h-[440px] md:h-[480px] bg-[#F4F6F5] rounded-3xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-8">
                <div className="w-24 h-24 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-400 mb-6">
                  <svg className="w-12 h-12 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round"></rect>
                    <path d="M8 11V7a4 4 0 018 0v4" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </div>
                <div className="text-3xl font-extrabold text-slate-800 tracking-tight leading-none mb-2">
                  Naam chuniye
                </div>
                <div className="text-lg text-slate-500 font-medium max-w-[360px] leading-relaxed">
                  Apna naam chunein aur PIN daal kar billing shuru karein.
                </div>
                <div className="mt-6 flex items-center gap-2 text-base font-semibold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">
                  <svg className="w-5 h-5 text-emerald-600 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                  </svg>
                  <span>Baayein taraf se apna naam select karein</span>
                </div>
              </div>
            ) : (
              // 08b: Active User PIN Entry & Large Numpad
              <div className="w-full bg-slate-50/70 border-2 border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-between min-h-[480px]">
                
                {/* Header Info for Selected User */}
                <div className="w-full flex items-center justify-between pb-3 border-b border-slate-200/80">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#1B8F4A] text-white flex items-center justify-center text-xl font-black shadow-md shadow-[#1B8F4A]/30">
                      {selectedUser.role === 'owner' ? (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                        </svg>
                      ) : (
                        selectedUser.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-black text-slate-900 leading-tight">{selectedUser.name}</h3>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold">Selected</span>
                      </div>
                      <p className="text-sm font-medium text-slate-500">Apna {selectedUserPinLength}-digit PIN daal kar billing shuru karein</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider">
                      Step 2: Enter PIN
                    </span>
                  </div>
                </div>

                {/* PIN Dots */}
                <div className="my-3 flex flex-col items-center">
                  <div className="flex items-center gap-4">
                    {Array.from({ length: selectedUserPinLength }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                          idx < pin.length
                            ? 'bg-[#1B8F4A] border-[#1B8F4A] scale-110 shadow-sm'
                            : 'border-slate-300 bg-white shadow-inner'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Red semantic danger message: "PIN galat hai" (08b) */}
                  {hasError && lockCountdownSeconds <= 0 && (
                    <div className="mt-3 px-4 py-1.5 rounded-full bg-red-100 border border-red-300 text-red-700 flex items-center gap-2 animate-bounce">
                      <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-base font-bold tracking-wide">{errorMessage || 'PIN galat hai'}</span>
                      {errorMessage === 'PIN galat hai' && (
                        <span className="text-xs font-medium text-red-600/80">(Incorrect PIN, dobara try karein)</span>
                      )}
                    </div>
                  )}

                  {/* Lockout countdown */}
                  {lockCountdownSeconds > 0 && (
                    <div className="mt-3 px-4 py-2 rounded-full bg-amber-100 border border-amber-300 text-amber-800 flex items-center gap-2 animate-pulse">
                      <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-base font-bold tracking-wide">
                        {Math.ceil(lockCountdownSeconds / 60)} minute baad try karein ({lockCountdownSeconds}s)
                      </span>
                    </div>
                  )}
                </div>

                {/* Very Large Number Pad (88px Keys, 3x4 Grid - Matches 08b) */}
                <div className="grid grid-cols-3 gap-3.5 my-1">
                  {/* Rows 1-3 */}
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleAddDigit(digit)}
                      className="w-[88px] h-[88px] rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 border-2 border-slate-200 shadow-sm text-slate-800 text-3xl font-bold flex flex-col items-center justify-center transition-all cursor-pointer"
                    >
                      <span>{digit}</span>
                    </button>
                  ))}

                  {/* Row 4: Saaf (Clear), 0, Mitao (Backspace) */}
                  <button
                    type="button"
                    onClick={handleClear}
                    className="w-[88px] h-[88px] rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border-2 border-slate-200 text-slate-600 flex flex-col items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="text-lg font-bold">Saaf</span>
                    <span className="text-xs font-semibold text-slate-500">Clear</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddDigit('0')}
                    className="w-[88px] h-[88px] rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 border-2 border-slate-200 shadow-sm text-slate-800 text-3xl font-bold flex flex-col items-center justify-center transition-all cursor-pointer"
                  >
                    <span>0</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="w-[88px] h-[88px] rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border-2 border-slate-200 text-slate-700 flex flex-col items-center justify-center transition-all cursor-pointer"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
                    </svg>
                    <span className="text-xs font-semibold text-slate-500 mt-0.5">Mitao</span>
                  </button>
                </div>

              </div>
            )}

          </div>

        </section>

        {/* Bottom Bar Area inside card: Helper & Status Chip "Local mode" */}
        <footer className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm md:text-base font-medium text-slate-500">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>PIN bhool gaye? Owner se naya PIN generate karne ko kahein.</span>
            </div>

            {/* DEV ONLY: remove before release */}
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="text-xs font-semibold text-red-600/80 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              DEV: Reset test data
            </button>
          </div>

          <div className="flex items-center gap-2.5 px-4 py-2 bg-slate-100 border border-slate-300 rounded-xl text-slate-700">
            <span className="w-3 h-3 rounded-full bg-[#1B8F4A] animate-pulse"></span>
            <div className="flex flex-col">
              <span className="text-base font-bold text-slate-800 leading-none">Local mode</span>
              <span className="text-xs text-slate-500 font-medium leading-tight mt-0.5">Offline active • Fast billing</span>
            </div>
          </div>
        </footer>

        {/* DEV ONLY: remove before release */}
        <ConfirmDialog
          isOpen={showResetConfirm}
          title="Pakka sab hatana hai?"
          subtitle="Ye wapas nahi aayega."
          confirmLabel="Haan"
          confirmSubLabel="Delete"
          cancelLabel="Nahi"
          cancelSubLabel="Cancel"
          isDanger={true}
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={async () => {
            // DEV ONLY: remove before release
            await db.delete();
            await db.open();
            setShowResetConfirm(false);
            if (onResetToSetup) {
              onResetToSetup();
            } else {
              window.location.reload();
            }
          }}
        />

      </main>

    </div>
  );
};

export default Login;
