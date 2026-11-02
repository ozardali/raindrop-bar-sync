import { describe, expect, it } from 'vitest';
import {
  changedBy,
  deviceLabels,
  effectiveRemoteTimes,
  emptyDevices,
  mergeDevices,
  parseDevices,
  recordDevice,
  serializeDevices,
  type DevicesDoc,
} from '../src/lib/sync/devices';
import { merge } from '../src/lib/sync/merge';
import type { Snapshot } from '../src/lib/sync/types';
import { applyOps, bm, show, tree } from './helpers';

const DAY = 24 * 3600_000;
const firefox = { id: 'aaaa1111', name: 'Firefox on macOS' };
const helium = { id: 'bbbb2222', name: 'Chromium on macOS' };
const chrome = { id: 'cccc3333', name: 'Chromium on macOS' };
const sent = (keys: string[], at: number) => Object.fromEntries(keys.map((k) => [k, at]));

describe('devices record', () => {
  it('attributes a change to the other browser that sent it last', () => {
    let doc = recordDevice(emptyDevices(), firefox, sent(['r:1'], 1000), 1000);
    doc = recordDevice(doc, helium, sent(['r:2'], 2000), 2000);
    expect(changedBy(doc, 'r:1', helium.id)).toBe('Firefox on macOS');
    expect(changedBy(doc, 'r:2', helium.id)).toBeUndefined(); // own change
    expect(changedBy(doc, 'r:9', helium.id)).toBeUndefined(); // e.g. edited on raindrop.io
  });

  it('tells apart two browsers that report the same name', () => {
    let doc = recordDevice(emptyDevices(), helium, {}, 1);
    doc = recordDevice(doc, chrome, sent(['r:5'], 2), 2);
    doc = recordDevice(doc, firefox, {}, 3);
    const labels = deviceLabels(doc);
    expect(labels.get(helium.id)).toBe('Chromium on macOS · bbbb');
    expect(labels.get(chrome.id)).toBe('Chromium on macOS · cccc');
    expect(labels.get(firefox.id)).toBe('Firefox on macOS');
    expect(changedBy(doc, 'r:5', helium.id)).toBe('Chromium on macOS · cccc');
  });

  it('forgets old changes and long-gone devices', () => {
    let doc = recordDevice(emptyDevices(), firefox, sent(['r:1'], 0), 0);
    doc = recordDevice(doc, helium, {}, 20 * DAY);
    doc = recordDevice(doc, firefox, sent(['r:2'], 20 * DAY), 20 * DAY);
    expect(Object.keys(doc.devices[firefox.id]!.changes)).toEqual(['r:2']);
    doc = recordDevice(doc, helium, {}, 200 * DAY);
    expect(Object.keys(doc.devices)).toEqual([helium.id]);
  });

  it('always fits into a Raindrop note and survives a round trip', () => {
    let doc = emptyDevices();
    for (let d = 0; d < 6; d++) {
      const keys = Array.from({ length: 100 }, (_, i) => `r:${1910000000 + d * 1000 + i}`);
      doc = recordDevice(doc, { id: `device-${d}`, name: `Browser ${d}` }, sent(keys, 1793600000000 + d), 1793600000000 + d);
    }
    const note = serializeDevices(doc);
    expect(note.length).toBeLessThanOrEqual(9_500);
    expect(Object.keys(parseDevices(note).devices)).toHaveLength(6);
  });

  it('reads the early format that stored one time per key', () => {
    const doc = parseDevices(JSON.stringify({ v: 1, devices: { a: { name: 'A', seenAt: 5, changes: { 'r:1': 5 } } } }));
    expect(doc.devices.a!.changes['r:1']).toEqual([5, 5]);
  });

  it('merges duplicate records, keeping the most recent entry per device', () => {
    const a = recordDevice(emptyDevices(), firefox, sent(['r:1'], 10), 10);
    const b = recordDevice(recordDevice(emptyDevices(), firefox, sent(['r:2'], 20), 20), helium, {}, 5);
    const merged = mergeDevices(a, b);
    expect(merged.devices[firefox.id]!.seenAt).toBe(20);
    expect(Object.keys(merged.devices).sort()).toEqual([firefox.id, helium.id].sort());
  });

  it('falls back to an empty record on garbage', () => {
    expect(parseDevices('nope')).toEqual(emptyDevices());
  });
});

