import { browser } from 'wxt/browser';
import { getBookmarksBarId } from '../src/lib/browser-roots';
import { consumeIfExpected, type BookmarkEvent } from '../src/lib/sync/echo-guard';
import { restoreBackup, runSync } from '../src/lib/sync/engine';
import { createdSignature, isInBar } from '../src/lib/sync/local';
import { getSettings, touchLocal } from '../src/lib/sync/state';

const ALARM = 'raindrop-pull';
const DEBOUNCE_MS = 2000;

export default defineBackground(() => {
  // Listeners must be registered synchronously at top level so the MV3 worker
  // is woken up for them.
  const onLocal = async (event: BookmarkEvent, echoId: string, id: string, ...barCheck: string[]) => {
    if (await consumeIfExpected(event, echoId)) return; // our own write
    const inBar = await Promise.all(barCheck.map((x) => isInBar(x)));
    if (!inBar.some(Boolean)) return; // e.g. "Other bookmarks"
    await touchLocal(id, await getBookmarksBarId());
    scheduleSync();
  };

  browser.bookmarks.onCreated.addListener(
    (id, node) => void onLocal('created', createdSignature(node.parentId, node.title, node.url), id, id),
  );
  browser.bookmarks.onChanged.addListener((id) => void onLocal('changed', id, id, id));
  // Moving out of the bar counts too: for sync it is a delete.
  browser.bookmarks.onMoved.addListener(
    (id, info) => void onLocal('moved', id, id, info.parentId, info.oldParentId),
  );
  browser.bookmarks.onRemoved.addListener((id, info) => void onLocal('removed', id, id, info.parentId));
  // Chrome only ("sort by name" in the bookmark manager); Firefox reports single moves instead.
  browser.bookmarks.onChildrenReordered?.addListener((id) => void onLocal('moved', id, id, id));

  // Back online: sync right away instead of waiting for the next alarm.
  globalThis.addEventListener?.('online', () => scheduleSync(1000));

  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARM) void runSync();
  });

  browser.runtime.onStartup.addListener(() => void setupAlarmAndSync());
  browser.runtime.onInstalled.addListener(() => void setupAlarmAndSync());

  // Messages from the options page.
  browser.runtime.onMessage.addListener((msg: { type: string; confirmed?: boolean; dryRun?: boolean; at?: number }) => {
    if (msg.type === 'sync-now') return runSync({ confirmed: msg.confirmed, dryRun: msg.dryRun });
    if (msg.type === 'restore' && msg.at !== undefined) return restoreBackup(msg.at);
    if (msg.type === 'settings-changed') return setupAlarmAndSync();
    return undefined;
  });
});

async function setupAlarmAndSync(): Promise<void> {
  const { pullIntervalMinutes } = await getSettings();
  await browser.alarms.create(ALARM, { periodInMinutes: Math.max(0.5, pullIntervalMinutes) });
  await runSync();
}

// setTimeout-based debounce is fine here: if the worker dies before it fires,
// the next alarm picks the change up because touchLocal() already persisted it.
let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync(delay = DEBOUNCE_MS): void {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    // A change made while another sync runs is picked up right after it, not a minute later.
    const out = await runSync();
    if (out.status === 'skipped' && out.reason === 'sync already running') scheduleSync(5000);
  }, delay);
}
