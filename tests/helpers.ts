import { expect } from 'vitest';
import { merge, rekeySnapshot } from '../src/lib/sync/merge';
import {
  ROOT_KEY,
  childrenOf,
  type MergeInput,
  type MergeResult,
  type NodeKey,
  type OpTarget,
  type Snapshot,
  type SyncNode,
  type SyncOp,
} from '../src/lib/sync/types';

/** Tree spec item: a bookmark or a folder with children. */
export type Item =
  | { kind: 'bookmark'; key: NodeKey; title: string; url: string }
  | { kind: 'folder'; key: NodeKey; title: string; children: Item[] };

export const bm = (key: NodeKey, title: string, url = `https://${title.toLowerCase()}.test/`): Item => ({
  kind: 'bookmark',
  key,
  title,
  url,
});
export const dir = (key: NodeKey, title: string, ...children: Item[]): Item => ({
  kind: 'folder',
  key,
  title,
  children,
});

/** Builds a Snapshot; indexes follow the order of the items. */
export function tree(...items: Item[]): Snapshot {
  const nodes = new Map<NodeKey, SyncNode>();
  const add = (list: Item[], parentKey: NodeKey) =>
    list.forEach((it, index) => {
      if (it.kind === 'bookmark') {
        nodes.set(it.key, { key: it.key, kind: 'bookmark', title: it.title, url: it.url, parentKey, index });
      } else {
        nodes.set(it.key, { key: it.key, kind: 'folder', title: it.title, parentKey, index });
        add(it.children, it.key);
      }
    });
  add(items, ROOT_KEY);
  return { rootKey: ROOT_KEY, nodes };
}

/** Compact, order-aware text form of a tree for readable assertions: `A[x,y],b`. */
export function show(snap: Snapshot, parent: NodeKey = ROOT_KEY): string {
  return childrenOf(snap, parent)
    .map((n) => (n.kind === 'folder' ? `${n.title}[${show(snap, n.key)}]` : n.title))
    .join(',');
}

/** Applies ops for one target the way a real applier would: relative to `afterKey`. */
export function applyOps(snap: Snapshot, ops: SyncOp[], target: OpTarget): Snapshot {
  const nodes = new Map([...snap.nodes].map(([k, n]) => [k, { ...n }]));
  const order = new Map<NodeKey, NodeKey[]>([[ROOT_KEY, []]]);
  for (const n of [...nodes.values()].sort((a, b) => a.index - b.index)) {
    if (n.kind === 'folder' && !order.has(n.key)) order.set(n.key, []);
    order.set(n.parentKey!, [...(order.get(n.parentKey!) ?? []), n.key]);
  }
  const detach = (k: NodeKey) => {
    const siblings = order.get(nodes.get(k)!.parentKey!)!;
    siblings.splice(siblings.indexOf(k), 1);
  };
  const attach = (k: NodeKey, parent: NodeKey, afterKey: NodeKey | null) => {
    const siblings = order.get(parent);
    if (!siblings) throw new Error(`parent ${parent} of ${k} does not exist yet`);
    const at = afterKey === null ? 0 : siblings.indexOf(afterKey) + 1;
    if (afterKey !== null && at === 0) throw new Error(`afterKey ${afterKey} of ${k} is not in ${parent}`);
    siblings.splice(at, 0, k);
  };

  for (const op of ops) {
    if (op.target !== target) continue;
    switch (op.type) {
      case 'create':
        if (nodes.has(op.node.key)) throw new Error(`create of existing ${op.node.key}`);
        nodes.set(op.node.key, { ...op.node });
        if (op.node.kind === 'folder') order.set(op.node.key, []);
        attach(op.node.key, op.node.parentKey!, op.afterKey);
        break;
      case 'update': {
        const n = nodes.get(op.key);
        if (!n) throw new Error(`update of missing ${op.key}`);
        if (op.title !== undefined) n.title = op.title;
        if (op.url !== undefined) n.url = op.url;
        break;
      }
      case 'move':
        if (!nodes.has(op.key)) throw new Error(`move of missing ${op.key}`);
        detach(op.key);
        nodes.get(op.key)!.parentKey = op.parentKey;
        attach(op.key, op.parentKey, op.afterKey);
        break;
      case 'delete':
        if (!nodes.has(op.key)) throw new Error(`delete of missing ${op.key}`);
        if (order.get(op.key)?.length) throw new Error(`delete of non-empty folder ${op.key}`);
        detach(op.key);
        nodes.delete(op.key);
        order.delete(op.key);
        break;
    }
  }
  for (const siblings of order.values()) siblings.forEach((k, i) => (nodes.get(k)!.index = i));
  return { rootKey: snap.rootKey, nodes };
}

/** Order-independent comparable form of a snapshot. */
export function canonical(snap: Snapshot): string[] {
  return [...snap.nodes.values()]
    .map((n) => [n.key, n.kind, n.title, n.url ?? '', n.parentKey, n.index].join('|'))
    .sort();
}

export interface Case {
  base?: Snapshot | null;
  local: Snapshot;
  remote: Snapshot;
  localTouchedAt?: Record<NodeKey, number>;
  remoteUpdatedAt?: Record<NodeKey, number>;
}

/**
 * Runs merge and checks the invariants every result must satisfy: applying the ops brings
 * both sides exactly to newBase, and merging again is a no-op.
 */
export function run(c: Case): MergeResult {
  const input: MergeInput = {
    base: c.base === undefined ? null : c.base,
    local: c.local,
    remote: c.remote,
    localTouchedAt: new Map(Object.entries(c.localTouchedAt ?? {})),
    remoteUpdatedAt: new Map(Object.entries(c.remoteUpdatedAt ?? {})),
  };
  const result = merge(input);

  const localAfter = applyOps(rekeySnapshot(c.local, result.localRekey), result.ops, 'local');
  const remoteAfter = applyOps(c.remote, result.ops, 'remote');
  expect(canonical(localAfter), 'local after ops').toEqual(canonical(result.newBase));
  expect(canonical(remoteAfter), 'remote after ops').toEqual(canonical(result.newBase));

  const again = merge({
    base: result.newBase,
    local: localAfter,
    remote: remoteAfter,
    localTouchedAt: new Map(),
    remoteUpdatedAt: new Map(),
  });
  expect(again.ops, 'second merge').toEqual([]);
  return result;
}

export const opsFor = (r: MergeResult, target: OpTarget) => r.ops.filter((o) => o.target === target);
export const kinds = (r: MergeResult, target: OpTarget) => opsFor(r, target).map((o) => `${o.type}:${keyOf(o)}`);
const keyOf = (o: SyncOp) => (o.type === 'create' ? o.node.key : o.key);
