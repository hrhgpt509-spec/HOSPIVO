# Hospivo - progress (update after EVERY task, 3-5 lines)

Legend: [ ] not started  [~] in progress  [x] done and checked by owner

- [x] Phase 0: project folder, memory files, Git, scaffold, theme from Stitch
- [~] Phase 1: database, login, PIN, roles, setup screens, Home (Local), approval check, shared dialogs
- [ ] Phase 2: medicine list, Stock Jodo, Stock Dekho, suppliers
- [ ] Phase 3: Dawai Becho, payment, bill done, old bills, returns
- [ ] Phase 4: Expiry, Udhaar, customers, referral report
- [ ] Phase 5: Din Band, Owner area, reports, audit log, settings, backup/restore
- [ ] Phase 6: Fast Bill
- [ ] Phase 7: Shelf map, stickers
- [ ] Phase 8: Cloud-enabled mode (sync, owner web app, remote approvals)

## Current task
Phase 1: Auto-capitalize helper, owner setup hints, shared physical keyboard PIN support, and 4-digit PIN standardization

## Known problems
- Setup hints use the owner's own shop details; change to neutral examples before other shops use the app.
- DEV ONLY: ?reset=1 query parameter in App.tsx clears the database and must be removed before release.
- DEV ONLY: "DEV: Reset test data" button on Login screen clears database and must be removed before release.

## Log (newest first)
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
