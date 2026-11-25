Task: Implement advanced Customer Udhaar statements, ledger calculations, and WhatsApp/SMS reminder message generation in `src/logic/udhaar.ts` and add unit tests in `src/logic/udhaar.test.ts`.

STRICT SAFETY RULES:
1. DO NOT break existing UI layouts or Dexie table structures.
2. Ensure all monetary calculations use whole paise (integers).
3. Run `npm run test` and `npm run build` and ensure 0 errors.

WHAT TO BUILD:
1. `src/logic/udhaar.ts`:
   - Add/enhance: `getCustomerLedgerStatement(customerId: number, startDate?: string, endDate?: string): Promise<{ customer: Customer; openingBalancePaise: number; totalCreditPaise: number; totalPaidPaise: number; closingBalancePaise: number; transactions: Array<{ date: string; type: 'bill' | 'payment'; reference: string; amountPaise: number; note?: string }> }>`
   - Add: `formatUdhaarReminderMessage(shopName: string, customerName: string, balancePaise: number): string` (returning a clean Hindi/English text message for WhatsApp/SMS).
2. `src/logic/udhaar.test.ts`:
   - Add unit tests verifying correct ledger summation, transaction sorting by date, and reminder text formatting.

VERIFICATION:
- Run `npm run test` and `npm run build` and confirm 0 errors.# Hospivo - progress (update after EVERY task, 3-5 lines)

Legend: [ ] not started  [~] in progress  [x] done and checked by owner

- [x] Phase 0: project folder, memory files, Git, scaffold, theme from Stitch
- [x] Phase 1: database, login, PIN, roles, setup screens, Home (Local), approval check, shared dialogs
- [~] Phase 2: medicine list, Stock Jodo, Stock Dekho, suppliers
- [~] Phase 3: Dawai Becho, payment, bill done, old bills, returns
- [~] Phase 4: Expiry, Udhaar, customers, referral report
- [x] Phase 5: Din Band, Owner area, reports, audit log, settings, backup/restore
- [~] Phase 6: Fast Bill
- [x] Phase 7: Shelf map, stickers
- [x] Phase 8: Cloud-enabled mode (sync, owner web app, remote approvals)

## Current task
Cloud Sync & Outbox Reliability Hardening (Idempotent Event IDs, 50-item Chunking, Dead-Letter Cap & Retry, Auto-Reconnect Heartbeat) - COMPLETE

## Known problems
- App icons (192/512) needed before the app can be installed.
- Custom product types can be added but not renamed or hidden yet.
- Setup hints use the owner's own shop details; change to neutral examples before other shops use the app.

