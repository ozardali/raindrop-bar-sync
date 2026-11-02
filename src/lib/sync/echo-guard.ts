import { browser } from 'wxt/browser';

/**
 * Suppresses bookmark events caused by our own writes (docs/architecture.md, "Echo guard").
 * Stored in storage.session so it survives a service-worker restart within the session.
 * This is an optimization only: a missed echo just causes one redundant sync.
 */
export type BookmarkEvent = 'created' | 'changed' | 'moved' | 'removed';

const KEY = 'echoExpectations';
const TTL_MS = 10_000;

/** "event:id" -> pending expectations, each with its expiry. `id` is a native id, or a
 * creation signature for 'created' (the id is unknown before the call). */
type Expectations = Record<string, number[]>;

// storage.session exists in Chrome 102+ and Firefox 115+.
const area = () => browser.storage.session ?? browser.storage.local;

async function load(): Promise<Expectations> {
  const raw = (await area().get(KEY))[KEY] as Expectations | undefined;
  const now = Date.now();
  const out: Expectations = {};
  for (const [k, list] of Object.entries(raw ?? {})) {
    const live = (Array.isArray(list) ? list : []).filter((exp) => exp > now);
    if (live.length) out[k] = live;
  }
  return out;
}

export async function expectEvent(event: BookmarkEvent, id: string): Promise<void> {
  const e = await load();
  const k = `${event}:${id}`;
  e[k] = [...(e[k] ?? []), Date.now() + TTL_MS];
  await area().set({ [KEY]: e });
}

/** Returns true if the event was expected (and consumes one expectation). */
export async function consumeIfExpected(event: BookmarkEvent, id: string): Promise<boolean> {
  const e = await load();
  const k = `${event}:${id}`;
  const hit = (e[k]?.length ?? 0) > 0;
  if (hit) {
    e[k]!.shift();
    if (!e[k]!.length) delete e[k];
  }
  await area().set({ [KEY]: e });
  return hit;
}
