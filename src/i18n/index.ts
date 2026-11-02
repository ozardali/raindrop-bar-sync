/**
 * UI translations for the popup and the options page. The background never translates: it
 * stores `Msg` objects that are rendered in whatever language is chosen when they are read.
 * Languages are the ones the Raindrop.io app offers (raindropio/app src/assets/languages).
 */
import type { Message, MessageKey, Messages, Msg, MsgParam } from './types';
import de from './locales/de';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import hi from './locales/hi';
import it from './locales/it';
import ja from './locales/ja';
import ko from './locales/ko';
import nl from './locales/nl';
import pl from './locales/pl';
import pt from './locales/pt';
import ru from './locales/ru';
import sv from './locales/sv';
import tr from './locales/tr';
import zh from './locales/zh';
import zhTW from './locales/zh_TW';

export type { Msg, MessageKey } from './types';
export { msg } from './types';

/** Code, native name, BCP 47 tag for Intl, messages. */
export const LANGUAGES = [
  { code: 'en', name: 'English', tag: 'en', messages: en },
  { code: 'de', name: 'Deutsch', tag: 'de', messages: de },
  { code: 'es', name: 'Español', tag: 'es', messages: es },
  { code: 'fr', name: 'Français', tag: 'fr', messages: fr },
  { code: 'hi', name: 'हिन्दी', tag: 'hi', messages: hi },
  { code: 'it', name: 'Italiano', tag: 'it', messages: it },
  { code: 'ja', name: '日本語', tag: 'ja', messages: ja },
  { code: 'ko', name: '한국어', tag: 'ko', messages: ko },
  { code: 'nl', name: 'Nederlands', tag: 'nl', messages: nl },
  { code: 'pl', name: 'Polski', tag: 'pl', messages: pl },
  { code: 'pt', name: 'Português (Brasil)', tag: 'pt-BR', messages: pt },
  { code: 'ru', name: 'Русский', tag: 'ru', messages: ru },
  { code: 'sv', name: 'Svenska', tag: 'sv', messages: sv },
  { code: 'tr', name: 'Türkçe', tag: 'tr', messages: tr },
  { code: 'zh', name: '中文（简体）', tag: 'zh-Hans', messages: zh },
  // Two Chinese variants need two codes; Traditional gets the region suffix.
  { code: 'zh_TW', name: '中文（繁體）', tag: 'zh-Hant', messages: zhTW },
] as const satisfies readonly { code: string; name: string; tag: string; messages: Messages }[];

export type LangCode = (typeof LANGUAGES)[number]['code'];
export type LanguageSetting = LangCode | 'auto';

/** Picks the supported language closest to a browser UI language such as "pt-PT" or "zh-TW". */
export function matchLanguage(uiLanguage: string): LangCode {
  const tag = uiLanguage.replace('_', '-').toLowerCase();
  if (tag.startsWith('zh')) {
    return /^zh-(tw|hk|mo|hant)/.test(tag) ? 'zh_TW' : 'zh';
  }
  if (tag.startsWith('pt')) return 'pt';
  const base = tag.split('-')[0];
  return LANGUAGES.find((l) => l.code === base)?.code ?? 'en';
}

export interface Translator {
  lang: LangCode;
  /** BCP 47 tag for Intl and <html lang>. */
  tag: string;
  t(key: MessageKey, params?: Record<string, MsgParam>): string;
  /** Renders a stored message (or a legacy plain string). */
  m(message: Msg | string): string;
  /** Like t(), but DOM nodes can be passed as parameters (links, inputs). */
  fragment(key: MessageKey, params: Record<string, MsgParam | Node>): DocumentFragment;
  /** "5 minutes ago", "jetzt", "3日前"… */
  ago(at: number | null, now?: number): string;
  date(at: number): string;
  clock(at: number): string;
  list(items: string[]): string;
}

export function translator(lang: LangCode): Translator {
  const entry = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  const messages: Messages = entry.messages;
  const plurals = new Intl.PluralRules(entry.tag);
  const relative = new Intl.RelativeTimeFormat(entry.tag, { numeric: 'auto' });
  const lists = new Intl.ListFormat(entry.tag, { style: 'long', type: 'conjunction' });

  const pick = (message: Message, n: unknown): string =>
    typeof message === 'string' ? message : (message[plurals.select(Number(n) || 0)] ?? message.other);

  const self: Translator = {
    lang: entry.code,
    tag: entry.tag,
    t(key, params = {}) {
      const template = pick(messages[key] ?? en[key], params.n);
      return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const value = params[name];
        if (value === undefined) return whole;
        if (typeof value === 'object') return self.m(value);
        // Stored messages keep timestamps as numbers so they are formatted for the reader.
        if (name === 'date' && typeof value === 'number') return self.date(value);
        return String(value);
      });
    },
    m(message) {
      return typeof message === 'string' ? message : self.t(message.k, message.p);
    },
    fragment(key, params) {
      const marker = '\u0000';
      const nodes: Node[] = [];
      const text = self.t(
        key,
        Object.fromEntries(
          Object.entries(params).map(([name, v]) => {
            if (v instanceof Node) {
              nodes.push(v);
              return [name, `${marker}${nodes.length - 1}${marker}`];
            }
            return [name, v];
          }),
        ),
      );
      const out = document.createDocumentFragment();
      text.split(marker).forEach((part, i) => {
        out.append(i % 2 ? nodes[Number(part)]! : document.createTextNode(part));
      });
      return out;
    },
    ago(at, now = Date.now()) {
      if (!at) return self.t('time.never');
      const s = Math.round((now - at) / 1000);
      if (s < 45) return relative.format(0, 'second');
      const m = Math.round(s / 60);
      if (m < 60) return relative.format(-m, 'minute');
      const h = Math.round(m / 60);
      if (h < 24) return relative.format(-h, 'hour');
      const d = Math.round(h / 24);
      if (d < 7) return relative.format(-d, 'day');
      return new Date(at).toLocaleDateString(entry.tag);
    },
    date: (at) => new Date(at).toLocaleString(entry.tag),
    clock: (at) => new Date(at).toLocaleTimeString(entry.tag, { hour: '2-digit', minute: '2-digit' }),
    list: (items) => lists.format(items),
  };
  return self;
}

/** Resolves the saved setting ("auto" = the browser's UI language). */
export function resolveLanguage(setting: LanguageSetting | undefined, uiLanguage: string): LangCode {
  return setting && setting !== 'auto' ? setting : matchLanguage(uiLanguage);
}

/** Fills elements marked with data-i18n / data-i18n-placeholder / data-i18n-title. */
export function localizeDocument(tr: Translator, root: ParentNode = document): void {
  if (root === document) document.documentElement.lang = tr.tag;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = tr.t(el.dataset.i18n as MessageKey);
  });
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = tr.t(el.dataset.i18nPlaceholder as MessageKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = tr.t(el.dataset.i18nTitle as MessageKey);
  });
}