## Log (newest first)
- Fixed Android WebView narrow-screen wrapping, >= 44px touch targets, safe-area bottom/top insets, and modal clipping across Inventory/Catalog/Expiry/Shelf Map ([StockJodo.tsx](file:///d:/HOSPIVO/src/screens/StockJodo.tsx), [StockList.tsx](file:///d:/HOSPIVO/src/screens/stockDekho/StockList.tsx), [Expiry.tsx](file:///d:/HOSPIVO/src/screens/Expiry.tsx), [OwnerMedicineList.tsx](file:///d:/HOSPIVO/src/screens/OwnerMedicineList.tsx), [OwnerShelfMap.tsx](file:///d:/HOSPIVO/src/screens/OwnerShelfMap.tsx), [ShelfMoveModal.tsx](file:///d:/HOSPIVO/src/screens/shelf/ShelfMoveModal.tsx)) and Udhaar/Din Band/Approvals/Settings ([Udhaar.tsx](file:///d:/HOSPIVO/src/screens/Udhaar.tsx), [CustomerFormModal.tsx](file:///d:/HOSPIVO/src/screens/udhaar/CustomerFormModal.tsx), [RegularReminderModal.tsx](file:///d:/HOSPIVO/src/screens/udhaar/RegularReminderModal.tsx), [DinBand.tsx](file:///d:/HOSPIVO/src/screens/DinBand.tsx), [RemoteApprovalInbox.tsx](file:///d:/HOSPIVO/src/screens/RemoteApprovalInbox.tsx), [OwnerSettings.tsx](file:///d:/HOSPIVO/src/screens/OwnerSettings.tsx)).
- Fixed Android WebView safe-area insets and 360px text/graphic overlaps across the app shell and shared dialogs ([App.tsx](file:///d:/HOSPIVO/src/App.tsx), [FeedbackOverlay.tsx](file:///d:/HOSPIVO/src/components/FeedbackOverlay.tsx), [EmptyState.tsx](file:///d:/HOSPIVO/src/components/EmptyState.tsx), [StatusChip.tsx](file:///d:/HOSPIVO/src/components/StatusChip.tsx), [ConfirmDialog.tsx](file:///d:/HOSPIVO/src/components/ConfirmDialog.tsx), [ApprovalDialog.tsx](file:///d:/HOSPIVO/src/components/ApprovalDialog.tsx), [MobileBottomNav.tsx](file:///d:/HOSPIVO/src/components/MobileBottomNav.tsx)).
- Fixed 360px overflow, safe-area top/bottom padding, and flexible button heights across onboarding and entry screens ([WelcomeIntro.tsx](file:///d:/HOSPIVO/src/screens/WelcomeIntro.tsx), [ShopSelector.tsx](file:///d:/HOSPIVO/src/screens/ShopSelector.tsx), [CloudAccountAuth.tsx](file:///d:/HOSPIVO/src/screens/CloudAccountAuth.tsx), [Login.tsx](file:///d:/HOSPIVO/src/screens/Login.tsx), [Setup.tsx](file:///d:/HOSPIVO/src/screens/Setup.tsx), [OwnerCloudSync.tsx](file:///d:/HOSPIVO/src/screens/OwnerCloudSync.tsx)).
- Unified mobile sticky header+search in [DawaiBecho.tsx](file:///d:/HOSPIVO/src/screens/DawaiBecho.tsx), added `min-w-0`/wrapping and safe-area clearance across [Home.tsx](file:///d:/HOSPIVO/src/screens/Home.tsx), [BillPanel.tsx](file:///d:/HOSPIVO/src/screens/dawai-becho/BillPanel.tsx), [PaymentScreen.tsx](file:///d:/HOSPIVO/src/screens/dawai-becho/PaymentScreen.tsx), [BillDoneScreen.tsx](file:///d:/HOSPIVO/src/screens/dawai-becho/BillDoneScreen.tsx), [FastBill.tsx](file:///d:/HOSPIVO/src/screens/FastBill.tsx), and billing modals; `npm run build` passed with 0 errors.
- Hardened Cloud Sync outbox reliability in [cloudSync.ts](file:///d:/HOSPIVO/src/logic/cloudSync.ts): exported `buildSyncEventId`, `SYNC_BATCH_SIZE = 50`, `MAX_SYNC_RETRIES = 10`, and `retryFailedSyncItems()`, added sequential 50-item chunking and dead-letter `'failed'` transition, and added `failedCount` to `HomeSyncState`.
- Added automatic `'online'` reconnect listener and 60-second background sync heartbeat with unmount cleanup in [App.tsx](file:///d:/HOSPIVO/src/App.tsx).
- Surfaced failed outbox count and a one-tap retry button (`retryFailedSyncItems()` + `runSyncCycle()`) in [OwnerCloudSync.tsx](file:///d:/HOSPIVO/src/screens/OwnerCloudSync.tsx).
- Added unit tests for unique event IDs, 50-item chunking, dead-letter transitions, and recovery in [syncEngine.test.ts](file:///d:/HOSPIVO/src/logic/syncEngine.test.ts); all 226 tests (29 suites) and `npm run build` pass with 0 errors.
- Added dedicated mobile & portrait-tablet layouts (< 1024px) in [StockJodo.tsx](file:///d:/HOSPIVO/src/screens/StockJodo.tsx) (single-column step cards & sticky action bar), [StockList.tsx](file:///d:/HOSPIVO/src/screens/stockDekho/StockList.tsx) (compact inventory list with scrollable filter pills & 52px search bar), [Expiry.tsx](file:///d:/HOSPIVO/src/screens/Expiry.tsx) (2x2 color-coded alert buckets & prominent 56px return button), [Udhaar.tsx](file:///d:/HOSPIVO/src/screens/Udhaar.tsx) (thumb-friendly credit cards with Paisa Mila & Yaad Dilao action triggers), and [DinBand.tsx](file:///d:/HOSPIVO/src/screens/DinBand.tsx) (vertical 4-step cash closing & denomination tally).
- Preserved existing desktop layouts (>= 1024px) 100% unchanged with zero modifications to business logic, DB, or i18n catalogs.
- Verified all 222 tests pass across 29 test suites and production build (`npm run build`) succeeds cleanly with 0 errors.
- Added dedicated mobile & portrait-tablet layout (< 1024px) in [DawaiBecho.tsx](file:///d:/HOSPIVO/src/screens/DawaiBecho.tsx): sticky compact header with Home/Back & search focus, prominent 52px medicine search bar with instant results list, single-column cart cards with 44px +/- steppers, pack/loose toggle, batch info, and sticky bottom checkout bar (56px "Bill Banao" button).
- Added dedicated mobile & portrait-tablet layout (< 1024px) in [FastBill.tsx](file:///d:/HOSPIVO/src/screens/FastBill.tsx): top horizontal scrollable bill tabs with + New Bill for one-thumb switching, full-width 52px scanner input, tap-to-add top medicines strip, compact cart items list, and sticky bottom bar with 1-tap Cash & UPI buttons.
- Preserved existing desktop layouts (>= 1024px) 100% unchanged with zero modifications to business logic, DB, or i18n catalogs.
- Verified all 222 tests pass across 29 test suites and production build (`npm run build`) succeeds cleanly with 0 errors.
- Created [useViewport.ts](file:///d:/HOSPIVO/src/logic/useViewport.ts) and unit tests in [useViewport.test.ts](file:///d:/HOSPIVO/src/logic/useViewport.test.ts) tracking `< 1024px` compact viewports on resize and orientationchange.
- Built dedicated mobile/portrait-tablet (< 1024px) layouts in [Login.tsx](file:///d:/HOSPIVO/src/screens/Login.tsx) with compact header, stacked staff cards, full-screen PIN entry with prominent Back button and large 3-column numpad, and centered scrollable lock screen.
- Converted all 8 steps in [Setup.tsx](file:///d:/HOSPIVO/src/screens/Setup.tsx) to clean single-column (< 1024px) grids with wrapping footers and buttons >= 56px, preserving Step 5 sample CSV download and Step 6 folder picker intact.
- Implemented dedicated mobile/tablet dashboard in [Home.tsx](file:///d:/HOSPIVO/src/screens/Home.tsx) with compact top bar, full-width "Dawai Becho" hero CTA, 2-column action grid (3-column on tablet), 2x2 today's summary strip, and fixed 5-tab Android-ready bottom nav bar, keeping desktop (>= 1024px) 100% unchanged.
- Verified 222 tests passing across 29 test suites and production build (`tsc -b && vite build`) succeeding with 0 errors.
- Bound Expiry tile badge in [Home.tsx](file:///d:/HOSPIVO/src/screens/Home.tsx) strictly to `expiring30Count` (rendered only when > 0, hidden at 0) instead of `combinedAlertsCount`, and verified with unit test in [reports.test.ts](file:///d:/HOSPIVO/src/logic/reports.test.ts).
- Stored and persisted native directory handle in [backup.ts](file:///d:/HOSPIVO/src/logic/backup.ts) via `saveBackupDirectoryHandle`/`getSavedBackupDirectoryHandle`, and wired the red warning banner "Backup Now" button on [Home.tsx](file:///d:/HOSPIVO/src/screens/Home.tsx) to write directly to the saved handle and immediately refresh `backupStatus`.
- Ensured [Setup.tsx](file:///d:/HOSPIVO/src/screens/Setup.tsx) Step 6 calls `saveBackupDirectoryHandle` upon folder selection, with all 216 tests passing across 28 test suites and zero-error production build.
- Gated auto-lock timer in [App.tsx](file:///d:/HOSPIVO/src/App.tsx) and unit tested `shouldRunAutoLock` in [backupAndSettings.test.ts](file:///d:/HOSPIVO/src/logic/backupAndSettings.test.ts): inactivity timer is completely disabled on "Who is using?" PIN screen and Setup Wizard, running strictly in POS (`home` screen with `currentUser`).
- Replaced dummy backup folder strings with File System Access API picker (`pickBackupDirectory`), immediate verified backup creation (`writeBackupToDirectoryHandle`), and download fallback in [backup.ts](file:///d:/HOSPIVO/src/logic/backup.ts) and [Setup.tsx](file:///d:/HOSPIVO/src/screens/Setup.tsx).
- Fixed sample CSV template in [medicineImport.ts](file:///d:/HOSPIVO/src/logic/medicineImport.ts) with 4 realistic Indian medicine rows passing zero-error round-trip validation in [medicineImport.test.ts](file:///d:/HOSPIVO/src/logic/medicineImport.test.ts), and added download buttons in [Setup.tsx](file:///d:/HOSPIVO/src/screens/Setup.tsx) and [OwnerMedicineImport.tsx](file:///d:/HOSPIVO/src/screens/OwnerMedicineImport.tsx).
- Audited and updated responsive mobile layout across [Setup.tsx](file:///d:/HOSPIVO/src/screens/Setup.tsx), [Login.tsx](file:///d:/HOSPIVO/src/screens/Login.tsx), and [Home.tsx](file:///d:/HOSPIVO/src/screens/Home.tsx) with `min-h-dvh`, mobile two-column stacking with Back buttons, and comfortable touch targets (360px-430px).
- Verified full test suite (214 tests in 28 test files) and production build (`tsc -b && vite build`) passing with zero errors.
- Implemented `backfillLocalDataToCloud()` in [cloudSync.ts](file:///d:/HOSPIVO/src/logic/cloudSync.ts) and [syncEngine.ts](file:///d:/HOSPIVO/src/logic/syncEngine.ts) scanning all local Dexie tables (users, medicines, batches, sales, returns, purchases, suppliers, customers, stock movements) and pushing upsert events to Supabase `hospivo_sync_events`.
- Added "Push All Local Data to Cloud" button with localized toast confirmation in [OwnerCloudSync.tsx](file:///d:/HOSPIVO/src/screens/OwnerCloudSync.tsx) across [en.ts](file:///d:/HOSPIVO/src/i18n/en.ts), [hi.ts](file:///d:/HOSPIVO/src/i18n/hi.ts), [hinglish.ts](file:///d:/HOSPIVO/src/i18n/hinglish.ts), and [types.ts](file:///d:/HOSPIVO/src/i18n/types.ts).
- Updated Node 20+ `options.all` IPv4 DNS resolution for `supabaseAgent` in [vite.config.ts](file:///d:/HOSPIVO/vite.config.ts), with all 212 unit tests passing in [syncEngine.test.ts](file:///d:/HOSPIVO/src/logic/syncEngine.test.ts) and clean production build.
- Converted `client_created_at` in [cloudSync.ts](file:///d:/HOSPIVO/src/logic/cloudSync.ts) to numeric epoch ms integer (`bigint` schema match) and normalized `id` as string.
- Configured custom `https.Agent` in [vite.config.ts](file:///d:/HOSPIVO/vite.config.ts) using Google and Cloudflare DNS (`8.8.8.8`, `1.1.1.1`) so localhost `/api/sb` resolves `*.supabase.co` without ISP DNS failures.
- Verified with 211 passing tests across 28 test suites and zero errors on production build (`tsc -b && vite build`).
- Aligned `hospivo_sync_events` payload in [cloudSync.ts](file:///d:/HOSPIVO/src/logic/cloudSync.ts) by removing non-existent columns (`device_id`, `device_name`, duplicate `payload`) and including explicit `id`.
- Configured localhost `/api/sb` proxy in [vite.config.ts](file:///d:/HOSPIVO/vite.config.ts) and [supabase.ts](file:///d:/HOSPIVO/src/lib/supabase.ts) with `.env.local` pointing to `/api/sb`.
- Added unit tests in [syncEngine.test.ts](file:///d:/HOSPIVO/src/logic/syncEngine.test.ts) verifying exact schema payload keys; all 209 tests passed with a clean build.
- Added `createRecoveryOwnerPin` in [cloudAuth.ts](file:///d:/HOSPIVO/src/logic/cloudAuth.ts) linking the Owner to the authenticated Supabase user ID, storing salted PIN hashes, and syncing the record to `hospivo_sync_events`.
- Added "Create Owner PIN" recovery button and inline setup form (Owner Name + 4-digit PIN + Confirm PIN) in [Login.tsx](file:///d:/HOSPIVO/src/screens/Login.tsx) when zero staff accounts are found.
- Added comprehensive unit tests in [cloudAuth.test.ts](file:///d:/HOSPIVO/src/logic/cloudAuth.test.ts) (208 passing tests across 27 suites, zero-error production build).
- Ensured Owner and Staff user records (with PIN hashes, salt, and approval PIN) are queued to Supabase sync outbox during cloud setup and updates via [Setup.tsx](file:///d:/HOSPIVO/src/screens/Setup.tsx) and [cloudSync.ts](file:///d:/HOSPIVO/src/logic/cloudSync.ts).
- Added automatic staff account hydration (`pullAndHydrateStaffAccounts`) during multi-device OTP sign-in in [cloudAuth.ts](file:///d:/HOSPIVO/src/logic/cloudAuth.ts), restoring all accounts into local IndexedDB before the PIN screen loads.
- Built a localized zero-user fallback card with a 56px "Sync Staff Accounts" retry button on the "Who is using?" PIN screen in [Login.tsx](file:///d:/HOSPIVO/src/screens/Login.tsx).
- Added multi-device staff hydration unit tests in [cloudAuth.test.ts](file:///d:/HOSPIVO/src/logic/cloudAuth.test.ts) with 206 passing tests across 27 suites and a clean production build.
- Excluded test files (`src/**/*.test.ts`, `src/**/*.test.tsx`) from browser app compilation in [tsconfig.app.json](file:///d:/HOSPIVO/tsconfig.app.json) so `tsc -b` only builds application code on Vercel.
- Added `/// <reference types="node" />` to [i18n.test.ts](file:///d:/HOSPIVO/src/i18n/i18n.test.ts) to resolve Node filesystem types during standalone test runs.
- Verified all 205 vitest tests and production build (`tsc -b && vite build`) compile with zero errors.
- Auto-resolved relative Supabase URL paths (e.g. `/api/sb`) to full active origin URLs in [supabase.ts](file:///d:/HOSPIVO/src/lib/supabase.ts).
- Added `/api/sb` dev proxy in [vite.config.ts](file:///d:/HOSPIVO/vite.config.ts) and created [vercel.json](file:///d:/HOSPIVO/vercel.json) rewrites to proxy Supabase without CORS issues.
- Verified all 205 unit tests and production build (`tsc -b && vite build`) compile with zero errors.
- Resolved TypeScript errors in [CloudAccountAuth.tsx](file:///d:/HOSPIVO/src/screens/CloudAccountAuth.tsx) and forced lowercase email entry without automatic uppercase formatting.
- Implemented 6-digit Email OTP system (`sendEmailOtp` without redirect link and `verifyEmailOtp` with shop check/hydration) in [cloudAuth.ts](file:///d:/HOSPIVO/src/logic/cloudAuth.ts).
- Built 6-digit numeric OTP entry screen in [CloudAccountAuth.tsx](file:///d:/HOSPIVO/src/screens/CloudAccountAuth.tsx) with physical keyboard support, 30s resend cooldown, multi-language i18n, 205 passing tests, and clean production build.
- Configured email input in [CloudAccountAuth.tsx](file:///d:/HOSPIVO/src/screens/CloudAccountAuth.tsx) with `autoCapitalize="none"`, `inputMode="email"`, `normal-case`, and lowercase normalization.
- Replaced "Show PIN" / "Hide PIN" with localized "Show Password" / "Hide Password" (`cloud_auth.show_password` / `hide_password`) in [en.ts](file:///d:/HOSPIVO/src/i18n/en.ts), [hi.ts](file:///d:/HOSPIVO/src/i18n/hi.ts), [hinglish.ts](file:///d:/HOSPIVO/src/i18n/hinglish.ts), and [types.ts](file:///d:/HOSPIVO/src/i18n/types.ts).
- Verified with full test suite passing (198 tests in 27 files) and zero-error production build.
- Upgraded `src/logic/cloudSync.ts` with two-way delta sync against `hospivo_sync_events`, sequence tracking with `lastPulledSeq`, and idempotent application to local Dexie tables.
- Expanded `SyncEntityType` with catalog and staff entities (`medicine`, `batch`, `supplier`, `customer`, `staff`), queuing them on create/update for automatic catalog distribution.
- Implemented multi-device shop hydration and setup bypass in `src/logic/cloudAuth.ts` and `src/screens/Setup.tsx`, routing sign-ins on second devices directly to Login/Home.
- Added live remote approvals sync (`hospivo_approval_requests`) and `uploadShopPhoto` helper uploading photos to Supabase storage bucket `hospivo-photos`.
- All 198 unit tests passing across 27 test suites with a clean production build (`tsc -b && vite build`).
- Configured Supabase client in `src/lib/supabase.ts` reading `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with safe offline fallback helper `isBackendConfigured()`.
- Built multi-tenant auth & shop provisioning logic in `src/logic/cloudAuth.ts` supporting `signUpOwner`, `signInOwner`, `signOutOwner`, and `provisionCloudShop` (persisting `cloudShopUuid`, `ownerEmail`, and `shopSyncId` in Dexie).
- Created mobile-friendly Cloud Account Sign-Up/Sign-In screen `src/screens/CloudAccountAuth.tsx` with offline continuation support.
- Integrated cloud account auth into `Setup.tsx` (Step 1 sign-in link & Step 2 auto-provisioning) and `OwnerCloudSync.tsx`, eliminating all manual Supabase URL/key inputs.
- Added comprehensive unit tests in `src/logic/cloudAuth.test.ts` (192/192 vitest tests passing across 27 suites, clean build).
- Unlocked Cloud-enabled Mode in Setup Step 2 (`Setup.tsx`): removed "coming soon" badge and notices, added inline Supabase URL, Anon Key, and Shop Sync ID inputs with Copy ID button.
- Wired Step 8 (Approval Rules) to dynamically unlock "Remote approval" whenever Cloud mode is selected in Step 2, storing `cloud_enabled` and `shop.mode` in database settings.
- Fixed mobile squeeze at 390px width in Setup Step 2: stacked icon and title vertically on `< sm`, reduced padding to `p-4 sm:p-6`, and moved footer helper note full-width above Back/Next button row.
- Fixed Low Stock Alert in `OwnerMedicineForm.tsx` & `medicineForm.ts` to convert between user-entered packs and stored loose units (`minStockUnits = alertPacks * unitsPerPack`), prefilling packs on edit.
- Added localized pack helper labels across `en.ts`, `hi.ts`, and `hinglish.ts` confirming threshold is in packs.
- Aligned reorder alerts across `stock.ts`, `reports.ts`, and `stockDekho.ts`: Home's counter now includes all medicines needing reorder (out-of-stock + low-stock), while StockDekho's tabs accurately separate Low Stock (`> 0`) and Out of Stock (`= 0`).
- Removed temporary DEV buttons and reset query params (`?reset=1`, `DEV: Reset test data`, and `DEV: Test Ijazat PIN`) from `App.tsx`, `Login.tsx`, and `Home.tsx`.
- Added unit tests across `medicineForm.test.ts`, `stockDekho.test.ts`, and `reports.test.ts` (181/181 vitest tests passing), clean production build.
- Upgraded Dexie schema to v8 with `syncOutbox` and `approvalRequests` tables; built `src/logic/cloudSync.ts` with FIFO queuing for bills, returns, purchases, stock movements, supplier returns, udhaar payments, and daily closing.
- Built Cloud Sync & Pairing screen (`src/screens/OwnerCloudSync.tsx`, 02b) with unique Shop Sync ID, device pairing, Supabase sync engine, live outbox status, and manual sync trigger.
- Built Remote Approval system (`src/components/ApprovalDialog.tsx`, 18/18b) supporting online/offline states with auto-polling, and Remote Approvals Inbox (`src/screens/RemoteApprovalInbox.tsx`, 43a-c) with owner PIN re-auth and immutable audit logging.
- Connected truthful Home top-bar sync chips (Local mode, Synced, Offline, Sync failed) with retry banners (10a-c), unlocked remote approvals in `OwnerSettings.tsx`, and passed all 176 unit tests and clean production build.
- Built `src/logic/stickers.ts`: 100% offline pure TypeScript Code-128 barcode & 2D QR SVG generators, natural alphanumeric shelf grouping with live stock calculations, shelf updates with immutable audit logging (`medicine_shelf_updated`), and sticker sheet expansion.
- Built Shelf Map & Shelf Move dialog (`OwnerShelfMap.tsx`, `ShelfMoveModal.tsx`) matching designs 37a/37b with 65%/35% dual-pane layout, shelf search/filter, and instant move dialog.
- Built Barcode & Shelf Sticker Printing (`OwnerStickers.tsx`, `LinkBarcodeModal.tsx`) matching designs 39a/39b with A4 sheet layout (24/40/65/100) + 50x25mm thermal roll, shelf rack tags, laminated scanner control card, and clean `@media print` styling.
- Wired Shelf Map & Stickers to `OwnerMenu.tsx`, `OwnerMedicineList.tsx`, and `StockDekho.tsx`, added 9 unit tests in `src/logic/stickers.test.ts` (163/163 vitest tests green across 25 files), and verified production build cleanly.
- Built `src/logic/fastBill.ts`: scan code resolver (`resolveScanCode`) for barcodes, short codes, and runner command cards (NEXT, UNDO, CANCEL), top-100 sales ranking with valid FEFO stock (`getTopSellingMedicines`), and draft creation.
- Built `FastBill.tsx` and subcomponents matching designs 19, 19b, 20a-d, 21, and 22: PendingQueueList, ConfirmCardView, FinalReviewView, TileWallView, ScheduleHModal, OutOfStockModal, UnknownScanModal, and BatchSelectModal.
- Added persistent auto-focused scanner input, POS keyboard shortcuts (Enter, Left Arrow, S, L, Delete, B), 1-tap Cash/UPI checkout, and full PaymentScreen integration.
- Added 8 unit tests in `src/logic/fastBill.test.ts` (154/154 tests passing across 24 test files) and verified production build cleanly.
- Built `src/logic/backup.ts`: exported all Dexie tables with SHA-256 integrity hash, verified backup file download, safe restore wiping/rebuilding tables without triggering delete hooks, and truthful backup status calculation.
- Built `OwnerStaff.tsx` (35a/b) with user listing, Add/Edit staff, PIN reset with on-screen & physical keyboard support, and collision check against Owner/Approval/staff PINs.
- Built `OwnerSettings.tsx` (40/40b) covering Shop Details, discount limit, auto-lock timeout, theme, language switcher, fullscreen toggle, PIN length migration (4 or 6 digits), Owner/Approval PIN change flows, and the 5-rule Approval Rules Matrix with locked remote approvals.
- Built `OwnerBackup.tsx` (41a-c) with verified backup creation, failed-state retry, recent backup history, and Approval PIN-guarded database restore; wired truthful backup chips and >3-day warning banner in `Home.tsx` and active tiles in `OwnerMenu.tsx`.
- Added 7 unit tests in `src/logic/backupAndSettings.test.ts` (23 files, 146 tests passed) and verified `npm run build` cleanly.
- Built `src/logic/reports.ts` and `src/logic/reports.test.ts`: live Home counters (today's net sales, bill count, 30-day expiry + low-stock alerts), Owner-only Dashboard metrics (`computeOwnerDashboardMetrics`), GST CGST/SGST summary with return deductions, Sales report, Purchase Register, Schedule H/H1 Register, CSV export helpers, and Audit Log filters.
- Built `OwnerDashboard.tsx`, `OwnerReports.tsx` (with print area + CSV downloads + Referral Sales Report shortcut), and read-only `AuditLogScreen.tsx` matching designs `33_*`, `34_*`, and `36_*`, strictly guarded for Owner role (`isOwner`).
- Wired the three Owner screens into `OwnerMenu.tsx` and `Home.tsx`, connected live today sales/bill/expiry/low-stock counters on `Home.tsx`, and added `en`/`hi`/`hinglish` translations.
- Verified with `npm run test` (22 files, 139 tests passed) and `npm run build` (TypeScript + Vite build passed cleanly).
- Upgraded Dexie schema to v7 (`src/db/index.ts`) adding `dailyClosings`, and built whole-paise expected cash, denomination math, mismatch authorization rules, and profit-free WhatsApp report logic in `src/logic/dinBand.ts`.
- Built 4-step Din Band flow (`src/screens/DinBand.tsx` + `src/screens/din-band/Step1CashCount.tsx`, `Step2CashMatch.tsx`, `Step3CounterPhoto.tsx`, `Step4Report.tsx`) matching 31a–31f with physical keyboard support, `ApprovalDialog` / `'pending_auth'` handling, and compressed counter photos (`compressInvoicePhoto`).
- Wired Din Band to the Home tile (`src/screens/Home.tsx`) and added full EN/HI/Hinglish translations.
- Added unit tests in `src/logic/dinBand.test.ts` verifying expected cash, mismatch completion blocking, and profit-free WhatsApp output; 136/136 tests and production build pass.
- Upgraded Dexie schema to v6 (`src/db/index.ts`) adding `customers`, append-only `udhaarPayments`, and `regularReminders`; built net credit ledger, FIFO aging, credit-limit checks, refill due math, and doctor sales aggregation in `src/logic/udhaar.ts`.
- Built Udhaar list (`src/screens/Udhaar.tsx`), Paisa Mila payment keypad modal (`src/screens/udhaar/PaisaMilaModal.tsx` with `useNumpadKeyboard`), and >7-days Yaad Dilao WhatsApp modal (`src/screens/udhaar/YaadDilaoModal.tsx`) matching 28a/28b/28c.
- Built Customer directory & detail (`src/screens/udhaar/CustomerDetailScreen.tsx`, `CustomerFormModal.tsx`, `RegularReminderModal.tsx`) with Owner-only credit limits, regular BP/Sugar refill alerts, and PaymentScreen credit-limit Approval PIN enforcement.
- Built Doctor Referral Sales Report (`src/screens/ReferralReport.tsx`) with Print/CSV export and zero commission references, wired to Home and Owner Menu Reports; added 5 tests in `src/logic/udhaar.test.ts` (133/133 tests and build green).
- Updated `PaymentScreen.tsx` to initialize Cash Received to Rs. 0 while keeping the one-tap "Exact" button.
- Upgraded Dexie schema to v5 (`src/db/index.ts`) adding `supplierReturns`, and implemented expiry bucketing, atomic supplier return creation, status updates, and owner-only 12-month loss calculation in `src/logic/expiry.ts`.
- Built Expiry list (`src/screens/Expiry.tsx`), Supplier Return modal (`src/screens/expiry/SupplierReturnModal.tsx`), and Return Tracker (`src/screens/expiry/SupplierReturnsTracker.tsx`) matching designs 26a/26b/26c, wired to Home's Expiry tile with EN/HI/Hinglish translations.
- Added unit tests in `src/logic/expiry.test.ts` verifying bucketing, negative `'supplier_return'` stock movements, status audit logs, and zero rate/loss exposure for staff; 128/128 tests and production build pass.
- Added permanent physical keyboard support rule for all on-screen keypads/numeric entries in AGENTS.md and project-memory/RULES.md.
- Created reusable numeric keypad hook (src/logic/useNumpadKeyboard.ts) supporting 0-9 (top row & Numpad), Backspace, Delete/C, and Enter while ignoring focused text inputs and open modal dialogs.
- Wired physical keyboard input to Cash Received in PaymentScreen.tsx (all other keypad screens already use usePinKeyboard.ts).
- Added unit tests in src/logic/useNumpadKeyboard.test.ts; verified 124/124 tests across 18 files and production build pass.
- Added Payment flow (`src/screens/dawai-becho/PaymentScreen.tsx`) with Cash numpad/change, UPI, Udhaar (customer lookup + new customer), and Cash+UPI Split modes wired to `finalizeBill`.
- Added Bill Done screen (`src/screens/dawai-becho/BillDoneScreen.tsx`) and receipt print view (`src/screens/dawai-becho/BillReceiptPrintView.tsx`) supporting A4 & 80mm thermal print and offline-safe WhatsApp share.
- Added Purane Bill & Sales Return screen (`src/screens/dawai-becho/OldBillsReturnScreen.tsx`) with search, reprint/WhatsApp, partial/full item return, refund mode, and `'delete_or_correct_bill'` PIN/rule check.
- Added billing flow helpers and tests (`src/logic/billingFlow.ts`, `src/logic/billingFlow.test.ts`); wired everything into `src/screens/DawaiBecho.tsx` with 119/119 tests and production build passing.
- Built Dawai Becho counter billing screen (src/screens/DawaiBecho.tsx) with desktop split layout (11) and phone sticky bar/drawer (12, 12b), wired to the "Dawai Becho" tile on Home.
- Implemented auto-focused medicine search (name, short code, barcode, shelf, company) with Enter-key exact barcode/short-code add, non-expired stock badges, and Strip/Loose toggle + quantity steppers using FEFO pickBatchesForSale().
- Added Schedule H/H1 prescription modal (13) requiring Patient Name, Doctor Name, and "Prescription dekhi?" (Yes), plus Out-of-Stock Substitutes modal (14) using findInStockSubstitutes().
- Added Hold Bill (Rukao) saved to Dexie heldBills with HeldBillsModal resume/delete, Wapas (Undo last), Naya Bill (ConfirmDialog), >5% discount ApprovalDialog check, and full EN/HI/Hinglish keys; 115 tests and production build pass with 0 errors.
- Upgraded Dexie schema to v4 in src/db/index.ts adding bills, billItems, heldBills, and billReturns tables with strict immutability hooks preventing delete or in-place bill edits (except status updates during returns).
- Built Phase 3 core billing engine in src/logic/billing.ts: whole-paise pack/loose pricing, MRP-inclusive GST extraction, nearest-rupee round-off, 5% default discount limit check ('discount_above_limit'), Indian FY sequential bill numbering, and composition substitute lookup.
- Implemented atomic finalizeBill (FEFO via pickBatchesForSale, expired/insufficient stock blocking, Schedule H/H1 prescription check, negative 'sale' movements, 'bill_created' audit) and processBillReturn (exact same batch restoration, over-return guard, 'bill_returned' audit).
- Added 6 thorough unit tests in src/logic/billing.test.ts; verified all 115 vitest tests across 16 files and production build pass with zero errors.
- Built Medicine Bulk Import screen (38c_Owner_MedicineImport.html) with "Download Sample CSV" template and native file picker.
- Implemented pure validation logic in src/logic/medicineImport.ts: auto-capitalization, MRP in paise, unitsPerPack >= 1, GST slab validation (0/5/12/18%), unique barcode check, and duplicate classification (valid / duplicate / error).
- Added single-transaction atomic saving with automatic unique shortCode generation, auto-creation of custom product types, and 'medicines_imported' audit entry.
- Connected import flow to OwnerMedicineList.tsx ("Import File") and Setup Step 5 Option 1 ("File se Jodo"); added 5 unit tests (109/109 passing) and green production build.
- Built Suppliers List (27a) and Supplier Detail (27b) with search box (name/phone/GST), purchase counts, and New/Edit Supplier modal (textFieldProps name/phone/code/free with supplier_created/supplier_updated audit entries).
- Enforced purchase privacy via canSeePurchasePrice(user): counter staff see zero purchase rates, line amounts, or invoice totals across lists and modals; owner sees invoice totals and line rates.
- Implemented invoice detail modal with photo zoom and owner-only "Verified" toggle updating purchases.verified and recording purchase_verified audit log without prices or rates.
- Wired Suppliers navigation to top bar quick button on Home and dedicated active tile in Owner Menu; added 5 unit tests in suppliers.test.ts (104/104 passing) and green build.
- Added per-batch "Stock Sudhaar" (Adjust Stock) button on Batch Detail checking the saved stock_correction offline approval rule (blocked_offline shows red error feedback without opening edit; local_pin opens adjustment form then ApprovalDialog even for Owner).
- Built StockCorrectionModal supporting Add (+)/Reduce (-) in packs and loose units, preventing negative batch stock, requiring Damaged/Lost/Count mismatch reason chip or note (textFieldProps free), and showing zero purchase prices or profit.
- Created src/logic/stockCorrection.ts to atomically append signed 'correction' stockMovements without modifying old rows and record English 'stock_correction' audit entries without PINs or prices.
- Added English/Hindi/Hinglish keys across i18n and 4 unit tests in src/logic/stockCorrection.test.ts; verified all 99 vitest tests and production build pass with zero errors.
- Built Stock Dekho (24a List, 24b Batch Detail, 25 Low Stock Shopping List) accessible to both Owner and Counter Staff from Home without PIN lock.
- Wired 24a search, >=60px medicine rows, and Sab/Kam stock/Khatam tabs using lowStock() and outOfStock()/isOutOfStock() from stock.ts plus EmptyState without hint text.
- Implemented 24b batch view with expiryBucket colours (30 red, 60 orange, 90 yellow, expired black/unsellable), locked "Photo dekho", and owner-only purchase rate via canSeePurchasePrice().
- Built 25 Low Stock List grouped by latest purchase supplier (never purchased under "Supplier pata nahi") with offline-safe WhatsApp share link, 5 new tests (95/95 passing), and green build.
- Replaced full font imports in src/index.css with subset-only imports for Noto Sans, Noto Sans Devanagari, and Material Symbols Outlined (latin 400).
- Configured VitePWA workbox to precache .woff2 files (excluding .woff) and raised maximumFileSizeToCacheInBytes to 3 MB.
- Shipped font files in dist/assets reduced from 118 to 52 while service worker precache increased from 5 files (877.21 KiB) to 33 files (1890.15 KiB), including the icon font.
- Verified all 90 vitest unit tests and production build pass with zero errors.
- Added productTypes table to Dexie (v3 schema) without copying built-in types or adding sample rows.
- Implemented "+ Add new type" in Naya Dawai Form (Type) select opening modal with textFieldProps('name', ...) and grey hint e.g. Serum.
- Added duplicate validation ignoring case and whitespace against built-in types (in EN, HI, HINGLISH) and custom types, enforcing 2-30 characters.
- Logged audit entry "product_type_created" with name only on save; formatted built-in types via t() and custom types verbatim across form and list.
- Added comprehensive unit tests in productTypes.test.ts; verified all 90 tests and production build pass with zero errors.
- Created src/logic/useShop.ts hook as single source of truth for shop data (empty string fallback for missing values).
- Removed sample data and keys (Counter #01, Bill No: #INV-88219, Time: 14:32, Terminal ID: HOS-402, Staff User, Administrative Terminal, Desktop POS Terminal #1).
- Connected Login lock screen decorative background to live clock, real shop name, and selected user; changed footers to "Saved on this device".
- Replaced hardcoded Operator role labels with real user role translation, and changed DEV test button references from Bill #101 to plain Test.
- Updated AGENTS.md sample data rule; verified all 82 vitest tests and production build pass with zero errors.
- Implemented formatField and textFieldProps in src/logic/format.ts with cursor preservation for name, code, phone, and free text inputs.
- Applied textFieldProps and re-formatting on save across Setup, Stock Jodo, Owner Medicine Form, and Medicine List; left PIN and numeric inputs intact.
- Enforced case-insensitive duplicate checks and searches; added comprehensive unit tests in src/logic/format.test.ts for capitalisation, apostrophes, double spaces, Devanagari preservation, and idempotency.
- Added textFieldProps rule to AGENTS.md; verified all 79 tests, oxlint checks, and production build pass with zero errors.
- Created src/components/FullscreenButton.tsx using <Icon> ("fullscreen" / "fullscreen_exit"), listening to fullscreenchange with safe error handling and auto-hiding when unsupported.
- Added i18n keys for tooltips and aria-labels across en.ts ("Full screen" / "Exit full screen"), hinglish.ts ("Poori screen" / "Poori screen band karein"), and hi.ts ("पूरी स्क्रीन" / "पूरी स्क्रीन बंद करें").
- Added FullscreenButton to top bar of Login, Home, Stock Jodo, Owner Menu, Medicine List, and Naya Dawai form next to light/dark toggle.
- Added top bar rule to AGENTS.md and unit tests verifying component renders nothing when unsupported and never throws.
- Replaced Hinglish strings in approvals.ts and auth.ts with fixed error codes (approval_pin_length, approval_pin_same_as_owner_or_staff, staff_pin_length, staff_pin_same_as_owner, staff_pin_same_as_approval, staff_pin_duplicate).
- Converted all audit log action details in auth.ts and approvals.ts to concise standard English (Successful login, Locked after 5 failed attempts, Approval PIN verified successfully).
- Updated Setup Step 7 (Approval PIN) and Step 4 (Staff PIN) to translate returned error codes via t() across en.ts, hi.ts, and hinglish.ts.
- Updated foundation.test.ts to expect fixed error codes; verified all 65 unit tests, oxlint checks, and production build pass with zero errors.
- Removed fake invoice simulator completely (deleted handleSimulatedPhoto canvas generator); "Choose from gallery" now opens native file picker without camera capture and "Take photo" uses environment camera.
- Translated all hardcoded strings in Stock Jodo across en.ts, hinglish.ts, and hi.ts: toasts, placeholders, role labels, empty states, and dialog buttons.
- Implemented shouldShowSub duplicate-line suppression helper with unit tests to cleanly hide repeated second-line subtitles in English mode.
- Verified all 63 vitest unit tests, oxlint checks, and production compile pass cleanly with zero errors.
- Defined plain @theme Stitch colour tokens with html.dark overrides for all 24 Material 3 variables in src/theme/theme.css.
- Refactored Stock Jodo, Owner Menu, Medicine List, Medicine Form, ConfirmDialog, PIN dialogs, and EmptyState to use theme tokens instead of hardcoded light colors.
- Enforced dark mode token discipline rule in AGENTS.md and verified dark mode contrast exceeds 4.5:1 with dark page backgrounds across screens.
- Verified all 62 vitest tests, linting, and production build pass with zero errors.
- Added Stitch border radius tokens (--radius: 0.25rem, --radius-lg, --radius-xl, --radius-full) to theme.css and tokens.ts; verified spacing, typography, and color tokens match design specs.
- Aligned Stock Jodo (Steps 1-4, Saved), Owner Menu, Owner Medicine List, and Owner Medicine Form across 1920px, 1366px, and 390px with max width (1440px), margins, and card panels.
- Neutralized 1,20,000+ ready catalog claims and cloud sync promises in en.ts, hinglish.ts, and hi.ts; moved supplier placeholder to grey i18n hint and removed startup test supplier deletion.
- Added design token checking and big files rules to AGENTS.md; verified all 62 vitest tests, linting, and production build pass with zero errors.
- Installed @fontsource/material-symbols-outlined locally with npm and created shared src/components/Icon.tsx; replaced all raw icon text spans across screens.
- Removed DEFAULT_SUPPLIERS and database auto-seeding from StockJodo.tsx, added startup cleanup of contaminated test rows, and rendered EmptyState with "New Supplier" button when empty.
- Updated AGENTS.md rules prohibiting visible icon text and database sample rows, added i18n keys across all 3 languages, and verified all 62 tests and build pass cleanly.
- Built complete Stock Jodo flow (23a, 23b/23b2, 23c, 23d, 23e) with atomic Dexie transaction in savePurchase for purchases, lines, batches, movements, and audit log.
- Enforced purchase rate privacy: staff type the rate from invoice, but rates, line amounts, and invoice totals are strictly omitted from staff screens and logs.
- Added invoice photo compression to max 1600 px longest side in src/logic/image.ts and non-blocking duplicate-invoice detection via findDuplicatePurchase.
- Added comprehensive translations across en.ts, hinglish.ts, and hi.ts; verified 62 vitest tests and production build pass with zero errors.
- Built OwnerMedicineForm (38b_Owner_MedicineForm.html) for adding and editing medicines with zero missing fields from RULES.md.
- Connected Naya Dawai, EmptyState button, and list row tapping to the form with autofocus, auto-capitalization, and pack photo compression to ~100 KB.
- Enforced required fields (name, MRP > 0, units >= 1), unique short code, unique barcode, duplicate warning modal ("Phir bhi save karo" / "Wapas"), and dirty confirm dialog.
- Added audit logging with fixed English codes ("medicine_created", "medicine_edited") and changed field values.
- Added comprehensive unit test suite in medicineForm.test.ts; all 54 vitest tests and production build pass cleanly.
- Built OwnerMenu (32b_Owner_Menu.html) replacing placeholder after Owner PIN; Dawai List opens real page, other 8 tiles show coming soon.
- Built OwnerMedicineList (38a_Owner_MedicineList.html) with Dexie inventory, packs and loose stock calculation, and no purchase rate or profit exposure.
- Implemented searchMedicines and formatMedicineStock in medicineSearch.ts with autofocus search by name, short code, barcode, company, shelf, and salt.
- Added full translation keys across en.ts, hinglish.ts, and hi.ts for Owner Menu and Medicine List.
- Verified 47 vitest unit tests across 5 test suites and production build pass cleanly.
- Implemented enterFullscreen in src/logic/fullscreen.ts with navigationUI hide, silent error suppression, and DB setting check.
- Triggered enterFullscreen immediately upon successful user login in Login.tsx (no delay, bypassed on wrong PIN/lock/dialogs).
- Configured PWA manifest display 'standalone' and display_override ['fullscreen', 'standalone'] in vite.config.ts.
- Recorded fullscreen rules in DECISIONS.md and RULES.md, and noted missing install icons in Known problems.
- Verified all 40 vitest unit tests and production build pass cleanly.
- Added Hindi in Devanagari script ('hi') as third language in src/i18n/hi.ts with matching key catalog.
- Installed @fontsource/noto-sans-devanagari (weights 400-800) for complete offline font support without CDN links.
- Updated LanguageSwitch with three options: "English", "हिन्दी", "Hindi (English letters)" with clean wrapping.
- Implemented two-line buttons for Hindi showing Devanagari as main label and small English word underneath.
- Updated test suite for all 3 files and fallback; verified all 34 vitest tests and production build pass cleanly.
- Refactored renderProgress to derive localized step headers and descriptions without repeating titles in English.
- Replaced hardcoded example placeholders with t('common.example') prefix and removed forced uppercase styling on placeholders.
- Localized all sub-labels, staff role notes, backup buttons, storage permissions, and tooltips.
- Verified all 33 vitest tests and production applet build pass cleanly.
- Built complete i18n system (src/i18n) supporting English as default and Hinglish as second language.
- Replaced all visible screen text across Login, Setup (all 8 steps), Home, and dialogs with t("key").
- Implemented two-line button helper {main, sub} with clean vertical centering in English mode.
- Preserved identical grey placeholder hints across languages and enforced fixed English codes in database/audit log.
- Added comprehensive unit tests in i18n.test.ts; all 33 tests and production build pass cleanly.
- Phase 2: Expanded Dexie database (v2) with medicines, batches, append-only stockMovements, suppliers, purchases, and purchaseLines.
- Stored all stock in smallest units (loose tablets) with whole-paise money and batch expiry valid through last day of entered month.
- Created src/logic/stock.ts for batch stock, expiry alerts, FEFO picking (no expired/zero stock, split sales), unique short codes, and duplicate detection.
- Fixed DEV reset to close DB connections before deleting; added fake-indexeddb and 13 unit tests in stock.test.ts (27 total tests passing).
- Phase 1: Built reusable ConfirmDialog, EmptyState, StatusChip, and FeedbackOverlay matching designs 46a, 46b, 46c, 46d.
- Phase 1: Built reusable ConfirmDialog, EmptyState, StatusChip, and FeedbackOverlay matching designs 46a, 46b, 46c, 46d.
- Generated offline audio feedback (positive chime and error buzz) via Web Audio API with screen flash and toasts.
- Built OwnerPinGate (32a) and ApprovalDialog (18c) verifying Ijazat PIN with 3-try lock and audit logging.
- Connected all 8 Home action tiles to EmptyState placeholders with Ghar buttons, and added DEV Ijazat PIN test button.
- Implemented roles.ts helpers (isOwner, canSeeProfit, canSeePurchasePrice); vitest (14 tests) and build pass cleanly.
- Phase 1: Added shared format.ts helper for auto-capitalization (preserving case and women's apostrophe), uppercase GST/licences, and digit-only phone.
- Updated Setup placeholders with owner's shop details (Maa Durga Medical Hall, Sunil Kumar, Samastipur) and noted in Known problems.
- Created shared usePinKeyboard hook and connected physical keyboard across setup Owner PIN, repeat PIN, staff PIN, Ijazat PIN, and Login.
- Enforced 4-digit PIN default across database, screens, validation, DECISIONS.md, and RULES.md; updated tests rejecting 3, 5, 6 digits.
- Verified vitest suite and compilation build passing cleanly with zero errors.
- Phase 1: Removed sample data from Setup forms (fields start empty with grey placeholders) and added Sample data rule to AGENTS.md.
- Loaded Login name buttons from users table, verified real PINs via attemptUserLogin, and completely removed TEMP PIN 1234.
- Implemented 5 wrong tries 2-minute lockout with live countdown, persistent DB settings, and audit logging.
- Updated Home screen with real DB values (Rs. 0, 0 bills, 0 alerts) and honest red "Backup lo" status.
- Added unit tests in foundation.test.ts for login lockout and countdown; all 9 tests passing.
- Phase 1: Separated Approval PIN ("Ijazat PIN") from Owner login PIN in approvals.ts, RULES.md, and DECISIONS.md.
- Implemented setApprovalPin and verifyApprovalPin with salted hash, 3-try 5-minute database lock, and audit logging.
- Expanded setup wizard to 8 steps with 8-dot progress bar, adding Step 7 for Ijazat PIN and Step 8 for approval rules.
- Added "DEV: Reset test data" on Login with "Pakka sab hatana hai?" confirmation modal and return to setup.
- Added unit tests in foundation.test.ts for Approval PIN rejection, verification, locking, and timer expiry.
- Phase 1: Completed setup wizard steps 5, 6, and 7 (src/screens/Setup.tsx) matching designs 05, 06, and 07b.
- Step 5 offers empty medicine list with locked file import; Step 6 requests browser storage persistence.
- Step 7 configures local Owner PIN vs offline blocking per action category and saves to settings.
- Finalized setup flow writing "setup complete" audit entry and verified all React SVG attributes.
- Phase 1: Built first 4 setup screens (src/screens/Setup.tsx) matching designs 01, 02, 03, 04.
- Implemented shop details, locked Cloud mode, owner PIN hashing, and staff setup with working Wapas and Skip.
- Enforced append-only auditLog via Dexie hooks and logged shop, owner, and staff creation events.
- Added ?reset=1 dev reset helper and foundation unit tests (src/logic/foundation.test.ts) passing cleanly.
- Preserved Home.tsx and verified production build cleanly.
- Phase 1: Built Dexie database in src/db (tables: shop, users, settings, auditLog).
- Implemented PIN safety with Web Crypto PBKDF2 and random salt in src/logic/pin.ts.
- Created append-only audit logger in src/db/audit.ts with no edit or delete capability.
- Added whole-paise money helper in src/logic/money.ts and approval types in src/logic/approvals.ts.
- Preserved existing screens and verified production build cleanly.
- Phase 1: Built Login screen (src/screens/Login.tsx) with 3 states matching 08a, 08b, and 08c.
- Added choose name, number pad with wrong PIN handling ("PIN galat hai"), and auto-lock screen.
- Integrated temporary demo PIN 1234 and 5-minute inactivity auto-lock in App.tsx.
- Home.tsx and /designs files preserved untouched; verified production build cleanly.
- Environment check verified: Confirmed purely offline browser app with no backend, no AI/Gemini, and no CDN links.
- Confirmed src/screens/Home.tsx and /designs files remain 100% original and unchanged.
- Verified zero new packages added and production build passes cleanly.
- GitHub import migration: Configured Vite dev server for host 0.0.0.0 and port 3000.
- Synchronized metadata.json and index.html tags for the AI Studio runtime.
- Verified test suite and production build compilation successfully.
- Phase 1: Built Home screen matching designs/phase1/09_Home_Local.html.
- Added design tokens in src/theme (colors, Noto Sans font, dimensions).
- Added @fontsource/noto-sans locally for complete offline operation.
- Enabled working light/dark switch with saved user preference.
- Build verified with Vite and previewed in browser.
- Phase 0: Vite + React + TypeScript scaffold created.
- Installed tailwindcss, dexie, vite-plugin-pwa, vitest.
- Created empty folders: src/screens, src/components, src/db, src/logic, src/theme, designs.
- Configured home page to display Hospivo in big letters.
- Initialized Git repository, configured .gitignore, and verified build.

- Mobile/tablet (<1024px) layouts for 15 Owner screens: tile/KPI grids, sticky bottom bars, medicine list and import cards, scrollable shelf/sticker stacks, scrollable modals. Desktop classes unchanged (only lg:-prefixed or max-lg:-prefixed additions).
- Reports tables scroll sideways inside their card on phones. Build and 222 tests pass.

- Supplier returns logic: src/logic/supplierReturns.ts (create return, update status, summary, debit note in whole paise).
- Stock goes down by an append-only 'supplier_return' movement; audit log + sync queue added. No DB changes.
- Added 5 tests to src/logic/suppliers.test.ts. 231 tests and build pass.

- Backup checksum & integrity validation: added `meta.checksum` to backup manifests, `createBackupJson()`, `computeSha256Sync()`, and `verifyBackupPayload(jsonString)` in `src/logic/backup.ts`.
- Preserved all existing folder picker, File System Access API, and download fallback functions and signatures.
- Added unit tests for valid, tampered, and corrupted JSON backups in `src/logic/backupAndSettings.test.ts` (233 tests and production build pass).

- Udhaar statements: added getCustomerLedgerStatement() and formatUdhaarReminderMessage() in src/logic/udhaar.ts (whole paise, no DB changes).
- Statement = Udhaar bills, payments and udhaar_adjust returns, sorted by date, with opening/closing balance for a date range.
- Reminder text is Hindi + English; empty when nothing is due. Added 5 tests in src/logic/udhaar.test.ts (238 tests pass).

- Cloud sign-in: sendEmailOtp(email, { createUser }) now defaults to shouldCreateUser:false, so no OTP is sent for an email with no account.
- Missing account returns { success:false, errorCode:'account_not_found' }; the screen shows a red message (new text in en/hi/hinglish) and stays on the email step.
- New-shop setup (and Owner Cloud Sync) still creates the account. No Supabase table check was added (owner chose the simple way). 239 tests and build pass.

- Bill discount: calculateBillTotals() now takes an optional flat whole-bill discount in paise (wholeBillDiscountPaise); BillDraft and finalizeBill pass it through.
- Limit check counts item + bill discount together; above the owner limit (default 5%) the Approval PIN is needed.
- Dawai Becho cart panel: new row above Subtotal/Total (Rs or %, Apply/Remove). Above limit it opens the Approval dialog before applying. Held bills keep the flat amount.
- 6 new tests in billing.test.ts; 245 tests pass. Note: DawaiBecho.tsx is over 600 lines and still needs a split.

- Cloud sign-in error handling: wrapped sendEmailOtp() in try/catch in src/logic/cloudAuth.ts to catch missing-account rejections and network/rate-limit errors cleanly.
- Updated src/screens/CloudAccountAuth.tsx and i18n (en/hi/hinglish) to show clear red error messages and keep the user on screen without raw exceptions.
- Added unit tests in src/logic/cloudAuth.test.ts for auth rejections, network failures, and rate limits; tests and build pass with 0 errors.

- Cloud sign-in error discrimination: explicitly distinguished network/fetch/timeout errors from missing accounts (when shouldCreateUser is false) in src/logic/cloudAuth.ts.
- Updated CloudAccountAuth.tsx and i18n catalogs (en/hi/hinglish) to present localized connection and account-not-found messages without raw exceptions.
- Added tests verifying network timeout/fetch failures vs auth rejections in src/logic/cloudAuth.test.ts (248 tests pass, build 0 errors).

- Supabase URL & Vercel rewrites: added env sanitization (stripping accidental quotes/brackets) and direct https:// URL resolution in src/lib/supabase.ts.
- Fixed typo in Supabase project URL inside vercel.json (added missing 'z') and ensured clean rewrite proxying to /api/sb while preserving SPA routing.
- Added tests for sanitizeEnvValue and resolveSupabaseUrl in src/logic/cloudAuth.test.ts; all 249 tests and build pass with 0 errors.

- Phone-first Android (Capacitor) UI redesign: added viewport-fit=cover, overflow-x-clip, safe-area spacing, reusable MobileTopBar and localized 5-tab MobileBottomNav, and hid desktop-only controls (FullscreenButton, keyboard shortcut bars, hover-only overlays) on phones.
- Billing / POS (DawaiBecho): added quick-browse medicine cards, bottom cart summary bar, and a slide-up Cart/Customer/Discount bottom sheet (with full bill-discount + Approval PIN support) so forms are never covered.
- Inventory, FEFO, Udhaar, Reports, Sync & Backup: replaced wide multi-column tables on phones with stacked summary cards (OwnerReports, InvoiceDetailModal, ReferralReport), upgraded action modals to bottom sheets, and added safe humanized i18n fallback.
- Preserved all Dexie schemas, whole-paise calculations, FEFO logic, supplier returns, Udhaar ledgers, backup checksums, and sync logic; build and all 249 tests pass with 0 errors.

- Android (Capacitor) native back-button & phone-first numeric inputs: added LIFO back-handler manager (`src/logic/androidBack.ts`, 3 unit tests) listening to Capacitor `App` `'backButton'` events and wired native Android `OnBackPressedCallback` in `MainActivity.java`.
- Connected back-button handling across all modals, bottom sheets, dialogs, wizards, and nested views (`Home`, `DawaiBecho`, `FastBill`, `StockDekho`, `StockJodo`, `Expiry`, `Udhaar`, `DinBand`, `Suppliers`, `OwnerSettings`, `OwnerStaff`, `OwnerBackup`, `OwnerCloudSync`, `Login`, `Setup`, `ApprovalDialog`, `OwnerPinGate`, `ConfirmDialog`) so back closes overlays/sub-views before minimizing the app.
- Replaced on-screen numpads on phones with standard native `inputMode="numeric"` inputs across `Login`, `Setup`, `OwnerPinGate`, `ApprovalDialog`, `PaymentScreen`, `Step1CashCount`, `PaisaMilaModal`, `OwnerSettings`, `OwnerStaff`, and `OwnerBackup`, and hid remaining desktop-only `Enter ↵` shortcut hints on phones.
- Preserved all Dexie tables, whole-paise math, FEFO, Udhaar, backup checksums, and Supabase sync logic untouched; production build and all 252 unit tests pass with 0 errors.

- Cloud Sync truthful auth & connection state fix: added `isAuthenticated` to `getCurrentCloudSession()`, cleared `cloud_shop_uuid` & sync status on `signOutOwner()`, and guarded `runSyncCycle()`, `backfillLocalDataToCloud()`, and `getHomeSyncState()` so sync only runs and reports active when cloud mode is enabled AND an authenticated/connected session exists.
- Updated `OwnerCloudSync.tsx`, `Home.tsx`, and `OwnerSettings.tsx` (plus en/hi/hinglish i18n keys) so toggling Cloud Enabled while signed out shows an amber "Sign In Required" / "Not Connected" notice and highlights "Sign In / Connect" instead of showing a fake green "Success" toast or "Auto Sync Active" badge.
- Added unit tests in `src/logic/cloudSync.test.ts` verifying `not_connected` status, blocked sync/backfill without auth, and clean sign-out transition; production build and all tests pass with 0 errors.

- Android OTP & Supabase direct connection fix: updated `resolveSupabaseUrl()` in `src/lib/supabase.ts` so native Capacitor Android/iOS builds connect directly to the HTTPS Supabase URL instead of `/api/sb`, configured `server.androidScheme: 'https'` in `capacitor.config.ts`, hardened `sendEmailOtp` unregistered-account checks in `src/logic/cloudAuth.ts`, and synced fresh `dist/` into Android via `npx cap sync android`.
- Setup Wizard mobile overflow & Android storage UI fix (`src/screens/Setup.tsx` + en/hi/hinglish i18n): added safe-area top/bottom padding, `items-start sm:items-center`, `w-full min-w-0 overflow-x-clip` across all 8 steps; wrapped Step 4 labels, info callouts, and staff cards so "1 Added" and delete icons stay inside bounds; fixed PIN placeholder tracking so "PIN (4 digits)" and "Confirm PIN" never clip; stacked Step 6 storage cards vertically and showed native "Android App Storage Ready" inside Capacitor Android.
- Verified with `npm run build`, `npm run test` (253 tests), and `npx cap sync android` with 0 errors.

- Brand icon refresh (Web, PWA & Android Capacitor): created unified HOSPIVO pharmacy icon (white "H" pillars fused with mint `#8EF9A7` medical cross on emerald `#1B8F4A` gradient) in `public/icon-master.svg` and `public/icon-1024.png`.
- Replaced default lightning-bolt favicon and added full web/PWA icon set (`favicon.svg`, `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`) wired in `index.html` and `vite.config.ts`.
- Generated matching Android launcher icons (`ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png`) across `mipmap-mdpi` through `mipmap-xxxhdpi` plus emerald adaptive icon XMLs, and verified with `npm run build`, `npm run test`, and `npx cap sync android`.

- Redesigned mobile Step 2 PIN unlock & lock screens (`src/screens/Login.tsx`, `src/components/LanguageSwitch.tsx`): stacked the top brand bar and full-width language switcher with safe-area padding so zero overflow or stray pills occur on narrow phones.
- Replaced redundant PIN dot rows with a single tap-to-type 4-slot numeric PIN input (`inputMode="numeric"`), polished rounded emerald key/lock badge, balanced 52px Clear/Unlock touch buttons, and wrapped footer security + Local mode badge.
- Verified with `npm run build`, `npm run test` (253 tests), and `npx cap sync android` with 0 errors.

- Redesigned mobile Step 1 "Who is using?" account selection screen (`src/screens/Login.tsx`, `src/components/LanguageSwitch.tsx`): top-aligned content cleanly under the HOSPIVO header & single-line language switcher with no excess whitespace above the fold.
- Upgraded staff/owner profile cards (`min-h-[72px]`, `min-w-0 flex-1`) with inline `OWNER` badge beside the name, full readable wrapped role subtitles, and crisp circular chevron tap affordances, plus clean separated footer security note & Local mode pill.
- Verified with `npm run build`, `npm run test` (253 tests), and `npx cap sync android` with 0 errors.

- Mobile layout, overlap & bottom-bar truncation polish across Android UI:
  - Checkout (`PaymentScreen.tsx`): unified Cash Received state (initialized cleanly to exact bill total with single mobile input), split Change to Return vs Cash Short into non-overlapping exclusive state cards, and fixed bottom Confirm & Save Bill button height/padding so zero text clips.
  - Audit Log (`AuditLogScreen.tsx`): fixed flexbox vertical row-shrinking overlap by using block list flow and clean stacked mobile cards with `shrink-0` timestamps/icons and `min-w-0` wrapping.
  - Staff (`OwnerStaff.tsx`, `Setup.tsx`): fixed left-edge clipping on "PIN Badlo / Reset PIN" via full-width 3-column mobile action grid (`>= 52px` targets), wrapped staff summary text, and added case-insensitive duplicate staff name + double-submit guards.
  - Shelf, Bottom Nav & Settings (`OwnerShelfMap.tsx`, `MobileBottomNav.tsx`, `OwnerDashboard.tsx`, `OwnerSettings.tsx` + en/hi/hinglish i18n): prevented shelf code (`S-09-COLD`) multi-line breaks, replaced truncated bottom-nav labels with concise 1-word localized labels (`Home/Sell/Stock/Credit/Owner`) with safe-area padding, and fixed right-edge clipping on Settings rows ("Dukaan ki jaankari", Language, Cloud Sync).

- Cloud sync deduplication, workspace isolation & silent Realtime (`cloudSync.ts`, `cloudAuth.ts`, `db/index.ts`, `billing.ts`, `purchase.ts`, `App.tsx`, live screens):
  - Prevented duplicate staff accounts (e.g. duplicate "Suraj Dev") via ID + normalized name/role deduplication in `applyRemoteEvent` & `deduplicateLocalUsers()`, and separated local-only Dexie data from signed-in cloud shop workspaces via `switchToCloudWorkspace` / `switchToLocalWorkspace`.
  - Fixed cross-device sync for bills, bill returns, purchases, stock movements, customers, and Udhaar (enqueued sale/return/purchase stock movements, collision-free per-device sync event IDs, idempotent replay respecting immutable bill/movement hooks).
  - Added silent Supabase Realtime (`postgres_changes`) subscriptions (`startRealtimeSync` / `ensureCloudSyncActive`) + silent live screen refreshes with zero background popups/toasts.

- Offline-first queueing & silent reconnect auto-flush (`cloudSync.ts`, `App.tsx`, `OwnerSettings.tsx`, `udhaar.ts`, `expiry.ts`, `db/index.ts`):
  - Wrapped `enqueueSyncItem` in `Dexie.ignoreTransaction()` so bills, FEFO stock movements, purchases, returns, and Udhaar payments written inside Dexie transactions always queue reliably into `db.syncOutbox` without blocking or failing offline.
  - Added `'shop'` and `'settings'` sync support (`OwnerSettings.tsx` shop details, discount limit, auto-lock, approval rules, PIN length/Approval PIN) plus `ensureCustomerForUdhaarBill` and `expiry.ts` supplier-return sync.
  - Added `initNetworkSyncListeners()` handling browser `online`/`offline`, `navigator.connection`, `visibilitychange`, Capacitor `Network`/`App` runtime listeners, and 30s pending-outbox silent flush with zero popup toasts.

- Strict Local vs. Cloud separation & decision prompts (`cloudAuth.ts`, `cloudSync.ts`, `CloudAccountAuth.tsx`, `OwnerCloudSync.tsx`, `Setup.tsx`, `App.tsx` + en/hi/hinglish i18n):
  - Added scenario classifier (`classifyCloudSignInScenario`) and decision handler (`resolveCloudSignInChoice`) for all 5 auth/sync flows: Local→Empty Cloud prompt (Yes pushes local, No stashes local & opens clean Cloud Setup), direct existing Cloud seamless sync, Local→Existing Cloud prompt (Yes merges with strict deduplication, No isolates local & loads cloud only), and clean Cloud Setup when auth succeeds with no store records.
  - Updated `signOutOwner()` to stop Realtime/cloud sync cleanly, switch `db.shop` to `mode: 'local'` with `cloud_enabled: false`, and keep existing device data usable locally with no further cloud pushes/pulls until signed back in.

- First-launch Welcome Intro & Shop Selector (`WelcomeIntro.tsx`, `ShopSelector.tsx`, `logic/onboarding.ts`, `App.tsx`, `Login.tsx` + en/hi/hinglish i18n):
  - 3-slide intro (offline billing, FEFO/expiry/Udhaar, cloud sync + staff PINs) with dots, Skip, Next/Get Started (56px), safe-area padding; shown once before first setup, flag `intro_seen` saved in `db.settings`.
  - After setup (or cloud sign-in) the app shows "Select Your Shop" (name, details, Local/Cloud badge, staff count) then "Who is using?"; "+ Add Another Shop" shows Coming Soon (no schema change); "Switch Shop" chip added on Who-is-using header. Returning users still boot straight to Who-is-using.
  - Added `onboarding.test.ts`.

- Strict account/shop isolation on "Keep Separate" & real Multi-Shop management (`cloudSync.ts`, `cloudAuth.ts`, `multiShop.ts`, `ShopSelector.tsx`, `Setup.tsx`, `App.tsx` + en/hi/hinglish i18n):
  - Expanded workspace snapshots and clearing to cover ALL 21 Dexie tables (including `auditLog` and `syncOutbox`) plus all shop-scoped `db.settings` (`approval_pin`, `discount_limit`, `approval_rules`, `auto_lock_minutes`, `pinLength`, `shop_sync_id`, backup history, lock states) so signing out and signing into a new account with "Keep separate" leaves zero previous-account bleed-over.
  - Updated `provisionCloudShop(..., { forceCreateNew: true })` and `listCloudShopsForUser()` so new accounts and additional branches always create/list separate shops without overwriting or mixing with previous shops.
  - Enabled functional multi-shop creation and switching in `ShopSelector.tsx` (`+ Add Another Shop`, per-shop isolated workspace switching & cloud hydration, zero popups) and added `multiShop.test.ts`.

- Android Backup Export, Add Stock Navigation & Live Camera Barcode Scanner (`backup.ts`, `StockJodo.tsx`, `CameraBarcodeModal.tsx`, `FastBill.tsx`, `DawaiBecho.tsx`, `StockList.tsx`, `OwnerMedicineForm.tsx`, `LinkBarcodeModal.tsx`, `AndroidManifest.xml`):
  - Added `Capacitor.isNativePlatform()` native backup path in `saveBackup()` using `@capacitor/filesystem` + `@capacitor/share` so Android APK backup export saves & opens the native share sheet instead of failing as cancelled, and added unit test coverage in `backupAndSettings.test.ts`.
  - Fixed `StockJodo.tsx` Home/Back navigation by removing `selectedSupplierId !== null` from `hasUnsavedProgress` (auto-selected supplier no longer blocks Step 1) and adding `useBackHandler` for the discard dialog.
  - Built `CameraBarcodeModal.tsx` (`html5-qrcode` live camera + manual barcode fallback + `CAMERA` permission in `AndroidManifest.xml`) and wired every barcode scanner button across Fast Bill, Dawai Becho, Find Medicine (`StockList`), Add Stock (`StockJodo`), `OwnerMedicineForm`, and `LinkBarcodeModal`.

- Udhaar Customer Detail Crash, Send Reminder & Interactive Home Summary Cards (`Udhaar.tsx`, `CustomerDetailScreen.tsx`, `YaadDilaoModal.tsx`, `udhaar.ts`, `Home.tsx`, `DawaiBecho.tsx`, `StockDekho.tsx`, `StockList.tsx`):
  - Fixed the blank/white screen crash when tapping a customer in `Udhaar.tsx` by moving `useIsCompactViewport()` before the early `if (selectedCustomer)` return (Rules-of-Hooks fix) and hardening `CustomerDetailScreen` ledger/reminder sorting against missing fields.
  - Enabled "Send Reminder" whenever a customer has a pending balance or phone number, routed through `sendOrShareUdhaarReminder()` (WhatsApp, Capacitor Share, SMS, or clipboard fallback).
  - Made Home summary cards (Today's Sales, Today's Bills, 30-Day Expiry, Low Stock) interactive `<button>` controls opening Owner Reports, Old Bills (`DawaiBecho`), 30-Day Expiry, and Low-Stock-filtered `StockDekho` directly.

- Cloud Isolation, Multi-Device List & Multi-Shop Management (`cloudAuth.ts`, `cloudSync.ts`, `OwnerCloudSync.tsx`, `OwnerMenu.tsx`, `ShopSelector.tsx`, `Home.tsx`, `App.tsx`, `multiShop.test.ts`):
  - Updated `signOutOwner()` in `cloudAuth.ts` to restore `local_mode_snapshot` via `switchToLocalWorkspace()` when present so signing out of cloud returns cleanly to the device's offline Local Mode data without leaking cloud records.
  - Added `registerCurrentDeviceInCloud()` and `listConnectedDevices()` in `cloudSync.ts` (persisting device heartbeats as `entity_type = 'device'` in `hospivo_sync_events` + local cache) and rendered the Connected Devices list in `OwnerCloudSync.tsx`.
  - Connected Multi-Shop Management (`ShopSelector` with Back + "+ Add Another Shop" + shop switching) directly inside `OwnerMenu.tsx`, `Home.tsx`, and `App.tsx`.

- Android WebView Layout Overlap & Header Polish (`Home.tsx`, `OldBillsReturnScreen.tsx`, `Step2CashMatch.tsx`, `OwnerStaff.tsx`, `OwnerMedicineForm.tsx`):
  - Redesigned `Home.tsx` compact mobile header into a clean two-tier bar so the Cloud Enabled / Sync status badge never crowds or truncates against shop name and controls.
  - Fixed button text overlaps in `OldBillsReturnScreen.tsx` (Reprint / Process Return), `Step2CashMatch.tsx` (Match Cash cards), `OwnerStaff.tsx` (bottom status ribbon), and `OwnerMedicineForm.tsx` (360px responsive grid stacking, sticky header, and flexible heights).

- Eliminated Phantom "My Medical Store" on Fresh Setup (`cloudSync.ts`, `cloudAuth.ts`, `multiShop.ts`, `Setup.tsx`, `multiShop.test.ts`):
  - Removed hardcoded `'My Medical Store'` fallbacks in `runSyncCycle()`, `resolveCloudSignInChoice()`, and `registerCurrentShopInDirectory()` so pre-setup syncs or incomplete states never auto-provision a phantom shop.
  - Updated `Setup.tsx` to persist `cloudShopUuid` back onto `db.shop` after `provisionCloudShop()` so `ShopSelector` lists strictly the single shop entered by the user.

- Multi-Device Cloud Registration & Sync Now Refresh (`cloudSync.ts`, `cloudAuth.ts`, `OwnerCloudSync.tsx`, `Setup.tsx`, `multiShop.test.ts`):
  - Hooked `registerCurrentDeviceInCloud()` into `runSyncCycle()`, `hydrateExistingCloudShopOnly()`, and `mergeLocalWithCloudShop()`, added `userId`/`storeId`/`lastActiveAt` payload fields and append-only `.insert()` fallback if `.upsert()` is blocked by RLS, used platform-aware default device names (`Android Mobile` vs `Counter PC 1 (Billing Desk)`), and refreshed Connected Devices on **Sync Now**.

- Add Stock Mobile Modals/Navigation & Numeric Keypad + Limit Warning (`StockJodo.tsx`, `NumericLimitWarning.tsx`, `format.ts`, `format.test.ts` + phone/numeric inputs):
  - Extracted `sharedModals` in `StockJodo.tsx` and mounted them in BOTH compact mobile and desktop views so **Back/Home** (including when an invoice number is typed without a supplier) and **+ New Supplier** work cleanly without trapping the user.
  - Added `numericInputProps()`, `getNumericLimitStatus()`, and `<NumericLimitWarning>` (`common.limit_exceeded_warning` in en/hi/hinglish) so mobile keyboards open the number pad automatically and typing an 11th digit on 10-digit phone fields shows a red warning above the field without blocking editing.









