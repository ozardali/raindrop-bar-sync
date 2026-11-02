import '../../src/ui/theme.css';
import { browser } from 'wxt/browser';
import { LANGUAGES, matchLanguage, type LanguageSetting, type Translator } from '../../src/i18n';
import { msg, type Msg } from '../../src/i18n/types';
import { getDevice, renameDevice } from '../../src/lib/device';
import { RaindropAuthError, RaindropClient } from '../../src/lib/raindrop/client';
import type { ActivityEntry } from '../../src/lib/sync/activity';
import { deviceLabels, type DevicesDoc } from '../../src/lib/sync/devices';
import type { SyncOutcome } from '../../src/lib/sync/engine';
import { readLocalSnapshot } from '../../src/lib/sync/local';
import { readRemoteSnapshot } from '../../src/lib/sync/remote';
import { clearActivity, getSettings, getState, resetSyncState, saveSettings, type SyncState } from '../../src/lib/sync/state';
import type { MergeResult } from '../../src/lib/sync/types';
import { localizePage, statusDetail } from '../../src/ui/i18n';
import { countItems, getSyncStatus } from '../../src/ui/status';
import { collectionTree, renderSnapshot, summarizeSnapshot } from './tree';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tokenEl = $<HTMLInputElement>('token');
const connectionEl = $<HTMLDivElement>('connection');
const collectionEl = $<HTMLSelectElement>('collection');
const newCollectionEl = $<HTMLButtonElement>('new-collection');
const intervalEl = $<HTMLInputElement>('interval');
const syncEl = $<HTMLButtonElement>('sync');
const resultEl = $<HTMLDivElement>('result');
const languageEl = $<HTMLSelectElement>('language');

let tr: Translator;
const client = () => new RaindropClient(async () => tokenEl.value.trim());

async function init() {
  tr = await localizePage();
  renderStaticParts();

  const s = await getSettings();
  tokenEl.value = s.token;
  // First-time setup: show how to get a token right away.
  $<HTMLDetailsElement>('token-guide').open = !s.token;
  intervalEl.value = String(s.pullIntervalMinutes);
  renderLanguages(s.language);
  if (s.token) {
    try {
      await loadCollections(s.rootCollectionId);
    } catch (e) {
      setConnection('error', errorText(e));
    }
  }
  await renderStatus();
}

/** Texts that contain elements (a link, an input) and so cannot use data-i18n. */
function renderStaticParts() {
  const link = el('a', '', tr.t('account.link'));
  link.href = 'https://app.raindrop.io/settings/integrations';
  link.target = '_blank';
  link.rel = 'noreferrer';
  $('account-help').textContent = tr.t('account.help');
  $('guide-step1').replaceChildren(tr.fragment('guide.step1', { link }));
  $('interval-label').replaceChildren(tr.fragment('sync.interval', { input: intervalEl }));
}

// ---------- language ----------

function renderLanguages(selected: LanguageSetting) {
  const detected = LANGUAGES.find((l) => l.code === matchLanguage(browser.i18n.getUILanguage()))!;
  languageEl.replaceChildren(
    new Option(tr.t('lang.auto', { language: detected.name }), 'auto', false, selected === 'auto'),
    ...LANGUAGES.map((l) => new Option(l.name, l.code, false, l.code === selected)),
  );
}

languageEl.addEventListener('change', async () => {
  await saveSettings({ language: languageEl.value as LanguageSetting });
  location.reload();
});

// ---------- 1. account ----------

$('connect').addEventListener('click', async () => {
  // Firefox MV3 does not grant host permissions at install time (docs/architecture.md, "Browser differences").
  const granted = await browser.permissions.request({ origins: ['https://api.raindrop.io/*'] });
  if (!granted) return setConnection('error', tr.t('account.denied'));
  setConnection('', tr.t('account.connecting'));
  try {
    const user = await client().getUser();
    await saveSettings({ token: tokenEl.value.trim() });
    await loadCollections((await getSettings()).rootCollectionId);
    setConnection('ok', tr.t('account.connected', { name: user.fullName ?? user.email ?? `#${user._id}` }));
    $<HTMLDetailsElement>('token-guide').open = false;
  } catch (e) {
    setConnection('error', tr.t('account.failed', { error: errorText(e) }));
  }
  await renderStatus();
});

tokenEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('connect').click();
});

