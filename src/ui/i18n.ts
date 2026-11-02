import { browser } from 'wxt/browser';
import { localizeDocument, resolveLanguage, translator, type Translator } from '../i18n';
import { getSettings } from '../lib/sync/state';
import type { SyncStatus } from './status';

/** The translator for the language chosen in settings ("auto" = browser language). */
export async function currentTranslator(): Promise<Translator> {
  const { language } = await getSettings();
  return translator(resolveLanguage(language, browser.i18n.getUILanguage()));
}

/** Translates the static page and returns the translator for dynamic text. */
export async function localizePage(): Promise<Translator> {
  const tr = await currentTranslator();
  localizeDocument(tr);
  return tr;
}

/** Status detail text, including the offline explanation that needs a formatted time. */
export function statusDetail(tr: Translator, status: SyncStatus): string | undefined {
  if (status.label === 'status.offline' && status.state.offlineSince) {
    return tr.t('status.offlineDetail', { time: tr.clock(status.state.offlineSince) });
  }
  return status.detail === undefined ? undefined : tr.m(status.detail);
}
