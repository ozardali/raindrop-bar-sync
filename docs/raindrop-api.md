# Raindrop API notes

Behaviour of the [Raindrop.io REST API](https://developer.raindrop.io) that this extension
depends on, checked against the real API with throw-away collections (November 2026). Where the
official documentation says otherwise, these observations win.

| Topic | Observed | Consequence |
|---|---|---|
| `note` length | Silently cut at **10 000** characters. Longer notes return 200, no error | One order manifest per folder, length checked before writing and read back after |
| Internal links | `https://raindrop-bar-sync.invalid/…` is accepted and stored as is; title and excerpt are not replaced by parsing | Used for manifests and the devices record; recognised by link, not title |
| `lastUpdate` | Changes on every title, link, collection or order update (ISO, ms precision). Moving a raindrop also updates its collection's `lastUpdate` | Usable for last-write-wins. Moving to the front leaves siblings alone; moving to the middle can renumber siblings' `sort`, so `sort` is never treated as a change signal |
| Duplicates | The same URL can exist twice in one collection | First-sync matching pairs duplicates in order |
| Rejected links | 400 `url is invalid` / `domain is required` for `javascript:`, `file:`, `about:`, `data:`, `place:`. `chrome://` and `edge://` are accepted | Such bookmarks stay local-only and are never deleted |
| Collection `sort` | A 0-based **ascending** position among siblings (the docs say descending). `PUT {sort: N}` moves to position N and renumbers siblings; values past the end are clamped. `sort` sent on create is ignored | Create, then position with a `PUT` |
| Raindrop `order` | Write-only: never returned on GET. `PUT {order: N}` moves the item to index N of the `sort=-sort` list (clamped). `order` sent on create is ignored; new items go to index 0 | Lists are always requested with `sort=-sort`; manifests live at the end |
| Default list order | Without `sort`, raindrops come newest first | Always pass `sort=-sort` |
| `GET /collections/childrens` | Also returns root collections, even in accounts without sub-collections | The two collection lists are de-duplicated by id |
| Empty titles | An empty or blank raindrop title is replaced by the link. A blank collection title stays empty. Titles are cut at 1 000 characters | Icon-only bookmarks are mapped to "title = URL" and written back untitled |
| Rate limit | 120 requests per minute. Headers are `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (epoch seconds); there is no `RateLimit-Remaining` | The client slows down near the limit and backs off on 429 |
| Deleting | Deleting a collection deletes its sub-collections and moves raindrops to Trash (`-99`). Deleting a raindrop that is already in Trash removes it permanently | Deletes are recoverable from Raindrop's Trash |
| Test tokens | Do not expire. OAuth access tokens expire after two weeks; code exchange and refresh both require the client secret; PKCE is not supported | Test token for now, see [architecture.md](architecture.md#authentication) |

## Not verified

- The bookmarks bar folder id / `folderType` in Vivaldi and Brave.
- Whether siblings' `lastUpdate` changes when a raindrop is moved into the middle of a list.