function setConnection(kind: '' | 'ok' | 'error', text: string) {
  connectionEl.className = `meta small ${kind}`;
  connectionEl.textContent = text;
}

// ---------- 2. collection ----------

async function loadCollections(selected: number | null) {
  const tree = collectionTree(await client().getAllCollections());
  const placeholder = new Option(tr.t('collection.choose'), '', selected === null, selected === null);
  placeholder.disabled = true;
  collectionEl.replaceChildren(
    placeholder,
    ...tree.map(({ collection: c, depth }) => {
      const option = new Option(
        `${'    '.repeat(depth)}${c.title} (${c.count ?? 0})`,
        String(c._id),
        false,
        c._id === selected,
      );
      option.dataset.title = c.title;
      return option;
    }),
  );
  collectionEl.disabled = false;
  newCollectionEl.disabled = false;

  // Fill in the display name for setups saved before it was stored.
  const current = tree.find((t) => t.collection._id === selected)?.collection;
  if (current && current.title !== (await getSettings()).rootCollectionTitle) {
    await saveSettings({ rootCollectionTitle: current.title });
  }
}

collectionEl.addEventListener('change', () => {
  void selectCollection(Number(collectionEl.value), collectionEl.selectedOptions[0]?.dataset.title ?? '');
});

newCollectionEl.addEventListener('click', async () => {
  const title = prompt(tr.t('collection.newPrompt'), tr.t('collection.newDefault'))?.trim();
  if (!title) return;
  try {
    const c = await client().createCollection({ title });
    await loadCollections(c._id);
    await selectCollection(c._id, c.title);
  } catch (e) {
    showResult(tr.t('collection.createFailed', { error: errorText(e) }));
  }
});

async function selectCollection(id: number, title: string) {
  if (id !== (await getSettings()).rootCollectionId) {
    // A different collection means a fresh first-sync merge.
    await resetSyncState();
  }
  await saveSettings({ rootCollectionId: id, rootCollectionTitle: title, enabled: true });
  await browser.runtime.sendMessage({ type: 'settings-changed' });
  await renderStatus();
}

// ---------- 3. sync ----------

intervalEl.addEventListener('change', async () => {
  const minutes = Math.min(30, Math.max(1, Number(intervalEl.value) || 1));
  intervalEl.value = String(minutes);
  await saveSettings({ pullIntervalMinutes: minutes });
  await browser.runtime.sendMessage({ type: 'settings-changed' });
});

$('preview').addEventListener('click', async () => {
  showResult(tr.t('sync.comparing'));
  const out = (await browser.runtime.sendMessage({ type: 'sync-now', dryRun: true })) as SyncOutcome;
  showResult(out.status === 'needs-confirmation' ? `${tr.t('sync.ifNow')}\n${changes(out.result.summary)}` : describe(out));
});

syncEl.addEventListener('click', async () => {
  syncEl.disabled = true;
  syncEl.replaceChildren(el('span', 'spinner'), ` ${tr.t('action.syncing')}`);
  try {
    let out = (await browser.runtime.sendMessage({ type: 'sync-now' })) as SyncOutcome;
    if (out.status === 'needs-confirmation') {
      const reason = out.pause ? tr.m(out.pause) : '';
      if (!confirm(tr.t('sync.confirm', { reason, changes: changes(out.result.summary) }))) {
        return showResult(tr.t('sync.cancelled'));
      }
      out = (await browser.runtime.sendMessage({ type: 'sync-now', confirmed: true })) as SyncOutcome;
    }
    showResult(describe(out));
  } finally {
    syncEl.textContent = tr.t('action.syncNow');
    await renderStatus();
    if (treesCard.open) await renderTrees();
  }
});

function changes(s: MergeResult['summary']): string {
  const side = (key: 'changes.thisBrowser' | 'changes.raindrop', c: MergeResult['summary']['local']) => {
    const parts = [
      c.create && tr.t('changes.added', { n: c.create }),
      c.update && tr.t('changes.edited', { n: c.update }),
      c.move && tr.t('changes.moved', { n: c.move }),
      c.delete && tr.t('changes.deleted', { n: c.delete }),
    ].filter((p): p is string => !!p);
    return tr.t(key, { parts: parts.length ? tr.list(parts) : tr.t('changes.none') });
  };
  return [side('changes.thisBrowser', s.local), side('changes.raindrop', s.remote)].join('\n');
}

