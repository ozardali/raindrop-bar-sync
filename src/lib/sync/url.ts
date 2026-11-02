/**
 * URL normalization used ONLY for matching during the first merge (docs/architecture.md, "Merge").
 * The stored/synced URL is always the original, never the normalized one.
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return raw.trim();

  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  // Fragments are noise (anchors) except for hash-routed apps ("#/inbox", "#!/a").
  if (!/^#!?\//.test(u.hash)) u.hash = '';
  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
    u.port = '';
  }
  // Treat http and https as the same bookmark when matching.
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '';
  return `${u.hostname}${u.port ? `:${u.port}` : ''}${path}${u.search}${u.hash}`;
}

/** Schemes Raindrop rejects with 400 "url is invalid" (docs/raindrop-api.md). */
const UNSYNCABLE_SCHEMES = ['javascript:', 'file:', 'about:', 'data:', 'place:'];

/** False for links Raindrop is known to reject; such bookmarks stay local-only (docs/architecture.md). */
export function isSyncableUrl(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return !UNSYNCABLE_SCHEMES.some((scheme) => s.startsWith(scheme));
}
