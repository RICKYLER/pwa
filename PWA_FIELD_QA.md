# PWA Field Device QA

## Installability

1. Open the app on Chrome or Edge over `https` or `http://localhost`.
2. Confirm the install card appears after the page settles.
3. Install the app and verify it launches in standalone mode from the home screen or desktop.
4. Confirm the icon renders correctly on Android, iOS, and desktop.

## Offline Shell

1. Visit `/dashboard`, `/households`, `/reports`, and `/vulnerability` while online.
2. Turn on airplane mode.
3. Relaunch the installed app.
4. Confirm the app still opens and the offline status card appears.
5. Open a previously visited route and confirm the page shell loads without a network connection.
6. Hard-refresh to an uncached route and confirm the offline fallback page appears.

## Local Data Persistence

1. While offline, create or update a household or resident record.
2. Reload the route while still offline.
3. Confirm the change still exists from IndexedDB.
4. Confirm the sync status card reports pending changes waiting for reconnection.

## Background Backup Sync

1. Make one or more local changes so records enter the sync queue.
2. Reconnect the device to the internet.
3. Confirm the status card changes from offline to syncing, then clears.
4. Verify the server backup file at `data/field-sync-backup.json` receives the latest queued entity snapshots.
5. Confirm queued records in IndexedDB move from `syncStatus: "pending"` to `syncStatus: "synced"` after backup succeeds.

## Regression Checks

1. Confirm login still works online.
2. Confirm logout clears the cached session snapshot and the app no longer opens authenticated routes after a fresh reload.
3. Confirm `manifest.json`, `sw.js`, and icon assets return `200`.
4. Confirm service worker updates are picked up after a redeploy.
