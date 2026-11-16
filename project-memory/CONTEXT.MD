# CONTEXT.md — Hospivo handoff (as of about 12 Nov 2026)

This document holds everything the previous orchestrator (Claude) knows about the Hospivo project.
It is meant to let a new system continue without asking the owner to repeat himself.

## 0. How to read this

**Confidence markers**
- `[CONFIRMED]` the owner tested it or looked at it and said it worked.
- `[REPORTED]` an AI coding agent (Google AI Studio or Antigravity) reported it, or tests pass, but the owner has not checked it by eye.
- `[UNVERIFIED]` ran or was assumed, but no result was seen.
- `[TODO]` not started.
- `[OPEN]` a business decision nobody has made yet.

**Limits of this document**
- The orchestrator never had live access to the owner's project. Everything comes from what the owner pasted (agent logs, screenshots, build output, a ZIP of an OLDER GitHub state) plus one private test copy built from that ZIP.
- The live repo's `project-memory/*.md` files (PROGRESS, RULES, DECISIONS, DESIGN_MAP, PROJECT_BRIEF, PROMPTS_QUEUE) and `AGENTS.md` are the canonical, up-to-date versions. Prefer them over this file when they disagree, and update them after every task.
- The last build output the owner pasted was BEFORE the OFFLINE prompt ran. Nothing after that has been seen.

---

## 1. Project overview and goals

### 1.1 What Hospivo is
Hospivo is a billing and stock app for an Indian medical store (dawai ki dukaan). It runs in the browser on the shop computer or phone as an installable PWA and must work without internet after the first visit. It is for a shop owner and counter staff aged 40 to 50 who know only WhatsApp and Facebook. The design principles are:
- big buttons
- one job per screen
- Hindi words written in English letters (Hinglish), with a small English word underneath
- everything within two taps of Home

**Languages (now three)**
- English is the default for new shops.
- Hinglish (Hindi in English letters) keeps the original PDF style.
- Hindi in Devanagari script is also supported.

### 1.2 The owner and how to work with him
- The owner is not a programmer. He is building this first for his own shop and later for public release.
- Shop used for testing: "Maa Durga Medical Hall", owner "Sunil Kumar", Samastipur, Bihar. These details are used as grey hint text in the setup form. Before other shops use the app, change the hints to neutral examples. This is tracked as a known problem.
- Working agreement:
  - Explain in simple words.
  - Ask before big decisions, and ask at most one question at a time.
  - Never invent a business rule.
  - Give him copy-paste prompts for AI coding agents.
  - He replies with "yes/no" per test and pastes the agent's final answer.
  - He said clearly: "don't make changes by yourself". Produce prompts or reports, and do not modify his project unless he asks.
  - He is on the free tiers of Antigravity and AI Studio. Wasting quota is the main practical problem (see section 4).

### 1.3 Sources of truth
1. `Hospivo_Minimal_Change_Version_final.pdf` (in the repo `docs/`): 13 pages of App and UI Description plus Amendment A to M (Local-only versus Cloud-enabled mode, approvals, honest status, backup, acceptance checks).
2. The Stitch project "Hospivo Pharmacy Design System": 98 screens named like `09_Home_Local`, numbered 01 to 46, in Google Stitch.
   - Stitch project id: `15749135413560221082`.
   - The Stitch MCP endpoint is `https://stitch.googleapis.com/mcp`. It is called with a JSON-RPC POST and the header `X-Goog-Api-Key`.
   - Its tools are `list_projects`, `get_project`, `list_screens`, `get_screen` and `download_file`.
   - The API key is in the owner's local `.env` as `STITCH_API_KEY` (git-ignored). Never put it in code, chat or Git.
3. All 98 design HTML files are saved locally in `designs/phase1` to `designs/phase8`.
   - 96 of 98 PNG screenshots are saved. `09_Home_Local.png` and `20b_Fast_OutOfStock.png` are missing.
   - The designs contain sample data (names, bill numbers, amounts). It must never be copied into the app as real data.
   - Phase 1 designs (Home, Login, Setup) carry simple Tailwind configs. Phase 2 and later designs carry Material-style tokens (see 2.6).

### 1.4 People and modes
- **Owner:** sees everything, including profit and purchase prices.
- **Cashier / counter staff:** selling screens only. No profit, no purchase price, cannot edit MRP, cannot delete or edit a finished bill. Staff can add stock (Stock Jodo).
- **Runner:** only scans medicines with a wireless scanner and has no screen. Used in Fast Bill.
- **Local-only mode (built first, the only one built so far):** all data stays on the shop device. No cloud, no owner web app, no remote approval. The UI must say "Local mode" and must never imply cloud features.
- **Cloud-enabled mode (Phase 8, last):** the shop app stays local-first and queues changes offline.
  - When online it syncs, and an owner web app gives reports, approval requests and registered devices.
  - Remote dashboards must show the last-sync time and never present stale data as live.
  - An approval request made offline has not reached the owner until it uploads.
  - One approval works for one request only.

### 1.5 Pages and features (from the PDF)
- Setup wizard (shop details, mode choice, owner PIN, staff, medicine list, backup, approval rules).
- Login (name buttons plus PIN pad, auto-lock).
- Home (8 big buttons, today line, alerts, honest status bar).
- Dawai Becho (normal billing).
- Fast Bill (rush mode: runner and cashier queue, Confirm Card, tile wall, short code).
- Payment (Cash, UPI, Udhaar, split) and bill finishing, returns (Wapsi), old bills.
- Stock Jodo (add stock from a supplier with an invoice photo).
- Stock Dekho (stock by batch, low stock list).
- Expiry (30/60/90/expired tabs, supplier returns).
- Udhaar and customers (reminders on WhatsApp, regular medicine reminders, Referral Sales Report with no commission).
- Medicine list (Owner area), sticker and barcode printing, suppliers.
- Din Band (daily closing: cash count, match, photo, WhatsApp report).
- Owner area: dashboard, reports, staff, audit log, shelf map, settings, backup and restore.
- Alerts and reminders.

**Not in version 1:**
- doctor commission
- any AI feature
- more than one runner scanning at once
- live remote view in Local-only mode
- guaranteed instant push notifications
- the app must not claim that every high-risk action can be approved offline

