import { beforeEach, describe, expect, it } from 'vitest';
import { merge } from '../src/lib/sync/merge';
import { ROOT_KEY, type NodeKey, type Snapshot } from '../src/lib/sync/types';
import { canonical } from './helpers';
import { clone, edit, prng } from './random';

// applyLocalOps against an in-memory bookmarks API that mimics Chrome's and Firefox's
// different `move` index semantics and Firefox separators.

type Flavor = 'chrome' | 'firefox';
interface MockNode {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  type?: 'separator';
  children?: string[];
}

const mock = {
  flavor: 'chrome' as Flavor,
  nodes: new Map<string, MockNode>(),
  nextId: 100,
  session: {} as Record<string, unknown>,
};

const BAR = '1';
const view = (id: string, deep: boolean): object => {
  const n = mock.nodes.get(id);
  if (!n) throw new Error(`Can't find bookmark for id ${id}`);
  const { children, ...rest } = n;
  return children && deep ? { ...rest, children: children.map((c) => view(c, true)) } : rest;
};
const siblingsOf = (id: string) => mock.nodes.get(mock.nodes.get(id)!.parentId!)!.children!;

const bookmarks = {
  getTree: async () => [view('0', true)],
  getSubTree: async (id: string) => [view(id, true)],
  getChildren: async (id: string) => mock.nodes.get(id)!.children!.map((c) => view(c, false)),
  get: async (id: string) => [view(id, false)],
  create: async ({ parentId, index, title, url }: { parentId: string; index?: number; title: string; url?: string }) => {
    const id = String(mock.nextId++);
    mock.nodes.set(id, { id, parentId, title, ...(url !== undefined ? { url } : { children: [] }) });
    const kids = mock.nodes.get(parentId)!.children!;
    kids.splice(Math.min(index ?? kids.length, kids.length), 0, id);
    return view(id, false);
  },
  update: async (id: string, changes: { title?: string; url?: string }) => {
    Object.assign(mock.nodes.get(id)!, changes);
    return view(id, false);
  },
  move: async (id: string, { parentId, index }: { parentId: string; index: number }) => {
    const n = mock.nodes.get(id)!;
    const old = siblingsOf(id);
    const oldIndex = old.indexOf(id);
    // Chrome: a same-folder index is counted before removing the node.
    if (mock.flavor === 'chrome' && n.parentId === parentId && index > oldIndex) index--;
    old.splice(oldIndex, 1);
    n.parentId = parentId;
    const kids = mock.nodes.get(parentId)!.children!;
    kids.splice(Math.min(index, kids.length), 0, id);
    return view(id, false);
  },
  removeTree: async (id: string) => {
    const drop = (x: string) => {
      for (const c of mock.nodes.get(x)!.children ?? []) drop(c);
      mock.nodes.delete(x);
    };
    siblingsOf(id).splice(siblingsOf(id).indexOf(id), 1);
    drop(id);
  },
};

const area = {
  get: async (k: string) => ({ [k]: mock.session[k] }),
  set: async (o: Record<string, unknown>) => void Object.assign(mock.session, o),
  remove: async (k: string) => void delete mock.session[k],
};
(globalThis as { chrome?: unknown }).chrome = { bookmarks, storage: { session: area, local: area } };

const { applyLocalOps, readLocalSnapshot } = await import('../src/lib/sync/local');

/** Fills the mock bar from a snapshot, returning nativeId <-> key mappings. */
function seed(snap: Snapshot, flavor: Flavor, rand: () => number) {
  mock.flavor = flavor;
  mock.nextId = 100;
  mock.session = {};
  mock.nodes = new Map([
    ['0', { id: '0', title: '', children: [BAR, '2'] }],
    [BAR, { id: BAR, parentId: '0', title: 'Bookmarks bar', children: [] }],
    ['2', { id: '2', parentId: '0', title: 'Other', children: [] }],
  ]);
  const keyToNative: Record<NodeKey, string> = { [ROOT_KEY]: BAR };
  const add = (parentKey: NodeKey) => {
    const kids = [...snap.nodes.values()].filter((n) => n.parentKey === parentKey).sort((a, b) => a.index - b.index);
    for (const n of kids) {
      const parent = mock.nodes.get(keyToNative[parentKey]!)!;
      // Firefox separators are not synced but occupy native indexes.
      if (flavor === 'firefox' && rand() < 0.3) {
        const sep = String(mock.nextId++);
        mock.nodes.set(sep, { id: sep, parentId: parent.id, title: '', type: 'separator', url: 'data:' });
        parent.children!.push(sep);
      }
      const id = String(mock.nextId++);
      mock.nodes.set(id, { id, parentId: parent.id, title: n.title, ...(n.kind === 'bookmark' ? { url: n.url } : { children: [] }) });
      parent.children!.push(id);
      keyToNative[n.key] = id;
      if (n.kind === 'folder') add(n.key);
    }
  };
  add(ROOT_KEY);
  delete keyToNative[ROOT_KEY];
  return keyToNative;
}

