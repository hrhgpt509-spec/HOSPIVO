# Hospivo - one-page brief

Hospivo = billing + stock app for an Indian medical store (dawai ki dukaan).
Runs in the browser on the shop computer or phone, like an app. Works without internet.
Users are 40-50 years old, know only WhatsApp/Facebook. Big buttons, Hindi words in English letters, one job per screen.

Does: normal billing (Dawai Becho), rush mode (Fast Bill with barcode scanner), batch-wise stock with expiry,
supplier purchases with invoice photo (Stock Jodo), udhaar (credit) + WhatsApp reminders, barcode/shelf stickers,
shelf map, daily closing (Din Band) with cash check + WhatsApp report, owner dashboard/reports/audit log, backup/restore.

People: Owner (everything), Cashier (selling screens only), Runner (scanner only, no screen).

Two modes (chosen at setup):
- Local-only: all data on the shop device. No cloud, no remote owner app, no remote approval.
- Cloud-enabled: still works offline, queues changes, syncs when internet returns. Owner web app for
  remote reports, approvals, device list. Dashboards must show "last sync" and never pass stale data as live.

Not in version 1: doctor commission, any AI feature, more than one runner scanning at once,
live remote view in Local-only mode, guaranteed instant push notifications.

Source documents: Hospivo_Minimal_Change_Version_final.pdf (13 pages + Amendment A-M). Designs: Stitch project
"Hospivo Pharmacy Design System" (98 screens).