### 1.6 Business rules (baseline `project-memory/RULES.md`, quoted)
```text
# Hospivo - business rules (from the owner's PDF). Do not change without asking.

## Roles and login
- Owner sees everything incl. profit and purchase price. Cashier: selling screens only; NO profit, NO purchase price,
  cannot edit MRP, cannot edit/delete a finished bill. Runner: scanner only.
- Login: tap a name, type PIN on a big number pad. Wrong PIN -> red "PIN galat hai", pad clears.
- Owner PIN is 4-6 digits. Store PINs only as a salted hash, never as plain text.
- Auto-lock after inactivity (default 5 min, owner can change).

## Protected actions and approvals
- Protected: delete/correct a finished bill, change a price, discount above limit, stock correction, cash mismatch at Din Band.
- For EACH action category the owner sets an offline rule: (a) local Owner PIN, (b) remote approval (Cloud mode only), (c) blocked while offline.
- One approval = one request = one action on one record. It can NEVER be reused for another bill/action.
- Staff presses "Owner ko poocho". Request has: exact action, record, requester, reason, shop/device, time.
- Offline remote request shows "Waiting for internet - not sent to owner". Action does NOT run until a valid approval is verified.
- Local-only mode: never show or imply remote approval.
- Every decision goes in the audit log. Audit log can never be edited or deleted.
- Din Band cash mismatch: staff may save the count, but screen must clearly say closing is NOT complete until authorised.

## Billing (Dawai Becho)
- Search by name, shelf QR, company, short code (C1), shelf no (S-04), or barcode scan.
- Batch picked automatically: earliest expiry first. Expired batches can NEVER be sold.
- Quantity in strips or loose tablets (switch button).
- Discount per item or whole bill, up to owner's limit; more needs authorisation.
- Schedule H / H1 medicine: ask patient name, doctor name, "Prescription dekhi?" BEFORE adding. Feeds the H/H1 register.
- Out of stock: show in-stock medicines with same composition + their shelf.
- Buttons: Rukao (hold bill), Wapas (remove last item), Naya Bill, Purane Bill, Wapsi (sales return).
- Sales return puts items back in the SAME batch; refund as cash or reduce udhaar.
- Payment: Cash (type amount, show change), UPI (mark paid), Udhaar (pick/add customer), Aadha-Aadha (split).
  After: Print (A4 invoice or small receipt), WhatsApp bhejo, Done. Finished bill reduces stock automatically.

## Fast Bill (rush mode)
- Runner scans medicines with wireless scanner; same scan again = quantity +1. Special cards: NEXT BILL, UNDO, CANCEL.
- Cashier sees Pending list (Bill 1, 2, 3: count, wait time, status scanning/ready). Too long waiting = orange.
- Confirm Card: one medicine at a time (photo, name, strength, batch, expiry, price, shelf, qty prefilled, "2 / 7").
  Keys: Enter=next, Left=back, S=skip, L=loose, Delete=remove, B=change batch.
- Nothing is added to a bill without the cashier pressing a key. Unknown scan -> red "Ye dawai nahi mili" and listed for fixing.
- Also: tile wall (top 100 medicines, owner can pin/remove) and short code entry with Undo.

## Stock
- Stock is tracked batch by batch (batch no, expiry month/year, qty, shelf).
- Stock Jodo = 4 steps: Supplier+invoice no/date -> Invoice photo (REQUIRED, shrink it) -> Medicine lines
  (name, batch, expiry, packs, free packs, purchase rate, MRP) -> Check and "Pakka Karo". NOTHING saved until last step.
- Owner can open old purchase, see invoice photo, tick "Verified". Purchase return to supplier possible.
- Stock Dekho filters: Kam stock, Khatam, Sab. Low-stock list grouped by supplier, shareable on WhatsApp.
- Stock corrections (damaged/lost/count) need authorisation and are written in a log.

## Expiry
- Tabs: 30 din (red), 60 (orange), 90 (yellow), Expire ho gaya (black). Row: medicine, batch, expiry, qty, shelf.
- "Supplier ko wapas" starts a return record; status: pending, sent, credit received, rejected.
- Owner sees "Pichle saal expiry se nuksan: Rs. X" + month-by-month loss.

## Udhaar and customers
- Udhaar list: biggest first, days pending. Paisa Mila = record payment. Yaad Dilao = open WhatsApp with ready message
  (only when amount is more than 7 days old). Owner can set credit limit per customer.
- Regular medicine reminder (BP/sugar): remember how many days a pack lasts, show "Kal dawai khatam, ready rakhein?" each morning.
- Referral Sales Report: sales per doctor only. NO commission payments.

## Din Band (4 steps)
Cash ginti -> Milan (expected vs counted; mismatch in red) -> Photo of counter -> Report (one page, send to owner on WhatsApp).

## Backup
- Daily backup file. Red banner on Home if last backup is older than 3 days ("Backup lo").
- NEVER label a backup "successful" until it is verified. Restore needs a clear confirmation.
- Cloud mode: also encrypted cloud backup. Local-only: tell owner a device-only backup is lost if the device is lost.

## Home status must be truthful
- Local-only: "Local mode" + last backup. Never show cloud/sync/approvals.
- Cloud + connected: connection, last successful sync, pending/failed sync count, backup status, Approvals count.
- Cloud + offline: "Offline - changes saved on this device" + pending count.
- Never show a bare "Offline OK".

## UI rules
- Buttons >= 56px tall, button text 20-24px bold, normal text 18px (never below 16px), bill total >= 36px always visible,
  list rows >= 60px. Big number pad for PIN/quantity.
- Every button = icon + Hindi word in English letters + small English word. Home button on every page. No hidden menus.
- Colours: green = go/save/sell, red = stop/danger/expired/mismatch, orange = careful, yellow = early warning (90 days),
  blue = info, grey = not available. Light and dark mode switch always at the top.
- Short messages only ("PIN galat hai", "Ye dawai nahi mili", "Stock khatam"). No technical words or error codes.
- Dangerous action asks "Pakka hatana hai?" with big Haan / Nahi. Important actions can be undone with Wapas.
- Success = short beep + green flash; error = different buzz + red flash + clear message. New bill rows briefly light up.
- Empty pages: friendly message + one big button.

## Engineering rules (developer's, to protect money and stock)
- Store money as whole paise (integers), never decimals/floats.
- A finished bill is never changed in place. Corrections = new records linked to the old one.
- Stock changes are an append-only list of movements (sale, purchase, return, correction). Stock quantity comes from these.
- Cloud sync (later) must never duplicate a bill or stock movement, and never silently overwrite sales or stock movements.
```

### 1.7 Billing and GST logic: honest status
- **Billing (Dawai Becho), payment, returns and Fast Bill are NOT built yet.** There is no bill table, no invoice numbering, and no GST calculation code.
- What exists for GST:
  - Medicines carry `gstPercent` and `hsn`. The form offers 0, 5, 12 and 18 percent with NO default.
  - The shop table stores the GST number and drug licence numbers.
  - GST fields are formatted (uppercase, no spaces).
  - Suppliers carry a GST number.
- The PDF lists these outputs (not built): A4 invoice or small receipt, GST summary report, purchase register, and the Schedule H and H1 register.
- `[OPEN]` questions that must be settled with the owner and his CA or a pharmacist BEFORE the billing phase:
  - Exact GST invoice format and Schedule H/H1 register format.
  - Whether MRP and purchase rates include or exclude GST. The GST rate for each medicine class must be confirmed. The orchestrator believed rates were revised in 2025 but did NOT verify this, so do not trust any remembered slab.
  - Bill number series and financial-year reset.
  - Round-off rule.
  - Default discount limit, and the default offline rule per protected action.
  - Supplier dues: the PDF shows "amount still to be paid" on the suppliers list but defines no way to record payments to suppliers.

### 1.8 Inventory rules (as built in `src/logic/stock.ts` and `purchase.ts`)
- **Smallest unit.** All stock is stored in loose units (tablets). Packs are computed as `units / unitsPerPack`. This lets one number serve "sell a strip" and "sell loose tablets".
- **Expiry** is entered as month and year (MM/YYYY) and stored as the LAST day of that month. A batch is valid through that day.
- **Stock movements are append-only** (Dexie hooks throw on update or delete). Types: `purchase`, `sale`, `customer_return`, `supplier_return`, `correction`, `expiry_writeoff`. Quantities are signed integers.
  - Stock of a batch is the sum of its movements.
  - A correction is a NEW movement, never an edit.
- **Batch picking** (`pickBatchesForSale`): earliest expiry first. Expired batches and empty batches are never picked. A sale is split across batches if needed. It returns a "not enough stock" result and never negative stock.
- **Expiry buckets:** 30, 60, 90, expired, none. Colours: red, orange, yellow, black.
- **Purchase saving** (`savePurchase`) runs in ONE database transaction and either saves everything or nothing.
  - It creates a purchase and its lines (verified = false, with the shrunk invoice photo).
  - A batch is merged when medicine, batch number, expiry, MRP and purchase rate are all identical. Otherwise it is a NEW batch.
  - It writes one `purchase` movement per line of `(packs + free packs) * unitsPerPack` units.
  - Free packs add stock at zero cost.
  - It writes an audit entry `purchase_saved` with no rates or amounts.
  - The Pakka Karo button is disabled while saving, so a double tap cannot save twice.
- **Duplicate invoice warning** (`findDuplicatePurchase(supplierId, invoiceNo)`): a warning only, never a silent block.
- **Invoice photo** is REQUIRED. It is shrunk with `scaledSize(w, h, 1600)` and JPEG quality 0.7.
- **Purchase rates privacy.** Staff TYPE the purchase rate from the invoice but can never SEE it again. For staff, rates, line amounts and totals are not rendered at all (not CSS-hidden) and not logged. Only the owner sees them (`canSeePurchasePrice(user)`).
- **Medicines:** required fields are name, MRP (stored as paise per pack) and units per pack (whole number of at least 1). The short code is auto-generated (`shortCodeFor`) and unique. The barcode is unique if given. A duplicate warning (`findDuplicateMedicines`) runs before saving. Medicines cannot be deleted in this version. Editing the default MRP is allowed and audited, with no Ijazat PIN, because every batch keeps its own MRP. Staff cannot add medicines (the owner does, in the Owner area).
- **Product types:** the "Form (Type)" list has built-in types (Tablet, Syrup, Capsule, Injection, Ointment / Cream, Drops) plus owner-added custom types (see 3.1).

### 1.9 Decisions made beyond or against the PDF (all owner-approved)
1. **Approval PIN ("Ijazat PIN").**
   - It is a separate PIN, NOT the Owner login PIN. It approves risky actions (delete or correct bill, price change, discount above limit, stock correction, cash mismatch) in BOTH modes. The PDF originally said Owner PIN.
   - It must differ from the Owner PIN and every staff PIN. Staff PINs set later must differ from it too.
   - Even a logged-in owner must type it for a risky action.
   - 3 wrong tries lock it for 5 minutes. The lock is stored in the database and survives a refresh.
   - Every wrong try, lock and successful use goes to the audit log (never the PIN).
   - Opening the Owner area from Home still uses the Owner login PIN.
   - Local-only mode shows no remote approval anywhere. The design's locked "Door se approval - Cloud mode mein hi" button and the blue note stay as designed.
   - Setup has 8 steps. The new step 7 creates the Ijazat PIN. Step 8 holds the rules list. Defaults per the design: "Stock sudhaar" = blocked offline, the other four = Ijazat PIN.
