# Architecture

How Raindrop Bar Sync keeps a browser's bookmarks bar and a Raindrop.io collection identical.
Raindrop is the server; there is no backend of our own. Verified API behaviour that the
design relies on is in [raindrop-api.md](raindrop-api.md).

```
entrypoints/
  background.ts           event listeners, alarm, sync triggers (MV3 service worker / Firefox event page)
  popup/                  toolbar popup: status, "Sync now"
  options/                settings: token, collection, devices, backups, activity log
src/lib/
  browser-roots.ts        finds the bookmarks bar folder in each browser
  device.ts               this browser's id and name
  raindrop/client.ts      REST client (rate limit, retries, paging)
  sync/types.ts           normalized tree model (SyncNode, Snapshot, SyncOp)
  sync/merge.ts           PURE 3-way merge: (base, local, remote) -> ops
  sync/local.ts           native tree <-> Snapshot, applies local ops
  sync/remote.ts          Raindrop <-> Snapshot, applies remote ops, writes order manifests
  sync/order-manifest.ts  interleaved folder/bookmark order stored in Raindrop
  sync/devices.ts         shared record of browsers and their recent changes
  sync/activity.ts        activity log entries
  sync/engine.ts          orchestration, lock, safety nets
  sync/state.ts           everything persistent, in browser.storage
  sync/echo-guard.ts      ignores bookmark events caused by our own writes
src/i18n/                 UI translations
```

Only `sync/local.ts` and `browser-roots.ts` call `browser.bookmarks.*`, and only
`raindrop/client.ts` talks to the Raindrop API.

## Sync cycle

State-based, not event-sourced. A queue of recorded operations breaks as soon as the browser
was closed, the service worker was killed or an event was missed. Instead every sync compares
whole trees:

1. **Local snapshot**: the bookmarks bar subtree, normalized.
2. **Remote snapshot**: the chosen collection, its sub-collections, all raindrops and the order
   manifests.
3. **Base snapshot**: the state both sides agreed on after the last successful sync.
4. `merge(base, local, remote, timestamps)` returns the ops for each side and the new base.
5. Remote ops run first (so new local nodes get Raindrop ids), then local ops.
6. Only when everything succeeded is the new base saved. An interrupted sync leaves the base
   alone and the next one picks up where it stopped (see "Resuming" below).

Bookmark event listeners do two things only: record when a node was touched locally (Chrome
bookmarks have no "modified" time, and last-write-wins needs one) and schedule a sync two
seconds later. An alarm pulls remote changes every minute (configurable, 1 to 30). Browser
start, install and the options page also trigger a sync.

The MV3 service worker can be killed at any moment, so nothing lives in module scope: state is
in `storage.local`, the lock and echo expectations in `storage.session`. The lock times out
after two minutes and is refreshed on every write, because a large first sync can take longer
at 120 requests per minute.

## Data model

```ts
type NodeKey = string; // "root" | "c:<collectionId>" | "r:<raindropId>" | "n:<nativeId>"

interface SyncNode {
  key: NodeKey;
  kind: 'folder' | 'bookmark';
  title: string;
  url?: string;
  parentKey: NodeKey | null;
  index: number; // position among siblings, folders and bookmarks interleaved
}
```

Identity is the Raindrop id. Native ids are per device, so a mapping `nativeId <-> NodeKey`
is kept. A local node not yet on Raindrop has a temporary `n:<nativeId>` key; once created on
Raindrop it is re-keyed to `c:`/`r:`.

Folders map to collections (nested through `parent`), bookmarks to raindrops. The bar's
direct children are the chosen collection's children. The root itself is never renamed,
moved or deleted.

### Resuming

Every create and re-key is written to the mapping before the next write. If a sync dies
half-way, the base is unchanged but the mapping already knows the new Raindrop ids, so the
next merge sees the node on both sides instead of creating a duplicate.

## Merge

`sync/merge.ts` is a pure function: no browser APIs, no network, no clock. For every key in
base, local and remote:

| base | local | remote | Result |
|---|---|---|---|
| no | yes | no | New locally: create on Raindrop |
| no | no | yes | New on Raindrop: create locally |
| no | yes | yes | Matched pair (first sync): last-write-wins per field |
| yes | no | yes | Deleted locally. If Raindrop changed it after the delete, **resurrect** locally; otherwise delete on Raindrop |
| yes | yes | no | Deleted on Raindrop. If changed locally, **resurrect** on Raindrop; otherwise delete locally |
| yes | no | no | Deleted on both: drop |
| yes | yes | yes | Per field (title, url, parent): if one side changed it, that side wins; if both did, the newer one |

Rules on top:

- **Folder deleted on one side, something added or changed inside it on the other**: the
  folder is resurrected. Losing nothing beats being tidy.
- **Cycles**: a move that would put a folder inside its own subtree is rejected; the other
  side's (or the base) parent wins, root as a last resort.
- **Ordering** is resolved after structure, per folder (next section).
- **Op order**: creates and moves come in pre-order of the final tree (parents first, siblings
  left to right), then updates, then deletes deepest first.
- Placement ops carry `afterKey`, the sibling the node ends up right after. Because of the op
  order that sibling is always in place already, so appliers position relative to it rather
  than trusting an index that stale, soon-deleted siblings would shift.
- Reorders produce moves only for nodes outside the longest increasing subsequence: moving
  one item to the front is a single move.
- The merge is deterministic and idempotent: merging its own result again yields no ops.
  Randomized tests check this, plus "applying the ops brings both sides exactly to the new
  base" and "nothing new is ever lost", over hundreds of random edit histories.

### Last-write-wins times

Local times come from the event listeners. Remote times are Raindrop's `lastUpdate`, which is
when a change *reached* Raindrop. A browser that was offline sends old edits late, so they would
look newer than they are. The devices record (below) stores the real edit time of every change
a browser sends; when the last write to a node is such a recorded sync, the merge uses that edit
time. Changes made on raindrop.io keep Raindrop's own time.

## First sync

With no base, local and remote are matched first: folders by path, bookmarks by normalized URL
within matched folders. Duplicates in one folder match in order of appearance (1st with 1st).
URL normalization ignores scheme, `www.`, default ports, trailing slashes and the fragment, but
keeps hash routes (`#/inbox`, `#!/a`) so different pages of a single-page app stay apart.

Matched pairs share the Raindrop key and have no base, so the delete rules never fire: missing
items are added in both directions and nothing is deleted. Local order wins; Raindrop-only
items are appended. Because nothing can be deleted, the first sync runs without asking.

## Ordering

Raindrop keeps collection order (`sort`) and raindrop order separately and cannot express the
order of folders *relative to* bookmarks. Each synced collection therefore holds a hidden
**order manifest**: a raindrop with the link `https://raindrop-bar-sync.invalid/manifest` whose
`note` is

```json
{ "v": 2, "updatedAt": "…", "children": ["c:123", "r:456", "r:789"] }
```

- One manifest per folder: `note` is silently cut at 10 000 characters, which one manifest for
  a whole bar could exceed. A manifest over 9 500 characters is not written (the folder's order
  is logged as not saved; sync continues). After writing, the returned note is parsed back.
- The manifest is the source of `index`. Children it does not list (added on raindrop.io) go
  last, in Raindrop's own order: sub-collections, then raindrops.
- A folder's order timestamp for last-write-wins is its manifest's `updatedAt`.
- Per folder: if only one side reordered (relative to base), that order wins; if both did, the
  side with the newer change. Nodes the winning side does not have are placed after their
  neighbour from their own side.
- Sub-collection `sort` is also written so Raindrop's UI shows folders in the right order.
  Raindrop's bookmark order is not: it costs one request per bookmark.
- Manifests are never part of a snapshot and never written to the browser. Every link under
  `https://raindrop-bar-sync.invalid/` is internal and ignored as a bookmark, including kinds a
  newer version may add.

## Devices

