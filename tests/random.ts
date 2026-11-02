import { ROOT_KEY, childrenOf, type NodeKey, type Snapshot, type SyncNode } from '../src/lib/sync/types';

// Random edit histories for property tests.

export function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

export type Rand = ReturnType<typeof prng>;
const pick = <T>(rand: Rand, xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;

export function clone(s: Snapshot): Snapshot {
  return { rootKey: s.rootKey, nodes: new Map([...s.nodes].map(([k, n]) => [k, { ...n }])) };
}

function reindex(s: Snapshot, parent: NodeKey, order: NodeKey[]) {
  order.forEach((k, i) => (s.nodes.get(k)!.index = i));
  void parent;
}

const folders = (s: Snapshot) => [ROOT_KEY, ...[...s.nodes.values()].filter((n) => n.kind === 'folder').map((n) => n.key)];

function isInside(s: Snapshot, k: NodeKey, ancestor: NodeKey): boolean {
  for (let p: NodeKey | null = k; p && p !== ROOT_KEY; p = s.nodes.get(p)?.parentKey ?? null) if (p === ancestor) return true;
  return false;
}

function insert(s: Snapshot, rand: Rand, node: SyncNode) {
  const siblings = childrenOf(s, node.parentKey!).map((n) => n.key);
  siblings.splice(Math.floor(rand() * (siblings.length + 1)), 0, node.key);
  s.nodes.set(node.key, node);
  reindex(s, node.parentKey!, siblings);
}

function removeSubtree(s: Snapshot, k: NodeKey) {
  const parent = s.nodes.get(k)!.parentKey!;
  for (const c of childrenOf(s, k)) removeSubtree(s, c.key);
  s.nodes.delete(k);
  reindex(s, parent, childrenOf(s, parent).map((n) => n.key));
}

/** One random user edit. Records touched keys with time `now` in `touched`. */
export function edit(s: Snapshot, rand: Rand, newKey: () => NodeKey, touched: Map<NodeKey, number>, now: number) {
  const keys = [...s.nodes.keys()].sort();
  const roll = rand();
  if (roll < 0.25 || keys.length === 0) {
    const kind = rand() < 0.3 ? 'folder' : 'bookmark';
    const key = newKey();
    insert(s, rand, {
      key,
      kind,
      title: `t${Math.floor(rand() * 5)}`,
      url: kind === 'bookmark' ? `https://u${Math.floor(rand() * 6)}.test/` : undefined,
      parentKey: pick(rand, folders(s)),
      index: 0,
    });
    touched.set(key, now);
  } else if (roll < 0.45) {
    const k = pick(rand, keys);
    const n = s.nodes.get(k)!;
    if (rand() < 0.5 || n.kind === 'folder') n.title = `t${Math.floor(rand() * 5)}`;
    else n.url = `https://u${Math.floor(rand() * 6)}.test/`;
    touched.set(k, now);
  } else if (roll < 0.6) {
    const k = pick(rand, keys);
    const walk = (x: NodeKey) => {
      touched.set(x, now);
      for (const c of childrenOf(s, x)) walk(c.key);
    };
    walk(k);
    removeSubtree(s, k);
  } else {
    const k = pick(rand, keys);
    const n = s.nodes.get(k)!;
    const target = pick(rand, folders(s).filter((f) => !isInside(s, f, k)));
    const oldParent = n.parentKey!;
    reindex(s, oldParent, childrenOf(s, oldParent).map((c) => c.key).filter((c) => c !== k));
    s.nodes.delete(k);
    insert(s, rand, { ...n, parentKey: target });
    touched.set(k, now);
  }
}