2. **Login and Owner gate wait:** 5 wrong PIN tries for the same name lock that name for 2 minutes. The lock is stored in the database with audit entries. A correct PIN resets the count. The same rule applies to the Owner PIN gate.
3. **PIN length is 4 digits.** A 6-digit option is an Owner setting to be built in Phase 5. Changing the length later means every user sets a new PIN. All PIN screens work with the physical keyboard (number row, numpad, Backspace) and the on-screen pad.
4. **Auto-capitalise while typing**, with one shared formatter:
   - Kind `name`: first letter of each word is a capital, other letters untouched, and a letter after an apostrophe is not capitalised.
   - Kind `code` (GST, licence, batch, invoice, barcode, HSN, short code): UPPERCASE with spaces removed, keeping `-` and `/`.
   - Kind `phone`: digits only.
   - Kind `free` (search, notes, strength): as typed.
   - Devanagari text is never changed. The cursor must not jump when editing in the middle of a word. Searches stay case-insensitive.
5. **Languages.** English is the default, Hinglish is the second language and Hindi (Devanagari) the third. All visible text goes through `t("key")` with keys in `en.ts`, `hinglish.ts`, `hi.ts` and `types.ts`.
   - In English, a small second line that repeats the main line is hidden.
   - Numbers stay 0 to 9. Names and numbers are not translated.
   - Stored data (audit log, records) uses fixed English codes, never translated sentences.
   - The Hindi text was written by the AI and the owner (who reads Hindi) must review it. This is `[UNVERIFIED]`.
6. **Full screen:** after every successful login the app goes full screen (default ON, `fullscreenOnLogin` setting). A small `FullscreenButton` sits next to the light/dark toggle on every top bar. It is hidden when the browser does not support it (iPhone Safari). Esc or F11 leaves full screen, and the next login enters again. Browsers only allow full screen after a tap or key, so it can never happen on page load.
7. **Dark mode** works through plain `@theme` token variables overridden under `html.dark` (see 2.6). `[CONFIRMED]`
8. **Sample data rule:** forms start EMPTY. Stitch sample data is never inserted or shown as real. Grey hints use `t("common.example")` plus an example. No fallback shop name anywhere.
9. **Hints use the owner's own shop details** (temporary).
10. **Cashiers add stock** (PDF) but never see purchase prices (the Option B decision above).
11. **Low stock list grouping** (assumption for the next prompt, owner has not objected): group each medicine under the supplier of its MOST RECENT purchase, and put never-purchased medicines under "Supplier pata nahi".
12. **Stock Jodo draft:** nothing is saved until Pakka Karo. A draft that survives a refresh or power cut was recommended (prompt "S3") but NOT built.
13. **Local-first, one computer first.** Several devices share data only in the Cloud phase.
14. **Wording:** "Medicine" / "Dawai" appears everywhere. The owner also sells non-medicine items (serum and similar). Renaming to "Product / Item" is a text-only change in the three language files. `[OPEN]` the owner has not decided.
15. **Forgot Owner PIN:** no recovery rule exists. `[OPEN]` Decide when building backup and restore.

---

## 2. Tech stack and structure

### 2.1 Stack (versions are the ones seen in logs)
- **React + TypeScript + Vite.** Vite v8.3.5 was seen in the build output. The React version was not seen. The project was scaffolded with `create-vite --template react-ts`.
- **Tailwind CSS v4** with the `@tailwindcss/vite` plugin. Tokens are defined in CSS with `@theme`. Dark mode is class-based: `@custom-variant dark (&:where(.dark, .dark *))`, and the `dark` class is on `html`.
- **Dexie** (IndexedDB) for all local data. Tests use `fake-indexeddb`.
- **vite-plugin-pwa v2.0.0** (`generateSW`, workbox).
- **Vitest v5.0.5.** The last run the owner pasted: 11 test files, 90 tests, all passing.
- **Fonts via `@fontsource`:** `noto-sans` (weights 400 to 800), `noto-sans-devanagari`, and the Material Symbols icon font (`@fontsource/material-symbols-outlined`). The only way to show an icon is `<Icon name="..."/>`, which renders the font ligature.
- **Package files:** `bun.lock` is committed. On the owner's PC `npm install` creates an untracked `package-lock.json`, which must NOT be committed. Lint config `.oxlintrc.json` exists. `metadata.json` and `.env.example` were added by AI Studio.
- **No backend, no server, no CDN links, no AI/Gemini features.**

### 2.2 Environments and sync (important)
| Place | What it is |
|---|---|
| GitHub | Private repo `hospivo`, default branch `master`. It is the bridge between tools. |
| Owner's PC | `D:\HOSPIVO`, Windows, PowerShell. Antigravity works here. There is NO `grep`; use the agent's search tool or `Select-String`. Node, npm and Git are installed. |
| Google AI Studio (Build mode) | Own cloud copy (`/app/applet`, Linux, `grep` exists). It can import from and push to GitHub. |
| Claude's sandbox | A private test copy built from an older ZIP, plus a headless Chromium (`playwright-core` with `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Used only to reproduce and verify; nothing was delivered from it into the project. |

**Rule:** ONE tool at a time. Push from the tool you finish in, pull or re-import in the other before editing. Never edit in both at once.

### 2.3 Folder structure (best knowledge, reconstructed from the ZIP, logs and test output)
```text
D:\HOSPIVO
  AGENTS.md                      rules read by every agent chat
  README.md  bun.lock  package.json  index.html  metadata.json  .env.example  .gitignore  .oxlintrc.json
  tsconfig.json  tsconfig.app.json  tsconfig.node.json  vite.config.ts
  docs/                          the PDF
  designs/phase1 ... phase8/     Stitch HTML (+PNG) per screen (see DESIGN_MAP)
  project-memory/                PROGRESS.md RULES.md DECISIONS.md DESIGN_MAP.md PROJECT_BRIEF.md PROMPTS_QUEUE.md
  public/
  tools/                         pull-designs.mjs  fix-missing.mjs  find-hardcoded-text.mjs
  src/
    main.tsx  App.tsx  index.css  App.css  assets/
    screens/      Home  Login  Setup  StockJodo  OwnerMenu  OwnerMedicineList  OwnerMedicineForm
    components/   ApprovalDialog  ConfirmDialog  EmptyState  FeedbackOverlay  FullscreenButton(+test)
                  Icon  LanguageSwitch  OwnerPinGate  StatusChip
    db/           index.ts (Dexie schema, append-only hooks)   audit.ts (addAudit only)
    logic/        approvals  auth  feedback  format(+test)  foundation.test  fullscreen(+test)  image
                  medicineForm(+test)  medicineSearch(+test)  money  pin  productTypes(+test)
                  purchase(+test)  roles  stock(+test)  usePinKeyboard  useShop(+test)
    i18n/         en.ts  hinglish.ts  hi.ts  types.ts  index.ts  i18n.test.ts
    theme/        index.ts  theme.css  tokens.ts  (+ design tokens file/blocks)
```
- `[UNVERIFIED]` exact file list. Large files: `StockJodo.tsx` (about 2,200 lines), `Setup.tsx` (about 1,800) and `OwnerMedicineForm.tsx` (about 1,150). They make every AI edit expensive because agents re-read them in chunks. Splitting them (one file per step, one shared keypad) is recommended but not done. The keypad component was copied into about 5 files.

### 2.4 Database (Dexie) tables
Exact column names and index definitions were not all seen. Treat this as the intended schema and check `src/db/index.ts`.
- `shop`: name, ownerName, address, phone, gstNo, drug licence 1 and 2, `mode` (`local` | `cloud`).
- `users`: id, name, role (`owner` | `cashier` | `runner`), pinHash, pinSalt, active.
- `settings`: key/value. Known keys: discount limit, auto-lock minutes (default 5), approval rule per action category, `pinLength` (4), `language`, `fullscreenOnLogin`, the approval PIN hash and its lock state, the storage-persist answer. Login lock and attempt counters are also stored in the DB (table names not seen).
- `auditLog` (append-only).
- `medicines`: name, strength, form (type), salt, company, gstPercent, hsn, mrpPaise (per pack), unitsPerPack, shortCode (unique), barcode (unique), shelf, scheduleType (`none` | `H` | `H1`), minStockUnits, packPhoto, active.
- `batches`: medicineId, batchNo, expiry (last day of the month), purchaseRatePaise (per pack), mrpPaise, shelf.
- `stockMovements` (append-only): batchId, medicineId, type, qtyUnits (signed), reference, who, at.
- `suppliers`: name, phone, gstNo, address.
- `purchases` and `purchaseLines`: supplierId, invoiceNo, date, invoicePhoto, verified, lines (medicine, batchNo, expiry, packs, freePacks, purchaseRatePaise, mrpPaise).
- `productTypes`: id, name, active, createdAt (custom types only; built-ins live in code). `[REPORTED]`