describe.each<Flavor>(['chrome', 'firefox'])('applyLocalOps (%s)', (flavor) => {
  beforeEach(() => void (mock.session = {}));

  for (let seedNo = 1; seedNo <= 150; seedNo++) {
    it(`converges to newBase, seed ${seedNo}`, async () => {
      const rand = prng(seedNo * 31 + (flavor === 'chrome' ? 0 : 7));
      let next = 0;
      const base: Snapshot = { rootKey: ROOT_KEY, nodes: new Map() };
      for (let i = 0; i < 3 + Math.floor(rand() * 10); i++) edit(base, rand, () => `r:${next++}`, new Map(), 0);
      const remote = clone(base);
      for (let i = 0; i < 1 + Math.floor(rand() * 6); i++) edit(remote, rand, () => `r:${next++}`, new Map(), 1);

      const keyToNative = seed(base, flavor, rand);
      const nativeToKey = Object.fromEntries(Object.entries(keyToNative).map(([k, n]) => [n, k]));
      const { snapshot: local, barId } = await readLocalSnapshot(nativeToKey);
      expect(canonical(local)).toEqual(canonical(base));

      const result = merge({ base, local, remote, localTouchedAt: new Map(), remoteUpdatedAt: new Map() });
      await applyLocalOps(result.ops, {
        barId,
        nativeIdOf: (k) => keyToNative[k],
        onCreated: async (k, id) => {
          keyToNative[k] = id;
          nativeToKey[id] = k;
        },
      });

      const after = await readLocalSnapshot(nativeToKey);
      expect(canonical(after.snapshot)).toEqual(canonical(result.newBase));
    });
  }
});

describe('icon-only bookmarks', () => {
  it('are read as titled by their url and written back untitled', async () => {
    const keyToNative = seed({ rootKey: ROOT_KEY, nodes: new Map() }, 'chrome', () => 1);
    const nativeToKey: Record<string, NodeKey> = {};
    const icon = await bookmarks.create({ parentId: BAR, title: '', url: 'https://github.com/' });
    nativeToKey[(icon as { id: string }).id] = 'r:1';
    keyToNative['r:1'] = (icon as { id: string }).id;

    const { snapshot, barId } = await readLocalSnapshot(nativeToKey);
    expect(snapshot.nodes.get('r:1')?.title).toBe('https://github.com/');

    // Raindrop also titles an untitled item with its link, so both sides agree: no ops.
    const remote: Snapshot = { rootKey: ROOT_KEY, nodes: new Map([['r:1', { ...snapshot.nodes.get('r:1')! }]]) };
    remote.nodes.set('r:2', { key: 'r:2', kind: 'bookmark', title: 'https://x.test/', url: 'https://x.test/', parentKey: ROOT_KEY, index: 1 });
    const result = merge({ base: snapshot, local: snapshot, remote, localTouchedAt: new Map(), remoteUpdatedAt: new Map() });
    expect(result.ops.map((o) => o.type)).toEqual(['create']);

    await applyLocalOps(result.ops, {
      barId,
      nativeIdOf: (k) => keyToNative[k],
      onCreated: async (k, id) => void (keyToNative[k] = id),
    });
    const created = [...mock.nodes.values()].find((n) => n.url === 'https://x.test/');
    expect(created?.title).toBe('');
  });
});

// restoreBackup turns the current bar into a backup with merge(base = current, local = current,
// remote = backup) and applies only the local ops. Check that this lands exactly on the backup.
describe.each<Flavor>(['chrome', 'firefox'])('restore to a backup (%s)', (flavor) => {
  for (let seedNo = 1; seedNo <= 100; seedNo++) {
    it(`lands on the backup, seed ${seedNo}`, async () => {
      const rand = prng(seedNo * 977 + (flavor === 'chrome' ? 1 : 2));
      let next = 0;
      const backup: Snapshot = { rootKey: ROOT_KEY, nodes: new Map() };
      for (let i = 0; i < 3 + Math.floor(rand() * 10); i++) edit(backup, rand, () => `r:${next++}`, new Map(), 0);
      const current = clone(backup);
      for (let i = 0; i < 1 + Math.floor(rand() * 8); i++) edit(current, rand, () => `r:${next++}`, new Map(), 1);

      const keyToNative = seed(current, flavor, rand);
      const nativeToKey = Object.fromEntries(Object.entries(keyToNative).map(([k, n]) => [n, k]));
      const { snapshot: local, barId } = await readLocalSnapshot(nativeToKey);

      const result = merge({ base: local, local, remote: backup, localTouchedAt: new Map(), remoteUpdatedAt: new Map() });
      await applyLocalOps(result.ops.filter((o) => o.target === 'local'), {
        barId,
        nativeIdOf: (k) => keyToNative[k],
        onCreated: async (k, id) => {
          keyToNative[k] = id;
          nativeToKey[id] = k;
        },
      });

      const after = await readLocalSnapshot(nativeToKey);
      expect(canonical(after.snapshot)).toEqual(canonical(backup));
    });
  }
});
