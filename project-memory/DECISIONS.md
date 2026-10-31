# Hospivo - decisions already made (do not reopen without asking the owner)

- Platform: Windows PC first (owner uses Windows). Browser app (PWA), phone layout also built.
- Tech: React + TypeScript + Vite, Tailwind CSS, Dexie (IndexedDB) for local data, vite-plugin-pwa, Vitest for business-rule tests only.
- Local-first. Local-only mode is built fully first. Cloud-enabled mode is Phase 8, built last.
- Setup screen "Mode choice" shows both modes; Cloud option stays locked until Phase 8.
- Designs live in Stitch project "Hospivo Pharmacy Design System" (98 screens, numbered 01-46).
  Designs are pulled into /designs/<phase>/ only when that phase starts (saves free-tier credits).
- One computer first. Several devices sharing data = Cloud phase only.
- Build one screen or one small feature per prompt.
- Setup: only shop name and owner name are required; all other shop fields are optional.
- Staff PINs are 4 digits by default, same as the Owner PIN.
- PINs are 4 digits by default. A 6-digit option is an Owner setting, to be built in Phase 5 (Settings). Changing the length later means every user must set a new PIN.
- Risky actions are approved with a separate APPROVAL PIN ("Ijazat PIN", English: "Approval PIN"), NOT the Owner login PIN.
- Approval PIN is 4 digits by default and must differ from the Owner login PIN and every staff PIN. Wherever RULES.md says "local Owner PIN" for risky actions it now means the Approval PIN.
- Risky actions: delete/correct bill, price change, discount above limit, stock correction, cash mismatch.
- Opening the Owner area from Home still uses the Owner login PIN. Even when the owner is logged in, risky actions ask for the Approval PIN.
- 3 wrong tries lock it for 5 minutes. The lock is saved in the database so a refresh does not clear it.
- Every wrong try, lock and successful use goes to the audit log (never the PIN itself).
- Staff PINs added or changed later must differ from the Approval PIN.
- Remote approval is built later, in Cloud mode only.
- All stock is stored in the SMALLEST unit (loose tablets). Packs = units / unitsPerPack. Money is whole paise.
- Batch expiry date is valid through the LAST day of the entered month (e.g. 08/2027 means valid through 31 Aug 2027; expired starting 1 Sep 2027).
- stockMovements table is strictly append-only. Corrections and returns append new signed movements, never editing or deleting existing records.
- Languages: English is the DEFAULT language for new shops. Hinglish (Hindi in English letters) is the second language. All screens use src/i18n. Two-line buttons show main label in English mode without subline gap. Stored records and audit logs always use fixed English codes.

## Open questions (ask the owner when the phase starts)
- Default discount limit.
- Default offline rule for each protected action.
- Exact GST invoice and Schedule H register formats (owner to confirm with CA/pharmacist).
- Stitch screens 28b and 28c have the same title; check which is "Paisa Mila" in Phase 4.