Both append-only tables are enforced by Dexie hooks that throw on update and delete. Any test that cleans data must clear the tables directly, not delete through the hooks.

### 2.5 Key modules (signatures as known)
- `logic/pin.ts`: `hashPin`, `verifyPin` (PBKDF2 with a random salt per user), PIN length validation (4 digits).
- `logic/approvals.ts`:
  - action categories: `delete_or_correct_bill`, `price_change`, `discount_above_limit`, `stock_correction`, `cash_mismatch`
  - rule types: `local_pin`, `remote_approval`, `blocked_offline`
  - `DEFAULT_APPROVAL_RULES`, `setApprovalPin`, `verifyApprovalPin` (returns ok / wrong / locked with minutes left)
- `logic/auth.ts`: login wait and lock logic.
- `logic/roles.ts`: `isOwner(user)`, `canSeeProfit(user)`, `canSeePurchasePrice(user)`.
- `logic/money.ts`: `rupeesToPaise`, `paiseToRupees`, `formatRupees` (Indian digit grouping).
- `logic/stock.ts`: `batchStock`, `medicineStock`, `isExpired`, `pickBatchesForSale`, `expiryBucket`, `lowStock`, `shortCodeFor`, `findDuplicateMedicines`.
- `logic/purchase.ts`: `savePurchase(draft, user)`, `findDuplicatePurchase`.
- `logic/image.ts`: `scaledSize`.
- `logic/format.ts`: `capitalizeWords`, `toUpperAlphanumeric`, `filterDigits`, `formatField(kind, value)`, `textFieldProps(kind, value, setValue)`.
- `logic/useShop.ts`: hook that reads the shop table (the only allowed source of shop info).
- `logic/feedback.ts`: `triggerFeedback(type, title?, subtitle?)` (Web Audio beeps with no sound files, plus green or red flash).
- `logic/fullscreen.ts`: `enterFullscreen()`.
- `logic/usePinKeyboard.ts`: physical keyboard support for PIN pads.
- Components: `ConfirmDialog` ("Pakka hatana hai?"), `EmptyState` (the default hint must stay empty), `OwnerPinGate`, `ApprovalDialog` (takes action category, record description, `onApproved`; never remembers a previous approval), `StatusChip`, `FeedbackOverlay`, `LanguageSwitch` (English, हिन्दी, Hindi (English letters)), `Icon`, `FullscreenButton`.
- `i18n`: `t("section.key", params)` and `tButton("section.key")` (returns `{main, sub}`). Missing keys fall back to English. A test checks that all three files have identical keys.
- Home status chips are honest: "Local mode", "No backup taken yet" with a red "Backup lo" state. "Backup: Aaj" may appear only when a verified backup exists today. No backup feature exists yet.

### 2.6 Theme, tokens and dark mode
- **Light tokens** copied from the Stitch `tailwind.config` into `@theme` with identical names, so classes like `bg-surface-container-lowest`, `p-space-md`, `gap-gutter` and `text-headline-md` work. There are 47 colour tokens.
  - Spacing: `margin 2rem`, `margin-mobile 1rem`, `gutter 1.5rem`, `gutter-compact 1rem`, `space-xs 0.5rem`, `space-sm 0.75rem`, `space-md 1rem`, `space-lg 1.5rem`, `space-xl 2.5rem`.
  - Font sizes with line-height and weight: `headline-lg 28/36/700`, `headline-md 24/32/700`, `title-hinglish 20/26/700`, `body-lg 20/28/500`, `body-md 18/26/400`, `button-text 22/28/700`, `label-sub-english 16/20/500`, `numpad-number 32/38/700`, `display-total 48/56/800`, `display-total-mobile 36/44/800`.
  - Radius tokens match Tailwind defaults. The tokens must be plain `@theme` variables, not `@theme inline`, so a dark override works.
- **Dark palette** (applied; the owner confirmed it works) overrides these variables under `html.dark`:
```text
--color-surface:#0e1512; --color-background:#0e1512; --color-surface-dim:#0e1512; --color-surface-bright:#343b37;
--color-surface-container-lowest:#090f0d; --color-surface-container-low:#161d1a; --color-surface-container:#1a211e;
--color-surface-container-high:#252c29; --color-surface-container-highest:#303733; --color-surface-variant:#3e4a3f;
--color-on-surface:#dde5e0; --color-on-background:#dde5e0; --color-on-surface-variant:#bdcabc;
--color-outline:#889487; --color-outline-variant:#3e4a3f;
--color-primary:#72dc8e; --color-on-primary:#00391a; --color-primary-container:#005226; --color-on-primary-container:#8ef9a7;
--color-secondary:#a5c8ff; --color-tertiary:#ffb786; --color-error:#ffb4ab;
--color-inverse-surface:#dde5e0; --color-inverse-on-surface:#2b322f; --color-surface-tint:#72dc8e; --color-canvas:#0f1713;
```
  Contrast was computed at 5.8:1 or better for every text/background pair. Lesson: screens that used `bg-[#F4F6F5] dark:bg-canvas` stayed light because `--color-canvas` was the same colour in both modes. Never hard-code a light colour on a screen.
- **Icons:** `<Icon name="..." filled? className? />` renders the icon font ligature. Writing an icon name as plain text shows the word on screen when the font is missing.
- **Typography:** Noto Sans for Latin text and Noto Sans Devanagari for Hindi.

### 2.7 Tools and scripts
- `tools/pull-designs.mjs`: downloads every Stitch screen (HTML and PNG) into `designs/phaseN/` using the owner's `.env` key. It skips files that exist. It prints "OK" in some cases where nothing was saved, so trust file counts, not the word OK.
- `tools/fix-missing.mjs`: retried the 3 screens that failed (fallback through `get_screen` and a direct download link).
- `tools/find-hardcoded-text.mjs`: the hard-coded-text checker.
  - It needs `@babel/parser` (`npm install --no-save @babel/parser`).
  - It parses `.ts/.tsx` under `src` (skips `i18n` and tests) and reports visible text typed in the code: JSX text, attributes such as `placeholder`/`title`/`alt`/`aria-label`, and object properties such as `label`/`title`/`message`/`text`.
  - It allows `Hospivo`, `UPI`, `GST`, `PIN`, `WhatsApp`, `HSN`, `A4`, `OK` and the three language names.
  - It does NOT see strings passed to functions such as `triggerFeedback('success','...')` or `setSupplierError('...')`, so it must be paired with a Hinglish word scan (see 4.6).
  - Exit code 0 means "0 found".

### 2.8 Findings from auditing the older ZIP (verify whether already fixed in the live repo)
- Stock Jodo step 2: the button "Choose from gallery" called `handleSimulatedPhoto`, which draws a FAKE invoice image ("TAX INVOICE", "Items & Batches Verified", "captured from original physical slip") and saves it as the required invoice photo. `[UNVERIFIED]` whether the prompt that removes it (SJ-TEXT) was run.
- Stock Jodo seeded four fake suppliers (Sharma Agencies, Gupta Pharma, Om Distributors, Jain Medico) inside a React effect, so StrictMode inserted each twice. Removed in the AI Studio fix `[REPORTED]`. That fix also added an unwanted "delete sample suppliers by name on startup" routine (later asked to be removed `[UNVERIFIED]`).
- `EmptyState` showed the false line "Ready catalog of 1,20,000+ medicines" as its default hint. Fixed by the language sweep `[REPORTED]`.
- Typed fallback shop name "Shree Medical Store" in many files. Replaced by `useShop` or real data `[REPORTED]`.
- Typed Hinglish error sentences in `logic/approvals.ts` and `logic/auth.ts` are shown to the user in setup step 7 even in English mode (`LOGIC-MSG` pending).
- Naya Dawai form: "Units per pack" is pre-filled with "10" (risk of wrong stock), the badge "GST Compliant Form" (a legal claim), the label "Operator" for the owner, the invented "Build: v4.12.8", and the raw text `common.saved_badge`. All are pending in F1.
- Login right panel shows design sample data ("Bill No: #INV-88219", "Terminal ID: HOS-402", "Counter #01"); footers show "Desktop POS Terminal #1". REALDATA targets these.
- Stock Jodo auto-selected the first supplier, so leaving the page always asked for confirmation (F1).
- Build output showed about 100 font files (Greek, Cyrillic and Vietnamese included, 4 weights of the icon font) and a service worker that precached only 5 files (877 KiB), with no fonts. Offline, icons can show as words. The OFFLINE prompt targets this.
- The DEV-only "DEV: Reset test data" button, the `?reset=1` URL parameter, and the Home "DEV: Test Approval PIN" button must be removed before release.

