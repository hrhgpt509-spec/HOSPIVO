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
- Staff PINs are 4-6 digits, same as the Owner PIN.
- Risky actions are approved with a separate APPROVAL PIN ("Ijazat PIN", English: "Approval PIN"), NOT the Owner login PIN.
- Approval PIN is 4-6 digits and must differ from the Owner login PIN and every staff PIN. Wherever RULES.md says "local Owner PIN" for risky actions it now means the Approval PIN.
- Risky actions: delete/correct bill, price change, discount above limit, stock correction, cash mismatch.
- Opening the Owner area from Home still uses the Owner login PIN. Even when the owner is logged in, risky actions ask for the Approval PIN.
- 3 wrong tries lock it for 5 minutes. The lock is saved in the database so a refresh does not clear it.
- Every wrong try, lock and successful use goes to the audit log (never the PIN itself).
- Staff PINs added or changed later must differ from the Approval PIN.
- Remote approval is built later, in Cloud mode only.

## Open questions (ask the owner when the phase starts)
- Default discount limit.
- Default offline rule for each protected action.
- Exact GST invoice and Schedule H register formats (owner to confirm with CA/pharmacist).
- Stitch screens 28b and 28c have the same title; check which is "Paisa Mila" in Phase 4.
