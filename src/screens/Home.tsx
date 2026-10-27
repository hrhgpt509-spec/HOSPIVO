import React, { useState, useEffect } from 'react';

export const Home: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hospivo_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('hospivo_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="w-full min-h-screen bg-canvas dark:bg-[#0f1713] text-[#101828] dark:text-gray-100 flex flex-col justify-between p-6 antialiased select-none transition-colors">
      <div className="w-full max-w-[1440px] mx-auto flex-1 flex flex-col justify-between">
        
        {/* TOP BAR (App screen top bar) */}
        <header className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 px-7 py-4 flex flex-wrap items-center justify-between gap-4">
          {/* Left: Brand + Shop Name */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-xl bg-brand flex items-center justify-center text-white shadow-sm">
                <svg className="w-6 h-6 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div>
                <span className="text-2xl font-black tracking-wider text-brand">HOSPIVO</span>
              </div>
            </div>

            <div className="h-7 w-[2px] bg-gray-200 dark:bg-gray-700"></div>

            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="text-xl font-bold text-gray-800 dark:text-gray-100">Shree Medical Store</span>
            </div>
          </div>

          {/* Right: Status Chips + User + Light/Dark Switch */}
          <div className="flex items-center space-x-4">
            {/* Grey-blue chip: Local mode */}
            <div className="flex items-center space-x-2 px-4 py-2 bg-[#E9EEF2] dark:bg-gray-800 text-[#344054] dark:text-gray-200 rounded-xl border border-gray-300 dark:border-gray-700 font-semibold text-base">
              <span className="w-2.5 h-2.5 rounded-full bg-[#475467] dark:bg-gray-400"></span>
              <span>Local mode</span>
            </div>

            {/* Green chip: Backup: Aaj with tick */}
            <div className="flex items-center space-x-2 px-4 py-2 bg-[#ECFDF3] dark:bg-[#133824] text-brand dark:text-[#52c984] border border-[#A6F4C5] dark:border-[#1d5c38] rounded-xl font-semibold text-base">
              <svg className="w-5 h-5 stroke-[2.5] text-brand dark:text-[#52c984]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>Backup: Aaj</span>
            </div>

            {/* User name: Raju */}
            <div className="flex items-center space-x-2.5 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100">
              <div className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm">
                R
              </div>
              <span className="font-bold text-lg">Raju</span>
            </div>

            {/* Moon / Sun light/dark switch */}
            <button
              type="button"
              aria-label="Toggle light dark"
              onClick={toggleTheme}
              className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-700 dark:text-yellow-400 transition cursor-pointer"
            >
              {theme === 'dark' ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* MAIN AREA: 8 BIG SQUARE TILES IN A GRID */}
        <main className="w-full flex-1 flex items-center justify-center py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-[1392px]">
            
            {/* Tile 1: Dawai Becho (Sell, green, largest and first) */}
            <div className="bg-brand text-white rounded-2xl flex flex-col justify-between shadow-lg shadow-brand/20 border-2 border-brand hover:brightness-105 cursor-pointer transition h-[225px] p-6">
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
                  {/* Shopping Cart / Medicine Pill Icon */}
                  <svg className="w-8 h-8 text-white stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight">Dawai Becho</div>
                <div className="text-base text-white/85 font-medium mt-0.5">Sell</div>
              </div>
            </div>

            {/* Tile 2: Fast Bill (Rush) */}
            <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6">
              <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-semantic-blue flex items-center justify-center">
                {/* Lightning Bolt Icon */}
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">Fast Bill</div>
                <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">Rush</div>
              </div>
            </div>

            {/* Tile 3: Stock Jodo (Add stock) */}
            <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6">
              <div className="w-14 h-14 rounded-xl bg-green-50 dark:bg-green-950/50 text-brand flex items-center justify-center">
                {/* Plus Box / Inward Stock Icon */}
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">Stock Jodo</div>
                <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">Add stock</div>
              </div>
            </div>

            {/* Tile 4: Stock Dekho (View stock) */}
            <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6">
              <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
                {/* Eye / Inventory List Icon */}
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">Stock Dekho</div>
                <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">View stock</div>
              </div>
            </div>

            {/* Tile 5: Expiry (Alerts, orange accent) */}
            <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border-2 border-semantic-orange/30 dark:border-semantic-orange/40 hover:border-semantic-orange hover:shadow-md cursor-pointer transition h-[225px] p-6">
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 rounded-xl bg-semantic-orangeBg dark:bg-orange-950/40 text-semantic-orange flex items-center justify-center">
                  {/* Calendar Warning Icon */}
                  <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                  </svg>
                </div>
                <span className="w-3.5 h-3.5 rounded-full bg-semantic-orange"></span>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">Expiry</div>
                <div className="text-base text-semantic-orange font-bold mt-0.5">Alerts</div>
              </div>
            </div>

            {/* Tile 6: Udhaar (Credit) */}
            <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6">
              <div className="w-14 h-14 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-semantic-yellow flex items-center justify-center">
                {/* Book / Ledger / Khata Icon */}
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">Udhaar</div>
                <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">Credit</div>
              </div>
            </div>

            {/* Tile 7: Din Band (Close day) */}
            <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6">
              <div className="w-14 h-14 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-semantic-red flex items-center justify-center">
                {/* Cash Register / Shutter / Lock Icon */}
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">Din Band</div>
                <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">Close day</div>
              </div>
            </div>

            {/* Tile 8: Owner (key icon, Owner PIN) */}
            <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6">
              <div className="w-14 h-14 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                {/* Key Icon */}
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">Owner</div>
                <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">Owner PIN</div>
              </div>
            </div>

          </div>
        </main>

        {/* BELOW: SUMMARY STRIP WITH FOUR BIG NUMBERS */}
        <footer className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800 gap-y-4 md:gap-y-0">
            
            {/* Metric 1: Aaj ki bikri Rs. 12,400 */}
            <div className="px-6 flex flex-col justify-center">
              <div className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-1">Aaj ki bikri</div>
              <div className="text-[38px] font-black text-brand tracking-tight leading-none">
                Rs. 12,400
              </div>
            </div>

            {/* Metric 2: Bills 48 */}
            <div className="px-6 flex flex-col justify-center">
              <div className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-1">Bills</div>
              <div className="text-[38px] font-black text-gray-900 dark:text-white tracking-tight leading-none">
                48
              </div>
            </div>

            {/* Metric 3: Expiry 30 din: 5 dawai (orange) */}
            <div className="px-6 flex flex-col justify-center">
              <div className="flex items-center space-x-2 text-lg font-semibold text-semantic-orange mb-1">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>Expiry 30 din</span>
              </div>
              <div className="text-[38px] font-black text-semantic-orange tracking-tight leading-none">
                5 dawai
              </div>
            </div>

            {/* Metric 4: Kam stock: 12 dawai (red) */}
            <div className="px-6 flex flex-col justify-center">
              <div className="flex items-center space-x-2 text-lg font-semibold text-semantic-red mb-1">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span>Kam stock</span>
              </div>
              <div className="text-[38px] font-black text-semantic-red tracking-tight leading-none">
                12 dawai
              </div>
            </div>

          </div>
        </footer>

      </div>
    </div>
  );
};

export default Home;
