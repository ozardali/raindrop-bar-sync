import { describe, expect, it } from 'vitest';
import { isSyncableUrl, normalizeUrl } from '../src/lib/sync/url';

describe('normalizeUrl', () => {
  it('ignores scheme, www, trailing slash and fragment', () => {
    expect(normalizeUrl('https://www.Laravel.com/docs/#install')).toBe(normalizeUrl('http://laravel.com/docs'));
  });

  it('keeps query strings', () => {
    expect(normalizeUrl('https://a.com/x?y=1')).not.toBe(normalizeUrl('https://a.com/x?y=2'));
  });

  it('drops default ports', () => {
    expect(normalizeUrl('https://a.com:443/x')).toBe(normalizeUrl('https://a.com/x'));
  });

  it('leaves non-http urls untouched', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});

describe('isSyncableUrl', () => {
  it('rejects schemes Raindrop refuses', () => {
    for (const u of ['javascript:alert(1)', 'JavaScript:void(0)', 'file:///a.html', 'about:blank', 'data:text/html,hi', 'place:sort=8']) {
      expect(isSyncableUrl(u)).toBe(false);
    }
  });

  it('accepts web and browser-internal urls Raindrop stores', () => {
    for (const u of ['https://a.com', 'http://a.com', 'chrome://settings', 'edge://flags']) {
      expect(isSyncableUrl(u)).toBe(true);
    }
  });
});

describe('normalizeUrl: hash routes', () => {
  it('keeps hash routes so different app pages do not match', () => {
    expect(normalizeUrl('https://app.com/#/inbox')).not.toBe(normalizeUrl('https://app.com/#/settings'));
    expect(normalizeUrl('https://app.com/#!/a')).not.toBe(normalizeUrl('https://app.com/#!/b'));
  });
});