function describe(out: SyncOutcome): string {
  switch (out.status) {
    case 'ok':
      return `${tr.t('sync.done')}\n${changes(out.result.summary)}`;
    case 'needs-confirmation':
      return changes(out.result.summary);
    case 'skipped':
      return tr.t(out.reason === 'not configured' ? 'sync.notConfigured' : 'sync.alreadyRunning');
    case 'error':
      return tr.t('sync.failed', { error: tr.m(out.error) });
  }
}

function showResult(text: string) {
  resultEl.textContent = text;
}

// ---------- status ----------

async function renderStatus() {
  const status = await getSyncStatus();
  const { settings, state } = status;

  const pill = $<HTMLSpanElement>('pill');
  pill.className = `pill ${status.kind === 'setup' ? '' : status.kind}`;
  pill.textContent = tr.t(status.label);

  const steps: [string, boolean][] = [
    ['step-1', !!settings.token],
    ['step-2', settings.rootCollectionId !== null],
    ['step-3', !!state.lastSyncAt],
  ];
  steps.forEach(([id, done], i) => {
    $(id).className = `step ${done ? 'done' : ''}`;
    $(id).textContent = done ? '✓' : String(i + 1);
  });

  $('last-sync').textContent = tr.ago(state.lastSyncAt);
  const { folders, bookmarks } = countItems(state);
  $('count-bookmarks').textContent = state.base ? String(bookmarks) : '–';
  $('count-folders').textContent = state.base ? String(folders) : '–';

  const notice = $<HTMLDivElement>('notice');
  const unsyncable = Object.keys(state.unsyncable).length;
  const detail = statusDetail(tr, status);
  const message = status.paused
    ? `${detail} ${tr.t('sync.pausedHint')}`
    : (detail ?? (unsyncable ? tr.t('sync.unsyncable', { n: unsyncable }) : undefined));
  notice.hidden = !message;
  notice.className = `notice ${status.kind === 'warn' ? 'warn' : status.kind === 'error' ? 'error' : 'info'}`;
  notice.textContent = message ?? '';
  syncEl.disabled = status.kind === 'setup' || status.kind === 'busy';

  await renderDevices(state.devices);
  renderBackups(state.backups);
  renderLog(state.activity);
}

// ---------- backups ----------

function renderBackups(backups: SyncState['backups']) {
  $('backup-count').textContent = backups.length ? `· ${backups.length}` : '';
  $('backups').replaceChildren(
    ...(backups.length
      ? backups.map((b) => {
          const li = el('li');
          const folders = b.snapshot.nodes.filter((n) => n.kind === 'folder').length;
          const size = tr.t('backups.size', {
            bookmarks: msg('common.bookmarks', { n: b.snapshot.nodes.length - folders }),
            folders: msg('common.folders', { n: folders }),
            time: tr.ago(b.at),
          });
          const restore = el('button', 'btn', tr.t('backups.restore'));
          restore.addEventListener('click', () => void restoreTo(b.at, restore));
          li.append(el('span', 'name', tr.date(b.at)), el('span', 'muted small', size), restore);
          return li;
        })
      : [el('li', 'muted small', tr.t('backups.empty'))]),
  );
}

async function restoreTo(at: number, button: HTMLButtonElement) {
  if (!confirm(tr.t('backups.confirm', { date: at }))) return;
  button.disabled = true;
  button.replaceChildren(el('span', 'spinner'));
  try {
    const out = (await browser.runtime.sendMessage({ type: 'restore', at })) as SyncOutcome;
    showResult(out.status === 'needs-confirmation' ? tr.t('backups.restoredPaused') : `${tr.t('backups.restored')}\n${describe(out)}`);
  } finally {
    await renderStatus();
  }
}

// ---------- activity ----------

const LOG_ICONS: Record<ActivityEntry['kind'], string> = { sync: '✓', warn: '!', paused: 'Ⅱ', error: '✕' };

