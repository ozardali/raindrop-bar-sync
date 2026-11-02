# Raindrop Bar Sync

**Your browser's bookmarks bar, identical in every browser, through Raindrop.io.**

**English** · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [Español](README.es.md) · [简体中文](README.zh-CN.md) · [Português (BR)](README.pt-BR.md)

A browser extension that keeps the **native bookmarks bar** of Chrome, Edge, Brave, Vivaldi,
Helium and Firefox in two-way sync with one Raindrop.io collection. Add a bookmark in Firefox,
it shows up in Chrome's bar a minute later, in the same folder and at the same position.
Raindrop is the server; there is nothing else to host.

<p align="center">
  <img src="docs/images/popup.png" width="320" alt="Toolbar popup">
  &nbsp;
  <img src="docs/images/popup-dark.png" width="320" alt="Toolbar popup, dark theme">
</p>

## Why

- Chrome Sync and Firefox Sync only sync within their own browser family.
- Raindrop's own extension saves bookmarks to Raindrop, but does not touch the browser's
  bar.
- Cross-browser bookmark sync tools need a separate storage you set up (Nextcloud,
  WebDAV, Google Drive…). If you already use Raindrop, this uses it as that storage.

## Features

- **Two-way sync** of the bookmarks bar and its sub-folders: add, rename, edit links, move
  and delete on either side.
- **Exact order**, including how folders and bookmarks are interleaved. Raindrop cannot store
  that natively, so it is kept in small hidden notes in the collection.
- **Last change wins**, per bookmark and per field, using the time you actually made the
  change, even if a browser was offline for days.
- **Nothing gets lost by accident**: the first sync only adds, a folder deleted on one side
  while something was added to it on the other comes back, and large deletes stop and ask.
- **Backups** of this browser's bar before every change, restorable with one click.
- **Activity log** with every change and where it came from ("from Firefox").
- **Devices list** of every browser syncing with the collection.
- **Offline-friendly**: changes made offline are kept and sent when the connection is back.
- Popup and settings in **16 languages**, light and dark theme.
- No servers, no analytics, no permissions beyond `bookmarks`, `storage`, `alarms` and
  `api.raindrop.io`.

![Settings page](docs/images/options.png)

## Install

The extension is not in the Chrome Web Store or on addons.mozilla.org yet; build it from
source. You need [Node.js](https://nodejs.org) 20 or newer.

```sh
git clone https://github.com/ozardali/raindrop-bar-sync.git
cd raindrop-bar-sync
npm install
npm run build            # Chrome, Edge, Brave, Vivaldi, Helium…
npm run build:firefox    # Firefox
```

**Chromium browsers**: open `chrome://extensions`, turn on **Developer mode**, click
**Load unpacked** and choose `.output/chrome-mv3`.

**Firefox**: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**
and choose `.output/firefox-mv3/manifest.json`. Temporary add-ons are removed when Firefox
quits; for a permanent install, run `npm run zip:firefox` and sign the zip as an unlisted
add-on on [addons.mozilla.org](https://addons.mozilla.org/developers/).

## Set up

1. **Back up your bookmarks first** (bookmark manager → Export). Sync works on real data.
2. Turn off the browser's built-in bookmark sync (Chrome Sync / Firefox Sync bookmarks) on
   the browsers you use this in. Two sync systems on one bar fight and create duplicates.
3. Click the extension icon → **Settings**.
4. **Raindrop account**: paste a test token. The page walks you through getting one:
   Raindrop → Settings → Integrations → *Create new app* → *Create test token*. The token
   only gives access to your own account and does not expire.
5. **Collection**: pick the collection that mirrors your bar, or create a new one. Use the
   **same collection in every browser**.
6. That's it. The first sync merges both sides: it adds what is missing in either direction
   and deletes nothing.

From then on changes made in the browser go to Raindrop within seconds, and changes from
other browsers arrive within a minute (configurable).

## How it works

Each sync compares three trees: the bar as it is now, the collection as it is now, and the
state both agreed on after the last sync. Whatever changed on only one side is copied to
the other; when both sides changed the same thing, the newer change wins. The merge is a
pure function with unit, property and fuzz tests. Hundreds of random edit histories are
each checked to end with both sides identical and nothing new lost.

Details: [docs/architecture.md](docs/architecture.md). Raindrop API behaviour the design
relies on, verified against the live API: [docs/raindrop-api.md](docs/raindrop-api.md).

## Limitations

- Only the bookmarks bar (and its folders) is synced, not "Other bookmarks" or "Mobile".
- Separators (Firefox) are not synced; Raindrop has nothing to map them to.
- Links Raindrop does not accept (`javascript:` bookmarklets, `file:`, `about:`) stay in the
  browser they are in and are never deleted.
- Firefox for Android and Safari are not supported.
- Vivaldi and Brave should work like Chrome but have not been tested yet.
- Sign-in is by test token; "Sign in with Raindrop" (OAuth) needs a server-side secret and is
  not implemented.

## Disclaimer

**This is an unofficial project, not affiliated with or endorsed by Raindrop.io.**

**Sync changes real data in two places.** The safety nets (no deletes on first sync, the
mass-delete pause, local backups, Raindrop's Trash) make losing bookmarks unlikely, not
impossible. Keep an export of your bookmarks you can go back to.

**No warranty.** The software is provided as is, under the [MIT license](LICENSE).

## Privacy

The extension talks to exactly one server: `api.raindrop.io`, with your token. No analytics,
no third parties. See [PRIVACY.md](PRIVACY.md) for exactly what is stored where.

## Translations

The extension UI is available in the 16 languages the Raindrop app supports. This README is
available in the languages linked at the top. **English is the source of truth** for both;
when a translation drifts, the English text wins. How to fix or add a translation:
[CONTRIBUTING.md](CONTRIBUTING.md#translations).

## Contributing

Bug reports and pull requests are welcome. Development setup, tests and project layout are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Goksel Ozardali
