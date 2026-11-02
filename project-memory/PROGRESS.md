# Hospivo - progress (update after EVERY task, 3-5 lines)

Legend: [ ] not started  [~] in progress  [x] done and checked by owner

- [x] Phase 0: project folder, memory files, Git, scaffold, theme from Stitch
- [x] Phase 1: database, login, PIN, roles, setup screens, Home (Local), approval check, shared dialogs
- [~] Phase 2: medicine list, Stock Jodo, Stock Dekho, suppliers
- [ ] Phase 3: Dawai Becho, payment, bill done, old bills, returns
- [ ] Phase 4: Expiry, Udhaar, customers, referral report
- [ ] Phase 5: Din Band, Owner area, reports, audit log, settings, backup/restore
- [ ] Phase 6: Fast Bill
- [ ] Phase 7: Shelf map, stickers
- [ ] Phase 8: Cloud-enabled mode (sync, owner web app, remote approvals)

## Current task
Prompt U2: Full screen after login - COMPLETE

## Known problems
- App icons (192/512) needed before the app can be installed.
- Login decorative panel shows sample bill/terminal ID; remove or make real before other shops use the app.
- Setup hints use the owner's own shop details; change to neutral examples before other shops use the app.
- DEV ONLY: ?reset=1 query parameter in App.tsx clears the database and must be removed before release.
- DEV ONLY: "DEV: Reset test data" button on Login screen clears database and must be removed before release.
- DEV ONLY: "DEV: Test Ijazat PIN" test button on Home screen must be removed before release.
- DEV ONLY: Language switch on Login screen becomes a Settings option in Phase 5.

## Log (newest first)
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