Each browser profile gets a random permanent id and a detected name ("Firefox on macOS",
"Chrome on Windows"; forks such as Helium report "Chromium"), which can be renamed. Identity is
the id, so two profiles of one browser stay apart; equal names get a short id suffix on screen.

The root collection holds one more hidden raindrop, `…/devices`, with

```json
{ "v": 1, "devices": { "<id>": { "name": "…", "seenAt": 0, "changes": { "r:456": [editedAt, syncedAt] } } } }
```

It holds each browser's changes from the last 14 days (at most 100) and is used for the devices list,
for "(from Firefox)" in the activity log, and for the edit times above. Two browsers writing it
at once can lose an entry; that only affects these labels and times, so it is accepted.

## Unsyncable links

Raindrop rejects some links with a 400 (`javascript:` bookmarklets, `file:`, `about:`, `data:`,
Firefox `place:` queries). Such bookmarks are treated like separators: left out of the local
snapshot, not counted in indexes, never deleted. Known schemes are skipped up front; any other
400 adds the bookmark to a local-only list.

Raindrop also stores an empty title as the link itself. An untitled (icon-only) bookmark is
therefore read as titled by its URL, and a bookmark whose title equals its URL is written back
untitled, so icon-only items stay icon-only everywhere.

## Echo guard

Writing to the bookmarks tree fires the same events as a user edit. Before each write the sync
records the event it expects (`moved:<id>`, or a content signature for creations, whose id is
not known yet); a matching event is consumed and ignored. Expectations expire after 10 seconds.
This is an optimization only: a missed echo causes one redundant sync, never wrong data.

## Safety nets

- **Mass-delete guard**: a sync that would delete 20 or more items on one side, or more than 30%
  of them (at least 5), pauses and asks. This protects against a wrong collection, an empty
  profile or a broken token. The badge shows `?`.
- **Backups**: before a sync changes this browser's bar, a copy is kept (last 10). Restoring
  computes the ops that turn the current bar into the backup, applies them locally and lets a
  normal sync spread the result. The current bar is backed up first, so restores can be undone.
- Raindrop moves deleted raindrops to its Trash.
- **Offline**: an unreachable API is not an error. Status shows "Offline", local changes keep
  their times, and the browser's `online` event triggers a sync.
- Errors go to the activity log and show `!` on the toolbar badge. A rejected token stops
  syncing until it is replaced; 429 and 5xx responses back off exponentially.

## Browser differences

| Topic | Detail |
|---|---|
| Bar folder | Chromium: `folderType === 'bookmarks-bar'`, else id `"1"`. Firefox: `toolbar_____`. Vivaldi and Brave are not verified yet |
| Separators | Firefox only. Not synced, but they take native indexes, which local writes account for |
| `move` index | Chrome counts a same-folder index before removing the node, Firefox after. Each move is checked and corrected once |
| Managed bookmarks | Chrome's `unmodifiable: 'managed'` nodes are skipped |
| Host permission | Firefox MV3 does not grant it at install; the options page requests it |
| Built-in sync | Chrome Sync / Firefox Sync must be off for the bar, otherwise both systems fight |

## Authentication

A personal Raindrop test token, entered on the options page and kept in `storage.local`. It
never expires and is only sent to `api.raindrop.io`. The client takes a token provider function,
so OAuth can be added later without touching the rest. Raindrop's OAuth requires a client secret
for the code exchange and every refresh (tokens expire after two weeks) and does not support
PKCE, which is why it is not used yet.

## Internationalization

The UI is translated into the 16 languages the Raindrop app offers. `src/i18n/locales/en.ts` is
the source; the type system requires every locale to have the same keys and a test requires the
same `{placeholders}`. Plurals use `Intl.PluralRules`, times `Intl.RelativeTimeFormat`.

The background never translates. It stores messages as `{ k: key, p: params }`, and the popup
and options page render them in the language chosen when they are read. Changing the language
therefore also changes existing activity log entries. The store description is generated into
`_locales/` at build time.
