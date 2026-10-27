# Hospivo - decisions already made (do not reopen without asking the owner)

- Platform: Windows PC first (owner uses Windows). Browser app (PWA), phone layout also built.
- Tech: React + TypeScript + Vite, Tailwind CSS, Dexie (IndexedDB) for local data, vite-plugin-pwa, Vitest for business-rule tests only.
- Local-first. Local-only mode is built fully first. Cloud-enabled mode is Phase 8, built last.
- Setup screen "Mode choice" shows both modes; Cloud option stays locked until Phase 8.
- Designs live in Stitch project "Hospivo Pharmacy Design System" (98 screens, numbered 01-46).
  Designs are pulled into /designs/<phase>/ only when that phase starts (saves free-tier credits).
- One computer first. Several devices sharing data = Cloud phase only.
- Build one screen or one small feature per prompt.

## Open questions (ask the owner when the phase starts)
- Default discount limit.
- Default offline rule for each protected action.
- Exact GST invoice and Schedule H register formats (owner to confirm with CA/pharmacist).
- Stitch screens 28b and 28c have the same title; check which is "Paisa Mila" in Phase 4.
