# Contributing

Thanks for helping. Bug reports, translations and pull requests are all welcome.

## Reporting a bug

Open an issue with the browser and version, what you did, what you expected and what happened.
The **Activity log** on the settings page usually shows what the sync decided; a screenshot of
it helps a lot. Never paste your Raindrop token.

If a sync ever deletes or duplicates bookmarks unexpectedly, that is the most important kind of
bug: please report it, even if you are not sure how to reproduce it.

## Development

Requirements: Node.js 20+, and Chrome/Chromium or Firefox.

```sh
npm install
npm run dev            # Chromium with the extension loaded and hot reload
npm run dev:firefox    # same for Firefox
npm test               # Vitest
npm run compile        # type check
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv3
npm run zip            # store packages (zip, zip:firefox)
```

`npm run dev` starts a fresh browser profile, so your real bookmarks are not touched. To use a
browser other than the default Chrome / Firefox, create a `web-ext.config.ts` (it is ignored by
git):

```ts
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  binaries: { chrome: '/Applications/Helium.app/Contents/MacOS/Helium' },
});
```

Built with [WXT](https://wxt.dev) and TypeScript. Start with
[docs/architecture.md](docs/architecture.md); it explains the sync cycle, the merge rules and
why things are the way they are.

### Ground rules

- `src/lib/sync/merge.ts` stays a pure function: no browser APIs, no network, no clock. Every
  merge rule has a test in `tests/merge.test.ts`.
- Only `src/lib/sync/local.ts` and `src/lib/browser-roots.ts` call `browser.bookmarks.*`; only
  `src/lib/raindrop/client.ts` talks to the Raindrop API.
- All state lives in `browser.storage`. The MV3 service worker can be killed at any time, so
  nothing may rely on module-level variables surviving between events.
- Never log the token. Do not add permissions.
- When in doubt, keep data: resurrect instead of delete.

### Tests

- `tests/merge.test.ts`: one test per merge rule.
- `tests/merge.fuzz.test.ts`: random edit histories; every run checks that applying the ops
  makes both sides equal, that a second merge is a no-op and that nothing new is lost.
- `tests/local.test.ts`: the bookmark writer against a fake bookmarks API with Chrome's and
  Firefox's different `move` semantics.
- `tests/remote.live.test.ts`: the Raindrop writer against the **real API**, in a temporary
  collection that is deleted afterwards. Skipped unless you opt in:

  ```sh
  RAINDROP_TOKEN_FILE=/path/to/file-with-token npx vitest run tests/remote.live.test.ts
  ```

### Icons

`assets/icon.svg` is the source. `npm run icons` renders the PNGs in `public/icon/` with a
headless Chromium (set `CHROMIUM=/path/to/browser` if it is not Helium on macOS).

## Translations

**English is the source of truth.** When changing a text, change English first, then the other
languages.

### Extension UI

Strings live in `src/i18n/locales/<code>.ts`, with `en.ts` as the source. The type checker
fails if a language misses a key, and `tests/i18n.test.ts` fails if a translation drops or
renames a `{placeholder}`. Plurals are objects with `one` / `few` / `many` / `other` forms as
your language needs them (see `ru.ts`).

Where a text quotes a Raindrop button (the token guide), use the label Raindrop itself shows in
that language; the Raindrop app's translations are in
[raindropio/app](https://github.com/raindropio/app/tree/master/src/assets/languages).

The supported languages are the ones the Raindrop app supports. To add one, add the locale file
and an entry in `LANGUAGES` in `src/i18n/index.ts`.

### README

`README.md` is the source. Translations are `README.<code>.md` with the same structure; add
your language to the switcher line at the top of every README.

## Pull requests

- Keep changes focused; one topic per pull request.
- `npm run compile` and `npm test` must pass.
- For sync behaviour changes, add a test that fails without the change.
