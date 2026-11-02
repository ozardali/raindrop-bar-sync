import { describe, expect, it } from 'vitest';
import {
  ManifestTooLargeError,
  applyManifestOrder,
  parseManifest,
  serializeManifest,
} from '../src/lib/sync/order-manifest';

describe('order manifest', () => {
  const manifest = parseManifest(
    serializeManifest({ v: 2, updatedAt: '2026-01-01T00:00:00Z', children: ['c:1', 'r:2', 'r:3'] }),
  );

  it('orders children by the manifest', () => {
    expect(applyManifestOrder(['r:3', 'r:2', 'c:1'], manifest)).toEqual(['c:1', 'r:2', 'r:3']);
  });

  it('appends children unknown to the manifest', () => {
    expect(applyManifestOrder(['r:9', 'r:3', 'c:1'], manifest)).toEqual(['c:1', 'r:3', 'r:9']);
  });

  it('ignores manifest entries that no longer exist', () => {
    expect(applyManifestOrder(['r:2'], manifest)).toEqual(['r:2']);
  });

  it('falls back to an empty manifest on garbage', () => {
    expect(parseManifest('not json').children).toEqual([]);
  });

  it('falls back to an empty manifest on the old v1 format', () => {
    expect(parseManifest(JSON.stringify({ v: 1, updatedAt: '', folders: { root: ['r:1'] } })).children).toEqual([]);
  });

  it('refuses to serialize a manifest Raindrop would truncate', () => {
    const children = Array.from({ length: 700 }, (_, i) => `r:${1910919000 + i}`);
    expect(() => serializeManifest({ v: 2, updatedAt: '2026-01-01T00:00:00Z', children })).toThrow(
      ManifestTooLargeError,
    );
  });
});