function renderLog(activity: ActivityEntry[]) {
  $('log-count').textContent = activity.length ? `· ${activity.length}` : '';
  $<HTMLButtonElement>('log-clear').hidden = !activity.length;
  const log = $<HTMLUListElement>('log');
  if (!activity.length) {
    log.replaceChildren(el('li', 'empty', tr.t('activity.empty')));
    return;
  }
  log.replaceChildren(
    ...activity.map((e) => {
      const li = el('li', e.kind);
      const text = e.msg ?? e.message ?? '';
      const message = el('span', 'msg', tr.m(text));
      if ((e.count ?? 1) > 1) message.append(el('span', 'count', `×${e.count}`));
      const time = el('time', '', tr.ago(e.at));
      time.title = tr.date(e.at);
      li.append(el('span', 'icon', LOG_ICONS[e.kind]), message, time);
      if (e.details?.length) {
        const details = el('details');
        details.append(el('summary', '', tr.t('activity.show', { n: e.details.length })));
        const list = el('ul');
        list.append(...e.details.map((d: Msg | string) => el('li', '', tr.m(d))));
        details.append(list);
        li.append(details);
      }
      return li;
    }),
  );
}

$('log-clear').addEventListener('click', () => void clearActivity());

// ---------- devices ----------

const deviceNameEl = $<HTMLInputElement>('device-name');

async function renderDevices(doc: DevicesDoc | null) {
  const me = await getDevice();
  if (document.activeElement !== deviceNameEl) {
    deviceNameEl.value = me.custom ? me.name : '';
    deviceNameEl.placeholder = me.custom ? '' : me.name;
  }
  const records = doc?.devices ?? {};
  const labels = deviceLabels(doc ?? { v: 1, devices: {} });
  const ids = Object.keys(records).sort((a, b) => records[b]!.seenAt - records[a]!.seenAt);
  if (!ids.includes(me.id)) ids.unshift(me.id);
  $('devices').replaceChildren(
    ...ids.map((id) => {
      const li = el('li');
      li.append(el('span', 'name', id === me.id ? me.name : (labels.get(id) ?? id)));
      if (id === me.id) li.append(el('span', 'you', tr.t('devices.you')));
      const seen = records[id]?.seenAt;
      li.append(el('span', 'muted small', seen ? tr.t('devices.synced', { time: tr.ago(seen) }) : tr.t('devices.notYet')));
      return li;
    }),
  );
}

$('device-save').addEventListener('click', async () => {
  await renameDevice(deviceNameEl.value);
  deviceNameEl.blur();
  await renderStatus();
  // Share the new name right away.
  void browser.runtime.sendMessage({ type: 'sync-now' });
});
deviceNameEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('device-save').click();
});

// ---------- inspect ----------

const treesCard = $('refresh-trees').closest('details')!;
treesCard.addEventListener('toggle', () => {
  if (treesCard.open) void renderTrees();
});
$('refresh-trees').addEventListener('click', () => void renderTrees());

/** Reads both sides and shows them next to each other. Read-only. */
async function renderTrees() {
  const localTree = $<HTMLUListElement>('local-tree');
  const remoteTree = $<HTMLUListElement>('remote-tree');
  const localSummary = $<HTMLDivElement>('local-summary');
  const remoteSummary = $<HTMLDivElement>('remote-summary');

  const state = await getState();
  try {
    const { snapshot } = await readLocalSnapshot(state.nativeToKey, state.unsyncable);
    renderSnapshot(localTree, snapshot, tr);
    localSummary.textContent = summarizeSnapshot(snapshot, tr);
  } catch (e) {
    localTree.replaceChildren();
    localSummary.textContent = tr.t('inspect.localFailed', { error: errorText(e) });
  }

  const { token, rootCollectionId } = await getSettings();
  if (!token || rootCollectionId === null) {
    remoteTree.replaceChildren();
    remoteSummary.textContent = tr.t('sync.notConfigured');
    return;
  }
  remoteSummary.textContent = tr.t('inspect.loading');
  try {
    const { snapshot } = await readRemoteSnapshot(client(), rootCollectionId);
    renderSnapshot(remoteTree, snapshot, tr);
    remoteSummary.textContent = summarizeSnapshot(snapshot, tr);
  } catch (e) {
    remoteTree.replaceChildren();
    remoteSummary.textContent = tr.t('inspect.remoteFailed', { error: errorText(e) });
  }
}

// ---------- helpers ----------

function errorText(e: unknown): string {
  return e instanceof RaindropAuthError ? tr.t('common.tokenInvalid') : String(e instanceof Error ? e.message : e);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

void init().then(() => {
  browser.storage.onChanged.addListener(() => void renderStatus());
  setInterval(() => void renderStatus(), 30_000); // keeps "x min ago" fresh
});
