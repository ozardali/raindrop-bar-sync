import type { NodeKey } from './types';

/**
 * Raindrop cannot store the interleaved order of folders and bookmarks, so every synced
 * collection keeps the order of its own direct children in the `note` of a special raindrop.
 * One manifest per folder because `note` is silently truncated at 10 000 chars. See docs/architecture.md.
 */
export const MANIFEST_LINK = 'https://raindrop-bar-sync.invalid/manifest';
export const MANIFEST_TITLE = '⚙ bar-sync manifest';

/** Raindrop truncates `note` at 10 000 chars (docs/raindrop-api.md); keep a safety margin. */
export const MANIFEST_MAX_LENGTH = 9_500;

export interface OrderManifest {
  v: 2;
  updatedAt: string;
  /** Ordered keys ("c:<id>" | "r:<id>") of the folder's direct children. */
  children: NodeKey[];
}

export class ManifestTooLargeError extends Error {}

export function emptyManifest(): OrderManifest {
  return { v: 2, updatedAt: new Date(0).toISOString(), children: [] };
}

export function parseManifest(note: string | undefined): OrderManifest {
  if (!note) return emptyManifest();
  try {
    const m = JSON.parse(note) as OrderManifest;
    return m?.v === 2 && Array.isArray(m.children) ? m : emptyManifest();
  } catch {
    return emptyManifest();
  }
}

export function serializeManifest(m: OrderManifest): string {
  const s = JSON.stringify(m);
  if (s.length > MANIFEST_MAX_LENGTH) {
    throw new ManifestTooLargeError(`Order manifest is ${s.length} chars (max ${MANIFEST_MAX_LENGTH})`);
  }
  return s;
}

/**
 * Orders `childKeys` according to the manifest. Children not listed in the manifest
 * (e.g. added from the Raindrop web app) are appended in their existing relative order.
 */
export function applyManifestOrder(childKeys: NodeKey[], manifest: OrderManifest): NodeKey[] {
  const present = new Set(childKeys);
  const ordered = manifest.children.filter((k) => present.has(k));
  const seen = new Set(ordered);
  return [...ordered, ...childKeys.filter((k) => !seen.has(k))];
}
