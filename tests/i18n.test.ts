import { describe, expect, it } from 'vitest';
import { LANGUAGES, matchLanguage, translator } from '../src/i18n';
import en from '../src/i18n/locales/en';
import type { Message, MessageKey } from '../src/i18n/types';

const placeholders = (m: Message) =>
  [...new Set((typeof m === 'string' ? [m] : Object.values(m)).flatMap((s) => [...s!.matchAll(/\{(\w+)\}/g)].map((x) => x[1])))].sort();

describe('translations', () => {
  it.each(LANGUAGES.map((l) => [l.code, l.messages] as const))('%s uses the same placeholders as English', (_code, messages) => {
    for (const key of Object.keys(en) as MessageKey[]) {
      // A plural form may leave out {n} ("Show change"), so compare the union over all forms.
      expect(placeholders(messages[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it.each(LANGUAGES.map((l) => [l.code, l.messages] as const))('%s has no empty or untranslated-looking strings', (_code, messages) => {
    for (const key of Object.keys(en) as MessageKey[]) {
      const m = messages[key];
      for (const s of typeof m === 'string' ? [m] : Object.values(m)) expect(s!.trim(), key).not.toBe('');
    }
  });
});

describe('translator', () => {
  it('picks plural forms per language', () => {
    const ru = translator('ru');
    expect(ru.t('common.bookmarks', { n: 1 })).toBe('1 закладка');
    expect(ru.t('common.bookmarks', { n: 3 })).toBe('3 закладки');
    expect(ru.t('common.bookmarks', { n: 5 })).toBe('5 закладок');
    expect(translator('ja').t('common.bookmarks', { n: 5 })).toBe('ブックマーク 5 件');
    expect(translator('en').t('common.bookmarks', { n: 1 })).toBe('1 bookmark');
  });

  it('renders stored messages, nested messages and dates in the reader’s language', () => {
    const stored = { k: 'act.addedLocal', p: { title: { k: 'common.quoted', p: { text: 'GitHub' } } } } as const;
    expect(translator('de').m(stored)).toBe('Hier hinzugefügt: „GitHub“');
    expect(translator('tr').m(stored)).toBe('Buraya eklendi: “GitHub”');
    const restored = translator('en').m({ k: 'act.restored', p: { date: Date.UTC(2026, 10, 2, 12), n: 3 } });
    expect(restored).toMatch(/^Restored this browser's bar to .*2026.* \(3 changes\)$/);
  });

  it('keeps legacy plain-text log entries as they are', () => {
    expect(translator('ja').m('Synced: 1 change sent to Raindrop')).toBe('Synced: 1 change sent to Raindrop');
  });

  it('maps browser languages to a supported one', () => {
    expect(matchLanguage('tr-TR')).toBe('tr');
    expect(matchLanguage('pt-PT')).toBe('pt');
    expect(matchLanguage('zh-TW')).toBe('zh_TW');
    expect(matchLanguage('zh-HK')).toBe('zh_TW');
    expect(matchLanguage('zh-CN')).toBe('zh');
    expect(matchLanguage('de_AT')).toBe('de');
    expect(matchLanguage('xx')).toBe('en');
  });
});