---

## 3. Completed features versus roadmap

### 3.1 Status
**What the owner last pasted:** `git pull` said "Already up to date", `npm run build` passed, and `npm run test` passed with 11 files and 90 tests (includes `productTypes.test.ts` and `useShop.test.ts`). He then ran OFFLINE in Antigravity and pushed and pulled. The result of OFFLINE has not been seen, and his AI Studio copy may be behind or ahead.

| Area | Status |
|---|---|
| Phase 0: project scaffold, Git, memory files | [CONFIRMED] |
| All 98 Stitch designs saved locally (PNG 96 of 98) | [CONFIRMED] |
| Home screen (real shop name, real user, zero counters, honest backup status) | [CONFIRMED] |
| Login with real users, PIN verify, 5-minute auto-lock, wrong-PIN wait (5 tries, 2 min) | [CONFIRMED] |
| Setup wizard, 8 steps (shop, mode, owner PIN, staff, medicine list "start empty", backup permission, Ijazat PIN, rules) | [CONFIRMED] |
| Approval PIN logic and dialog (3 tries, 5 min lock persisted), Owner PIN gate, shared dialogs and feedback | [CONFIRMED] by the owner's "yes" on the test list; the lock itself is untested in a real flow because no screen needs it yet |
| Roles helpers (`canSeePurchasePrice` and others) | [REPORTED] |
| i18n in 3 languages with English default | [CONFIRMED] for English/Hinglish switching; Hindi quality [UNVERIFIED] |
| Full screen after login plus `FullscreenButton` | [CONFIRMED] ("worked well") |
| Dark mode | [CONFIRMED] |
| Theme tokens from Stitch, layout fixes | [CONFIRMED] by the owner's screenshots |
| Stock data foundation (medicines, batches, movements, suppliers, purchases) plus stock logic and tests | [REPORTED] |
| Owner menu, medicine list (read-only search), Naya Dawai add/edit form | [CONFIRMED] (8 yes) |
| Stock Jodo steps 1 to 4 and saved screen; `savePurchase` with tests | [REPORTED]. The end-to-end owner and staff test (checklist 4.6-D) has NOT been done |
| Fake-invoice removal and Stock Jodo language fixes (SJ-TEXT) | [UNVERIFIED] |
| Auto-capitalise everywhere (FIELDS) | [REPORTED] (helper plus tests); coverage of every field [UNVERIFIED] |
| Product types, "+ Add new type" (TYPES) | [UNVERIFIED] (test file exists) |
| Real shop data everywhere (REALDATA) | [UNVERIFIED] (`useShop.test.ts` exists) |
| Offline fonts and icons (OFFLINE) | [UNVERIFIED] |
| PWA installable (192/512 icons) | [TODO] icons missing |

### 3.2 Known problems and temporary items (also in `PROGRESS.md`)
- Remove before release: DEV reset button, `?reset=1`, "DEV: Test Approval PIN", the language switch on Login (it will become a Settings option), and the setup hints that use the owner's own shop details.
- Pending fixes: the items in 2.8; Hindi wording review by the owner; `StockJodo.tsx` and `Setup.tsx` are too large; the keypad is duplicated; custom product types cannot yet be renamed or hidden.
- `package-lock.json` must not be committed (the project uses `bun.lock`).
- 6 npm audit vulnerabilities exist. Do NOT run `npm audit fix --force`.

### 3.3 Roadmap (Stitch screen prefixes from `DESIGN_MAP.md`)
```text
Phase 1  DONE:    01 02 03 04 06 07b 08a-c 09 18c 32a 46a-d
Phase 2  PARTLY:  05 05b 38a-c (medicine list; import 38c/05b NOT built), 23a-e (Stock Jodo, built),
                  24a-b 25 (Stock Dekho, NEXT), 27a-b (suppliers list/detail, NOT built)
Phase 3:  11 12 12b 13 14 15 16 16b 17      billing, Schedule H dialog, out-of-stock substitutes, old bills/returns, payment
Phase 4:  26a-c (expiry + supplier returns), 28a-c 29a-b (udhaar, customers), 30 (referral sales report)
Phase 5:  31a-f (Din Band), 32b, 33 (dashboard), 34 (reports), 35a-b (staff), 36 (audit log), 40 40b (settings, approval rules), 41a-c (backup/restore)
Phase 6:  19 19b 20a-d 21 22                 Fast Bill
Phase 7:  37a-c (shelf map), 39a-b (stickers)
Phase 8 (Cloud): 02b 07 10a-d 18 18b 42a-b 43a-d 44a-b 45a-b
```
Also still to build:
- stock correction (uses the Ijazat PIN dialog)
- medicine import from Excel or CSV
- supplier dues and payments (rule `[OPEN]`)
- the PIN-length setting (4 or 6) and the language and fullscreen settings
- Stock Jodo draft persistence ("S3")
- splitting the big files
- PWA icons
- Stitch screens 28b and 28c share a title, so check which is "Paisa Mila"

---

## 4. Exact prompting and verification rules