describe('effectiveRemoteTimes', () => {
  it('uses the recorded edit time when the last write was that sync', () => {
    const doc = recordDevice(emptyDevices(), firefox, { 'r:1': 100 }, 5000); // edited at 100, sent at 5000
    const times = effectiveRemoteTimes(new Map([['r:1', 5200], ['r:2', 5200]]), doc);
    expect(times.get('r:1')).toBe(100);
    expect(times.get('r:2')).toBe(5200); // not recorded: Raindrop's own time
  });

  it('keeps Raindrop time when the node changed again after the recorded sync', () => {
    const doc = recordDevice(emptyDevices(), firefox, { 'r:1': 100 }, 5000);
    // Edited on raindrop.io ten minutes later.
    expect(effectiveRemoteTimes(new Map([['r:1', 5000 + 600_000]]), doc).get('r:1')).toBe(605_000);
  });
});

/**
 * Two browsers start in sync, both edit while offline, then come online one after the other.
 * Simulates what each engine does: merge against Raindrop, write remote ops plus the devices
 * record, keep local ops.
 */
describe('offline edits on two browsers', () => {
  const base = tree(bm('r:1', 'Shared', 'https://s.test/'), bm('r:2', 'Other', 'https://o.test/'));

  function online(
    local: Snapshot,
    localTouchedAt: Record<string, number>,
    remote: { snap: Snapshot; updatedAt: Map<string, number>; devices: DevicesDoc },
    device: { id: string; name: string },
    now: number,
  ) {
    const result = merge({
      base,
      local,
      remote: remote.snap,
      localTouchedAt: new Map(Object.entries(localTouchedAt)),
      remoteUpdatedAt: effectiveRemoteTimes(remote.updatedAt, remote.devices),
    });
    const remoteOps = result.ops.filter((o) => o.target === 'remote');
    const snap = applyOps(remote.snap, result.ops, 'remote');
    const updatedAt = new Map(remote.updatedAt);
    const sentKeys: Record<string, number> = {};
    for (const o of remoteOps) {
      const k = o.type === 'create' ? o.node.key : o.key;
      updatedAt.set(k, now); // Raindrop stamps the time of the write
      sentKeys[k] = localTouchedAt[k] ?? now;
    }
    return { result, remote: { snap, updatedAt, devices: recordDevice(remote.devices, device, sentKeys, now) } };
  }

  // 10:00 Firefox (offline) renames Shared -> "Firefox title".
  // 10:05 Helium (offline) renames Shared -> "Helium title". Helium's edit is the newest.
  const MIN = 60_000;
  const firefoxLocal = tree(bm('r:1', 'Firefox title', 'https://s.test/'), bm('r:2', 'Other', 'https://o.test/'));
  const heliumLocal = tree(bm('r:1', 'Helium title', 'https://s.test/'), bm('r:2', 'Other', 'https://o.test/'));
  const start = { snap: base, updatedAt: new Map([['r:1', 0], ['r:2', 0]]), devices: emptyDevices() };

  it('the newest edit wins when the older one reaches Raindrop last', () => {
    // Helium comes online at 10:10, Firefox only at 10:30.
    const h = online(heliumLocal, { 'r:1': 5 * MIN }, start, helium, 10 * MIN);
    const f = online(firefoxLocal, { 'r:1': 0 }, h.remote, firefox, 30 * MIN);
    expect(show(f.result.newBase)).toBe('Helium title,Other');
  });

  it('the newest edit wins when it reaches Raindrop last', () => {
    // Firefox comes online first at 10:10, Helium at 10:30.
    const f = online(firefoxLocal, { 'r:1': 0 }, start, firefox, 10 * MIN);
    const h = online(heliumLocal, { 'r:1': 5 * MIN }, f.remote, helium, 30 * MIN);
    expect(show(h.result.newBase)).toBe('Helium title,Other');
  });

  it('without a devices record the older edit would win (the bug this fixes)', () => {
    // Firefox's 10:00 edit reaches Raindrop at 10:10; Helium compares its 10:05 edit with 10:10.
    const f = online(firefoxLocal, { 'r:1': 0 }, start, firefox, 10 * MIN);
    const h = online(heliumLocal, { 'r:1': 5 * MIN }, { ...f.remote, devices: emptyDevices() }, helium, 30 * MIN);
    expect(show(h.result.newBase)).toBe('Firefox title,Other');
  });
});
