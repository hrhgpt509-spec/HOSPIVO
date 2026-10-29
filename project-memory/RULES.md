# Hospivo - business rules (from the owner's PDF). Do not change without asking.

## Roles and login
- Owner sees everything incl. profit and purchase price. Cashier: selling screens only; NO profit, NO purchase price,
  cannot edit MRP, cannot edit/delete a finished bill. Runner: scanner only.
- Login: tap a name, type PIN on a big number pad. Wrong PIN -> red "PIN galat hai", pad clears.
- Owner PIN is 4-6 digits. Store PINs only as a salted hash, never as plain text.
- Auto-lock after inactivity (default 5 min, owner can change).

## Protected actions and approvals
- Risky actions: delete/correct a finished bill, change a price, discount above limit, stock correction, cash mismatch at Din Band.
- Risky actions are approved with a separate APPROVAL PIN ("Ijazat PIN", English: "Approval PIN"), NOT the Owner login PIN.
- Approval PIN is 4-6 digits and must differ from the Owner login PIN and every staff PIN. Wherever rules say "local Owner PIN" for risky actions it now means the Approval PIN.
- Opening the Owner area from Home still uses the Owner login PIN. Even when the owner is logged in, risky actions ask for the Approval PIN.
- 3 wrong tries lock it for 5 minutes. The lock is saved in the database so a refresh does not clear it.
- Every wrong try, lock and successful use goes to the audit log (never the PIN itself).
- Staff PINs added or changed later must differ from the Approval PIN.
- For EACH action category the owner sets an offline rule: (a) Ijazat PIN (Approval PIN), (b) remote approval (Cloud mode only, built later), (c) blocked while offline.
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
