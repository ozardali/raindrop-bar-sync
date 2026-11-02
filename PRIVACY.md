# Privacy

Raindrop Bar Sync has no server of its own and collects nothing. This page lists everything it
stores and everywhere it sends data.

## Network

The extension makes requests to **one host only: `https://api.raindrop.io`**, authenticated
with the token you entered. There is no analytics, telemetry, crash reporting or any other
third party. The only other link it opens is the Raindrop settings page, when you click it.

## Stored in your browser (`storage.local` / `storage.session`)

- Your Raindrop test token and settings (collection, interval, language).
- The mapping between this browser's bookmark ids and Raindrop ids, and the last synced state
  of the bar.
- Up to 10 backups of this browser's bar, and the activity log (last 50 entries).
- A random id and a name for this browser (see below).

All of it stays in the browser profile and is removed when you remove the extension.

## Stored in your Raindrop account

Besides your bookmarks themselves, the extension keeps a few hidden raindrops in the synced
collection, all with links under `https://raindrop-bar-sync.invalid/`:

- **Order manifests**, one per folder: the order of that folder's items (Raindrop ids only).
- **Devices record**, one in the root collection: for each browser that syncs with the
  collection, its random id, its name (e.g. "Firefox on macOS", or the name you gave it), when
  it last synced, and the Raindrop ids it changed in the last 14 days with their times.

They are visible to anyone who can see that collection in Raindrop, like the bookmarks
themselves. Deleting them is harmless: they are recreated on the next sync.

## Permissions

| Permission | Why |
|---|---|
| `bookmarks` | Read and write the bookmarks bar |
| `storage` | Keep the settings and state listed above |
| `alarms` | Check Raindrop for changes every few minutes |
| `https://api.raindrop.io/*` | Talk to Raindrop |
