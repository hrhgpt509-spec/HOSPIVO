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
Phase 1: Home screen (Local) built and verified

## Known problems
(none yet)

## Log (newest first)
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
