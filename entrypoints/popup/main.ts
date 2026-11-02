import '../../src/ui/theme.css';
import { browser } from 'wxt/browser';
import { getDevice } from '../../src/lib/device';
import type { SyncOutcome } from '../../src/lib/sync/engine';
import type { Translator } from '../../src/i18n';
import { localizePage, statusDetail } from '../../src/ui/i18n';
import { countItems, getSyncStatus, raindropCollectionUrl } from '../../src/ui/status';

let tr: Translator;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pill = $<HTMLSpanElement>('pill');
const notice = $<HTMLDivElement>('notice');
const syncBtn = $<HTMLButtonElement>('sync');

const openSettings = () => {
  void browser.runtime.openOptionsPage();
  window.close();
};
$('settings').addEventListener('click', openSettings);
$('setup-btn').addEventListener('click', openSettings);

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.replaceChildren(Object.assign(document.createElement('span'), { className: 'spinner' }), ` ${tr.t('action.syncing')}`);
  const out = (await browser.runtime.sendMessage({ type: 'sync-now' })) as SyncOutcome;
  syncBtn.disabled = false;
  syncBtn.textContent = tr.t('action.syncNow');
  await render(out.status === 'error' ? tr.m(out.error) : undefined);
});

async function render(error?: string) {
  const status = await getSyncStatus();
  const { settings, state } = status;

  pill.className = `pill ${status.kind === 'setup' ? '' : status.kind}`;
  pill.textContent = tr.t(status.label);

  const configured = status.kind !== 'setup';
  $('setup').hidden = configured;
  $('details').hidden = !configured;
  $('actions').hidden = !configured;
  syncBtn.disabled = status.kind === 'busy' && !!state.lastSyncAt;

  const message = error ?? statusDetail(tr, status);
  notice.hidden = !message;
  notice.className = `notice ${status.kind === 'warn' ? 'warn' : 'error'}`;
  notice.textContent = message ?? '';
  if (status.paused) {
    const review = document.createElement('a');
    review.href = '#';
    review.textContent = ` ${tr.t('popup.review')}`;
    review.addEventListener('click', (e) => {
      e.preventDefault();
      openSettings();
    });
    notice.append(review);
  }

  if (configured) {
    const link = $<HTMLAnchorElement>('collection');
    link.textContent = settings.rootCollectionTitle || `#${settings.rootCollectionId}`;
    link.href = raindropCollectionUrl(settings.rootCollectionId!);
    $('last-sync').textContent = tr.ago(state.lastSyncAt);
    const { folders, bookmarks } = countItems(state);
    $('items').textContent = `${tr.t('common.bookmarks', { n: bookmarks })} · ${tr.t('common.folders', { n: folders })}`;
    $('device').textContent = (await getDevice()).name;
    const lastSync = state.activity.find((e) => e.kind === 'sync');
    const first = lastSync?.details?.[0] ?? lastSync?.msg ?? lastSync?.message;
    $('last-change-row').hidden = !first;
    $('last-change').textContent = first ? tr.m(first) : '';
    const summary = lastSync?.msg ?? lastSync?.message;
    $('last-change').title = lastSync && summary ? `${tr.m(summary)} (${tr.ago(lastSync.at)})` : '';
  }
}

void (async () => {
  tr = await localizePage();
  await render();
  // Live updates while the popup is open (sync finishing in the background, errors, …).
  browser.storage.onChanged.addListener(() => void render());
})();