### 4.1 Collaboration rules (apply to the orchestrator)
1. Simple words, short answers. One question at most, only for real decisions.
2. Check the PDF and the rules before writing a prompt. If a design contradicts a rule, flag it (this happened with the cashier purchase-price conflict and the Local-only "remote approval" option).
3. Never claim something is done without evidence. Say what is confirmed, reported or unknown. Do not say a file was updated before updating it.
4. Never ask for or print secrets (Stitch key, PINs).
5. Give each prompt a name, a test list, and the exact lines to send back (agent's final answer plus yes/no per test).
6. Do not change the owner's project directly. Produce prompts, or small tools and reports that he chooses to use.

### 4.2 `AGENTS.md` (baseline, then the blocks added over time)
Baseline (quoted):
```text
# Hospivo - Agent rules (read at the start of EVERY chat)

1. First read project-memory/PROGRESS.md and project-memory/RULES.md.
   Read PROJECT_BRIEF.md, DECISIONS.md, DESIGN_MAP.md only when the task needs them.
2. One task per chat. Do ONLY what the prompt asks. Do not refactor or touch files that are not listed.
3. Designs: use local files in /designs first. Use the Stitch MCP ONLY when the prompt names the screens,
   and save what you pull into /designs/<phase>/ so it never has to be pulled again.
4. The owner is NOT a programmer. Final answer = short, simple words: what you did, and how to check it.
5. Never invent a business rule. If something is unclear, ask the owner one short question.
6. Never put passwords, PINs or API keys in code or in Git.
7. Before finishing: run the build (and tests if they exist), then add 3-5 lines to PROGRESS.md.
8. Keep replies short. No long plans unless asked.
```
Blocks added (wording as issued; the live file may differ slightly):
```text
## Design fidelity rule (very important)
- The owner's Stitch screens are the exact design. Do NOT redesign, "improve", simplify or restyle.
- Start from the saved HTML in /designs/<phase>/. Keep the same layout, spacing, colours, fonts, icon style,
  sizes and Hindi/English text. Only change it to make it work (data, buttons, logic).
- Use the colours and fonts found inside the Stitch code. Do not invent new ones.
- Phone screens (390x844) and desktop screens are separate designs. Match each one.
- If the design conflicts with a rule in RULES.md, do NOT choose silently. Tell the owner in one line and ask.
- If a design detail is missing, ask the owner. Do not guess.

## Save the owner's credits
- Do NOT open a browser, take screenshots, or run browser tests. The owner checks the screen by eye.
- Do NOT run lint or tests unless the prompt asks. Run only "npm run build".
- Do NOT re-read files you do not need. Read only the files named in the prompt.
- Build 2-4 closely related screens per prompt when told to, never the whole app.
- If a step fails twice, STOP and explain in simple words. Do not keep trying.

## Sample data
- Stitch designs contain example data. Never copy it into the app as real data. Forms start empty; examples may only be grey placeholders.
- Never insert sample rows into the database.
- Shop information comes only from useShop(). Never type a shop name, person name, number or date in a screen. If data is missing, show nothing.

## Converting Stitch HTML to React
- Use React names, not HTML names: className, strokeWidth, strokeLinecap, strokeLinejoin, fillRule, clipRule, viewBox.
- The browser console must show no red errors after a screen is built.
- Icons: never write an icon name as visible text. Use <Icon name=... /> (local font). No icon fonts or images from the internet.
- Each Stitch HTML has its own tailwind.config. Before building a screen, copy any missing tokens into src/theme.
  Check the screen at 1920, 1366 and 390 px wide.
- Never hard-code a light colour on a screen. Use the colour tokens so dark mode works. Check every new screen in dark mode.
- Every text field uses textFieldProps(kind, ...) from src/logic/format. Kinds: name, code, phone, free.
- Every screen with a top bar includes <FullscreenButton /> next to the light/dark toggle.

## Words and languages
- Never type visible words directly inside a screen. Every label, message, hint and button text comes from src/i18n
  (en.ts = DEFAULT, hinglish.ts = Hindi in English letters, hi.ts = Hindi script) through t("key").
- Every new text needs all versions at the same time. Stored data (audit log, records) uses fixed English codes, never translated sentences.

## Big files
- Never read a large file in pieces. Use your code search tool to find the lines you need.
  Screens over 600 lines must be split into smaller files before more features are added.
```

### 4.3 The prompt template (used for every prompt)
```text
PROMPT <SHORT-NAME> - <TITLE>

Read AGENTS.md[, project-memory/RULES.md, DECISIONS.md and PROGRESS.md] first. Do NOT use any Stitch tool. [Designs are in /designs.]
Use your code search tool (or Select-String) and small edits; never read big files in pieces.

[Task: build/fix <exact screens or files>, exactly like designs/phaseN/<file>.html  |  Problem: <what is wrong, with exact texts and lines>]
[House rules: tokens/dark mode, Icon, t() in en/hinglish/hi, formatRupees, useShop, textFieldProps, FullscreenButton, never insert sample rows]

1. <numbered, concrete behaviour. Include the exact texts, the exact function names to reuse, the data rules.>
2. ...
N-1. Add tests: <the exact cases>. Run npm run test and the build. Update PROGRESS.md (3-5 lines).

Final answer: max <N> lines, simple words.
```
Style rules that made prompts work:
- One task, and the files to touch, are named. "Do not change anything else." "Do not touch Home/Login unless unreadable."
- "Check first, fix only what is still wrong" prompts for anything the agent may have done already. They end with "list which items were already fine".
- Big jobs are split (A/B, steps 1-2 then 3-4, logic then screens) so a quota cut leaves a usable half. Never press Retry or Restore after a cut. Write a short "FINISH" prompt that lists what the log shows is done and asks to fix only the rest, build first.
- Pass exact strings and key names, existing function names and the exact grep/Select-String commands. Tell the agent to ask for a recovery build error and to stop after two failed attempts.
- "Final answer: max N lines" keeps replies short.
- Prefer designs referenced by exact file path (`designs/phase2/23a_...html`). If the design contains something the rules forbid for a role, the rules win. If a design conflicts with a rule, ask.

### 4.4 Quota and tool hygiene (the main practical constraint)
- Agents burned quota by re-reading 1,800 to 2,200 line files in 100 to 150 line chunks, by opening a browser, by running lint, and by re-running prompts with Retry.
- A new chat for each prompt. Fast mode in Antigravity. If a run goes on for more than 15 to 20 minutes or re-reads the same file, stop it and ask: "Stop. In 5 lines tell me what is done and what is not."
- AI Studio (Linux) and Antigravity (Windows PowerShell) differ. Prompts for Antigravity must not rely on `grep`; use the agent's search or `Select-String`.
- `StrictMode` runs effects twice in dev, so never seed or insert data inside a React effect.

### 4.5 Coding constraints (summary for any new agent)
- Money: whole paise integers and `formatRupees()`. Never typed "Rs.".
- Stock: smallest unit, append-only movements, FEFO, expired never sold, one transaction per purchase. A finished bill is never edited in place.
- Roles: staff never receive purchase rates, profit or totals in the DOM or console.
- PINs: PBKDF2 plus salt, 4 digits, never logged. Approval PIN differs from Owner and staff PINs.
- Text: `t()` and all three language files plus `types.ts`; no Hinglish in English mode; fixed English codes in logic returns and the audit log.
- UI: design tokens only (no hard-coded light colours), `<Icon>`, React attribute names, no CDN links, buttons at least 56 px, inputs through `textFieldProps`, top bar with `FullscreenButton`.
- Never insert sample rows or show Stitch sample data. Hints are grey and use `t("common.example")`.
- Offline: fonts and icons must be in the service worker precache (after OFFLINE). No network calls except an optional WhatsApp link (`https://wa.me/?text=...`).

### 4.6 Verification checklists
**A. After every prompt (the owner does this and replies yes/no for each point)**
1. `npm run build` and `npm run test` pass (in PowerShell, `D:\HOSPIVO`).
2. `npm run dev`, open the localhost link, use "DEV: Reset test data" for a fresh start.
3. Test the feature exactly as written under the prompt.
4. Check English, Hinglish and Hindi, light and dark, and 1920, 1366 and 390 px wide. The console error count must be 0.
5. Compare against the Stitch PNG. About 98 percent alike is acceptable.
6. Then `git add <files>`, `git commit -m "..."`, `git push` (never add `package-lock.json`).
7. Send back: the agent's final answer, yes/no per test, and the red lines of any error.

**B. Free checks to choose the next cleanup prompt (no AI quota)**
```text
npm run build
node tools/find-hardcoded-text.mjs
Select-String -Path src\screens\StockJodo.tsx -Pattern 'handleSimulatedPhoto','TAX INVOICE'
Select-String -Path src\logic\approvals.ts,src\logic\auth.ts -Pattern 'galat','chahiye','daala'
(Select-String -Path src\screens\*.tsx -Pattern 'textFieldProps').Count
Select-String -Path src\i18n\en.ts -Pattern 'INV-88219','HOS-402','Counter #01','Terminal #1','GST Compliant','v4.12.8','Operator','Retail Terminal','1,20,000'
Get-ChildItem src\screens,src\components -Recurse -Include *.ts,*.tsx | Select-String -Pattern "dawai|nahi|jodo|jodi|gayi|dabayein|baayein|taraf|haan |wapas|zaroori|hatayi"
```
Decision table: build fails -> FIELDS-FINISH. "Choose from gallery" draws a fake invoice or the first Select-String prints anything -> SJ-TEXT. The `approvals.ts/auth.ts` scan prints lines -> LOGIC-MSG. `textFieldProps` count is under 10 or typing does not capitalise -> FIELDS-FINISH. The en.ts scan prints sample lines -> REALDATA (and F1 for GST badge, version, Operator). All clean -> F1.
Order if several fail: FIELDS-FINISH, SJ-TEXT, LOGIC-MSG, REALDATA, F1, OFFLINE, Stock Jodo tests, D1.

**C. Offline test (after OFFLINE)**
`npm run build`, then `npm run preview` and open the address. Open Stock Jodo once. Chrome F12 > Application > Service Workers must say "activated". Then Network > Offline > reload. The app must open with real icons and correct Hindi text. Then set the dropdown back to "No throttling". The build output must show far fewer font files than about 100 and a `precache` line of more than 5 files and about 2 MB.

**D. Stock Jodo end-to-end test (NOT yet done; must pass before D1)**
1. As owner, add a medicine with Units Per Pack = 15.
2. Stock Jodo steps 1 to 4: add a supplier, an invoice number and a REAL photo; add two lines for the same medicine with different expiry months and rates, and one line with free packs.
3. The owner's review shows rates, line amounts and a total.
4. Press Pakka Karo and tap it twice quickly: it saves once.
5. Stock rose by (packs + free packs) x 15 loose tablets (the medicine list shows packs).
6. Same supplier and invoice number again: the duplicate warning appears.
7. As counter staff: repeat; the review and saved screen show NO rates, NO amounts, NO total.
8. A past expiry date shows a warning, and a medicine that is not in the list shows the "tell the owner" message.

**E. Git/sync check**
`git status`, `git log --oneline -8`, `git fetch`, `git status -sb`. "Behind" means `git pull`. "Ahead" means `git push`. "Diverged" or a conflict means stop and ask. AI Studio must be re-imported from GitHub before editing there after Antigravity work.

### 4.7 History of prompts (names used in the owner's chat)
`#1` scaffold; `#1b` design download script; `#2` Home; `B` login UI; `C` data foundation (DB, PIN, audit, money, approvals types); `D` setup 1-4; `E` setup 5-7; `E2` Ijazat PIN and 8-step setup; `F` real login and Home; `G` typing rules and 4-digit PINs; `H` Phase 1 finish (dialogs, Owner gate, roles); `I` stock foundation; `T` languages; `T2-A/B` leftover texts; `T3` Hindi Devanagari; `U/U2` full screen; `M1A/M1B` Owner menu, medicine list, Naya Dawai form; `S1/S2/S2-FINISH` Stock Jodo; `SJ-FIX`, `SJ-LAYOUT(-FINISH)` icons, sample data, layout tokens; `DK` dark mode; `LANG3` typed Hinglish text; `FS` full screen button; `FIELDS` formatting (cut off by quota); `TYPES` custom product types; `REALDATA`; `OFFLINE`. Statuses are in 3.1.

---

## 5. Immediate next task

### 5.1 Gate before building (do these first, all free)
1. `git pull`, `npm install`, `npm run build`, `npm run test`. Send the output. OFFLINE has been run but not seen.
2. Run the OFFLINE test (4.6-C).
3. Run the free checks (4.6-B), run the cleanup prompts the table calls for (full texts are in the Appendix), then the Stock Jodo end-to-end test (4.6-D). Do not start D1 until the build passes and 4.6-D is fine, because Stock Jodo is the code that changes stock.

### 5.2 The next feature: Stock Dekho (exact prompt, run in a NEW Antigravity chat, Fast mode)
```text
PROMPT D1 - STOCK DEKHO

Read AGENTS.md, project-memory/RULES.md, DECISIONS.md and PROGRESS.md first. Do NOT use any Stitch tool. Designs are in /designs. Use your code search tool (or Select-String) and small edits; never read big files in pieces.

Task: build these screens exactly like the designs:
- designs/phase2/24a_StockView_List.html
- designs/phase2/24b_StockView_BatchDetail.html
- designs/phase2/25_StockView_LowStockList.html

House rules (all already in AGENTS.md; follow them):
- Use the Tailwind tokens from src/theme (surface-container-*, space-*, gutter, text-headline-*). Never hard-code a light colour: dark mode must work. Check at 1920, 1366 and 390 px wide, in light and dark.
- Icons only through <Icon name="..." />. Never icon names as text.
- ALL text through t() in en.ts, hinglish.ts and hi.ts, including messages passed to functions and alt/aria texts. No Hinglish in English mode. Use the shared helper that hides a repeated second line in English.
- Money through formatRupees(). Shop information only from useShop(). Never type a shop name, person name, number or date. Never insert sample rows into the database.
- Text fields use textFieldProps(kind, ...). The search box is kind "free".
- The top bar includes the FullscreenButton next to the light/dark toggle.

The Stock Dekho button on Home opens it for the Owner AND for counter staff.

1. List (24a): search box ready to type (reuse the medicine search), big rows (at least 60px): name + strength, total stock in packs and loose units (medicineStock + unitsPerPack), shelf. Filters: "Kam stock" (low), "Khatam" (finished), "Sab" (all), using lowStock() and an out-of-stock check from src/logic/stock.ts. Empty state with EmptyState (no hint text).
2. Batch detail (24b): tap a medicine to see every batch with stock: batch number, expiry date (colour by expiryBucket: 30 red, 60 orange, 90 yellow, expired black), quantity in packs and loose units, shelf. "Photo dekho" stays locked with "Jald aa raha hai" (shelf photos come later). Expired batches are clearly marked and can never be sold.
3. Counter staff must NOT see purchase rates, purchase totals or profit anywhere on these screens (not rendered at all). The Owner may see a batch's purchase rate if the design shows it. Use canSeePurchasePrice(user).
4. Low stock list (25): a shopping list grouped by the supplier of each medicine's most recent purchase; medicines never purchased go under "Supplier pata nahi". Show each medicine and the packs left. "WhatsApp par bhejo" opens https://wa.me/?text=... with the list as plain text (supplier name, then medicine and packs), built from t() in the current language. It must not crash with no internet.
5. Do NOT build stock correction in this task.
6. Add tests: the three filters; low stock grouping by last supplier and the "Supplier pata nahi" group; the WhatsApp text builder; a staff user's data for these screens contains no purchase rate. Run npm run test and the build. Update PROGRESS.md (3-5 lines).

Final answer: max 8 lines, simple words.
```
Test it: Stock Dekho shows what you stocked; the three filters work; batches show expiry colours; "Photo dekho" is locked; the WhatsApp button opens a message; counter staff see no rates or totals; English, Hinglish, Hindi, light and dark all fine; the console error count is 0.

### 5.3 After D1 (suggested order)
1. Stock correction (Ijazat PIN dialog, new movement of type `correction`, audit log).
2. Medicine import (38c, 05b) and supplier list/detail (27a, 27b). Ask the owner the supplier-dues rule first.
3. Split `StockJodo.tsx`, `Setup.tsx` and the duplicated keypad (this saves quota for everything after).
4. Phase 3 billing. First settle the `[OPEN]` GST and invoice questions in 1.7.

---

## Appendix A: cleanup prompts (full text, run only if the checks in 4.6-B call for them)
Always run in a new Antigravity chat, one at a time. The same text is in `project-memory/PROMPTS_QUEUE.md`.

### A1. FIELDS-FINISH (build fails or capitalising is missing)
```text
PROMPT FIELDS-FINISH

Read AGENTS.md first. Do NOT use any Stitch tool. Do NOT rewrite files. Do NOT read whole files; use the build error lines and your code search tool.

The previous task (FIELDS: formatField and textFieldProps in src/logic/format.ts, applied to every text field) was cut off by the quota. The tests passed but npm run build FAILED at the end.

1. Run npm run build. Fix ONLY the errors it prints, with small edits at the lines it names. Typical causes: textFieldProps used on a <textarea> or with the wrong kind, props that clash with a value or onChange already on the element, an unused or missing import.
2. List every text box: Select-String -Path src\screens\*.tsx -Pattern "<input|<textarea". Check each one: every text field uses textFieldProps(kind, ...) (kinds: name, code, phone, free). PIN boxes, number boxes and search boxes may stay. Convert any text field that still uses the old way.
3. Make sure these are converted: the new-supplier dialog (name, address, GST, phone), Stock Jodo invoice number and batch number, every Naya Dawai field, the Setup staff name, the new product type name box.
4. npm run test and npm run build must both pass. Update PROGRESS.md (3-5 lines).

Final answer: max 6 lines, simple words. List the fields you converted.
```

### A2. SJ-TEXT (fake invoice and typed text in Stock Jodo)
```text
PROMPT SJ-TEXT - FINISH THE LANGUAGE FIX IN STOCK JODO AND REMOVE THE FAKE INVOICE

Read AGENTS.md first. Do NOT use any Stitch tool.
To save quota: StockJodo.tsx is over 2,000 lines. Do NOT read it in pieces. Find each item with your code search tool, look at only about 10 lines around it, and change it with a small edit.

Most keys already exist in en.ts, hinglish.ts, hi.ts and types.ts. Before adding any key, search the language files for an existing one. Never add a key twice.

PART 1 - Remove the fake invoice (most important)
On step 2 the button "Choose from gallery" may call handleSimulatedPhoto, which draws a made-up invoice picture ("TAX INVOICE ...", "Items & Batches Verified", "captured from original physical slip") and saves it as the invoice photo. This breaks the rule that a real invoice photo is required.
1. Delete handleSimulatedPhoto and every use of it. Nothing in the app may ever generate a fake invoice or any sample picture.
2. "Choose from gallery" opens the normal file chooser (a hidden file input WITHOUT the capture attribute).
3. "Take photo" keeps capture="environment" so a phone opens its camera. Use two hidden inputs (one with capture, one without).
4. The chosen photo is still shrunk with scaledSize (longest side 1600 px, JPEG 0.7).

PART 2 - typed texts (check each first; skip what is already fixed)
Move into the three language files and show with t():
- Messages: 'Supplier ka naam zaroori hai', 'Supplier joda gaya', 'Dawai hatayi gayi', 'Stock jud gaya'.
- Empty list on step 3: 'Abhi tak koi dawai nahi jodi gayi' and "Baayein taraf se dawai chun kar 'Line Jodo' dabayein".
- Shop name: remove every fallback name ('Shree Medical Store', also in text drawn on any canvas). Show only the real shop name.
- Role labels 'Owner' / 'Counter Admin': owner uses t('common.role_owner'); counter staff uses t('common.role_cashier'). In src/logic/purchase.ts the fallback user name 'Counter Admin' becomes the fixed English codes 'Owner' / 'Counter staff'.
- aria-label 'Toggle Light/Dark Theme' uses t('common.toggle_theme'). Alt texts 'Invoice scan', 'Thumbnail', 'Enlarged invoice'. Placeholders 'DD/MM/YYYY' and the typed GST example (use t('common.example') + an example key).
- Money: 'MRP Rs.', 'Rs.', '(Rs.' use formatRupees() from src/logic/money.ts. The words 'packs', '+n Free', 'TOTAL', 'Total Packs', 'Packs', 'Items' use t().
- '{n} items verified': nothing is verified when stock is entered (verification is the owner's tick later). Use plain '{n} items'.
- 'MED' placeholder on the medicine thumbnail: use <Icon name="medication" />.
- Dialog buttons 'Haan, Jodo' and 'Haan, Wapas Jao': keys in all three languages (English "Yes, add" and "Yes, go back").
- Titles with a repeated small line in English: use the shared helper that hides the second line when it repeats the first.

PART 3 - finish
1. Run npm run build FIRST. Fix any error.
2. Search for Hinglish words: Get-ChildItem src\screens,src\components -Recurse -Include *.ts,*.tsx | Select-String -Pattern "dawai|nahi|jodo|jodi|gayi|dabayein|baayein|taraf|haan |wapas|zaroori|hatayi". Fix every match that is visible text (ignore code comments).
3. Run npm run test. Update PROGRESS.md (3-5 lines).

Final answer: max 8 lines, simple words.
```

### A3. LOGIC-MSG (Hinglish error text from logic files)
```text
PROMPT LOGIC-MSG - MESSAGES FROM THE LOGIC FILES

Read AGENTS.md first. Do NOT use any Stitch tool. Use your code search tool.

Problem: src/logic/approvals.ts and src/logic/auth.ts contain typed Hinglish sentences ('Ijazat PIN Malik ya Staff PIN se alag hona chahiye', 'Ijazat PIN 4 digits ka hona chahiye', '5 galat try ke baad 2 minute ke liye lock ho gaya', 'Galat PIN try (n/5)', 'Ijazat PIN sahi daala gaya' and similar). Some are shown to the user (setup step 7 and the staff PIN step), so English mode shows Hinglish.
1. Logic returns fixed error CODES (for example 'approval_pin_length', 'approval_pin_same_as_owner_or_staff'), never sentences. The screens turn each code into t('...') with keys in all three language files.
2. Audit entries keep fixed English action codes and short English detail text. Never Hinglish.
3. Update src/logic/foundation.test.ts to expect the codes instead of the old sentences. All tests must pass.
4. Setup step 7 and the staff PIN step show the translated message for the returned code.
5. Run the build and the tests. Update PROGRESS.md (3-5 lines).

Final answer: max 6 lines, simple words.
```

### A4. REALDATA (no design sample data anywhere)
```text
PROMPT REALDATA - REAL SHOP DATA EVERYWHERE, NO DESIGN SAMPLES

Read AGENTS.md first. Do NOT use any Stitch tool. Use your code search tool.

Rule from the owner: the app shows only the owner's real saved data. Names, numbers and facts copied from the Stitch designs are never shown as real.
1. One source: create src/logic/useShop.ts (a hook) that reads the shop table once and gives name, owner name, address, phone, GST and licence numbers. Every screen that shows shop information uses it. No screen keeps its own copy or fallback. If a value is missing, show nothing for it.
2. Remove these invented texts from the screens and from en.ts, hinglish.ts, hi.ts and types.ts (the keys and their use): 'Counter #01 • {shop}', 'Bill No: #INV-88219', 'Time: 14:32', 'Terminal ID: HOS-402', 'Staff User', 'Administrative Terminal', 'Desktop POS Terminal #1', "Retail POS Counter #1", "Pharmacist In-charge", and every other sample bill number, terminal or counter number, time, amount or person name.
3. Login right-hand decorative panel: keep the look but show only real things: the shop name from useShop, today's date and the current time (live), and the user's name once chosen. No bill number, no terminal ID, no counter number.
4. Footers that said "<shop> • Desktop POS Terminal #1" show only the shop name and "Saved on this device".
5. The role shown under a user's name comes from the user's real role (Owner / Counter staff), never a typed word.
6. Search the whole of src with: Get-ChildItem src -Recurse -Include *.ts,*.tsx -Exclude *.test.ts | Select-String -Pattern "Raju|Sunita|Amit|Shree|Sharma|Gupta|Om Distributors|Jain|Ramesh|Rahul|Terminal|Counter #|INV-|98260|Staff User|HOS-|Bill #|12,400", and remove or replace each hit that can appear on screen. Grey example hints inside empty input boxes (shown with t("common.example")) may stay.
7. The DEV-only test buttons may keep their labels, but must not show a made-up bill number: "Bill #101" becomes plain "Test".
8. Add to AGENTS.md under "Sample data": "Shop information comes only from useShop(). Never type a shop name, person name, number or date in a screen. If data is missing, show nothing."
9. Run npm run test and the build. Update PROGRESS.md (3-5 lines).

Final answer: max 8 lines, simple words. List what you removed.
```

### A5. F1 (small fixes; checks first)
```text
PROMPT F1 - SMALL FIXES (CHECK FIRST, FIX ONLY WHAT IS STILL WRONG)

Read AGENTS.md first. Do NOT use any Stitch tool. Use your code search tool (or Select-String) and small edits; never read big files in pieces. For each item, first check whether it is already fixed. In the final answer list which items were already fine.

1. Units: in the Naya Dawai form "Units per pack" must start EMPTY with the grey hint "e.g. 10", never pre-filled. If it is empty on save, show a red message under the field; never silently use 1. In Stock Jodo step 3, "Packs" also starts empty (hint "e.g. 5"); "Free packs" may start empty and counts as 0.
2. Missing translations: add a test that scans src for every t('x.y') and tButton('x.y') key written as a text and fails if the key is missing from en.ts, hinglish.ts or hi.ts. Then fix every missing key it finds (for example the raw text "common.saved_badge" shown after saving a medicine: English "Saved", Hinglish "Save ho gaya", Hindi "सेव हो गया").
3. The label "Operator" under the owner's name (Owner menu, medicine list, medicine form, Stock Jodo): show the real role through t() (Owner or Counter staff).
4. The badge "GST Compliant Form" in the medicine form becomes "GST details" (Hinglish "GST ki jaankari", Hindi "GST की जानकारी"). The app must not claim legal compliance anywhere.
5. Invented footer facts: "Build: v4.12.8" becomes "Test version" (Hindi "टेस्ट वर्ज़न"); "Hospivo Retail Terminal Secure Session" becomes "The Owner area is protected by the Owner PIN" (Hinglish "Owner area Owner PIN se surakshit hai", Hindi "मालिक वाला हिस्सा Owner PIN से सुरक्षित है").
6. Stock Jodo step 1: do not auto-select a supplier. The user must tap one. Opening the page must not count as unsaved work.
7. Stock Jodo "New supplier": check that an audit entry "supplier_created" is written (addAudit). Add it if missing.
8. (Fonts and offline use are handled by the separate prompt OFFLINE. Skip this item here.)
9. Run npm run test and the build. Update PROGRESS.md (3-5 lines).

Final answer: max 8 lines, simple words.
```

### A6. OFFLINE (already run once; result unseen; re-run only if the offline test fails)
```text
PROMPT OFFLINE - FONTS AND ICONS MUST WORK WITH NO INTERNET

Read AGENTS.md first. Do NOT use any Stitch tool. Use your code search tool (or Select-String) and small edits.

Problem: the production build precaches only 5 files (about 877 KiB). No font file, including the icon font, is in the service worker cache, so after the first visit icons can appear as words and text can change font when there is no internet. Also about 100 font files are shipped, including Greek, Cyrillic and Vietnamese letters Hospivo never uses, and 4 weights of the icon font.

1. In src/index.css (and anywhere else fonts are imported) replace the full font imports by subset imports. First check which CSS files exist inside each node_modules/@fontsource/* package folder, then use:
   - Noto Sans (@fontsource/noto-sans): only the latin and latin-ext subsets, for the weights used now (400, 500, 600, 700, 800).
   - Noto Sans Devanagari (@fontsource/noto-sans-devanagari): only the devanagari, latin and latin-ext subsets, same weights.
   - Icon font (material symbols): ONLY the latin subset, weight 400 (a single file), not weights 100-300.
   The look must not change: same font family names and weights.
2. In vite.config.ts (vite-plugin-pwa, workbox): precache .woff2 files too (add woff2 to globPatterns) and raise maximumFileSizeToCacheInBytes to 3 MB so the icon font is included. Do not precache .woff files.
3. Run npm run build. In the final answer tell me: the number of files and the total KiB the service worker precaches; how many font files are in dist/assets before and after; and confirm the icon font .woff2 is listed in dist/sw.js.
4. Run npm run test. Update PROGRESS.md (3-5 lines).

Final answer: max 6 lines, simple words.
```