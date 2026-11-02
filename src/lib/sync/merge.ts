/**
 * 3-way merge. PURE: no browser APIs, no network, no Date.now() (timestamps come in via input).
 * Spec: docs/architecture.md, "Merge". Tests: tests/merge.test.ts.
 */
import {
  ROOT_KEY,
  type MergeInput,
  type MergeResult,
  type NodeKey,
  type OpCounts,
  type OpTarget,
  type Snapshot,
  type SyncNode,
  type SyncOp,
  type Timestamps,
  childrenOf,
  emptySnapshot,
  orderKey,
} from './types';
import { normalizeUrl } from './url';

type Field = 'title' | 'url' | 'parentKey';
const FIELDS: Field[] = ['title', 'url', 'parentKey'];

interface Ctx {
  base: Snapshot;
  local: Snapshot;
  remote: Snapshot;
  localTouchedAt: Timestamps;
  remoteUpdatedAt: Timestamps;
  firstSync: boolean;
}

export function merge(input: MergeInput): MergeResult {
  const firstSync = input.base === null;
  let local = input.local;
  let localTouchedAt = input.localTouchedAt;
  let localRekey = new Map<NodeKey, NodeKey>();

  if (firstSync) {
    // Matched pairs share the remote key and have no base, so every field is resolved by
    // LWW and nothing can be deleted (docs/architecture.md, "First sync").
    const matched = matchInitial(input.local, input.remote);
    local = matched.localRekeyed;
    localRekey = matched.rekey;
    localTouchedAt = new Map([...input.localTouchedAt].map(([k, t]) => [localRekey.get(k) ?? k, t]));
  }

  const ctx: Ctx = {
    base: input.base ?? emptySnapshot(),
    local,
    remote: input.remote,
    localTouchedAt,
    remoteUpdatedAt: input.remoteUpdatedAt,
    firstSync,
  };

  const result = resolveNodes(ctx);
  resolveOrder(ctx, result);

  const newBase: Snapshot = { rootKey: ROOT_KEY, nodes: result };
  const ops = [...emitOps(newBase, ctx.remote, 'remote'), ...emitOps(newBase, ctx.local, 'local')];
  return { ops, newBase, localRekey, summary: summarize(ops) };
}

// ---------------------------------------------------------------------------
// Existence and fields
// ---------------------------------------------------------------------------

/** Returns the merged nodes with resolved fields; `index` is filled in by resolveOrder. */
function resolveNodes(ctx: Ctx): Map<NodeKey, SyncNode> {
  const { base, local, remote } = ctx;
  const keys = sortedKeys(base, local, remote);

  const alive = new Set<NodeKey>();
  /** Deleted on one side but still present on the other: can be resurrected as a parent. */
  const deletable = new Set<NodeKey>();

  for (const k of keys) {
    const b = base.nodes.get(k);
    const l = local.nodes.get(k);
    const r = remote.nodes.get(k);
    if (l && r) alive.add(k);
    else if (l || r) {
      if (!b) alive.add(k); // new on one side
      else if (l ? survivesRemoteDelete(b, l) : survivesLocalDelete(ctx, k, b, r!)) alive.add(k);
      else deletable.add(k);
    }
    // In base only, or nowhere: gone on both sides.
  }

  const result = new Map<NodeKey, SyncNode>();
  const resolve = (k: NodeKey) => result.set(k, resolveFields(ctx, k));
  for (const k of keys) if (alive.has(k)) resolve(k);

  // Every surviving node needs a surviving parent. A folder deleted on one side while the
  // other side added or changed something inside it is resurrected (docs/architecture.md, "Merge").
  for (let changed = true; changed; ) {
    changed = false;
    for (const k of [...result.keys()].sort()) {
      const n = result.get(k)!;
      if (n.parentKey === ROOT_KEY || isLiveFolder(result, n.parentKey!)) continue;
      if (deletable.has(n.parentKey!)) {
        deletable.delete(n.parentKey!);
        resolve(n.parentKey!);
      } else {
        n.parentKey = fallbackParent(ctx, result, k);
      }
      changed = true;
    }
  }

  breakCycles(ctx, result);
  return result;
}

/** Remote deleted a node that local still has. Remote delete times are unknown: keep it if local changed it. */
function survivesRemoteDelete(b: SyncNode, l: SyncNode): boolean {
  return changedFrom(b, l);
}

/** Local deleted a node that remote still has: keep it if remote changed it after the delete. */
function survivesLocalDelete(ctx: Ctx, k: NodeKey, b: SyncNode, r: SyncNode): boolean {
  if (!changedFrom(b, r)) return false;
  const deletedAt = ctx.localTouchedAt.get(k);
  const changedAt = ctx.remoteUpdatedAt.get(k);
  return deletedAt === undefined || changedAt === undefined || changedAt > deletedAt;
}

function changedFrom(b: SyncNode, n: SyncNode): boolean {
  return FIELDS.some((f) => b[f] !== n[f]);
}

function resolveFields(ctx: Ctx, k: NodeKey): SyncNode {
  const b = ctx.base.nodes.get(k);
  const l = ctx.local.nodes.get(k);
  const r = ctx.remote.nodes.get(k);
  const from = (l ?? r ?? b)!;
  const node: SyncNode = { ...from, index: 0 };
  if (!l || !r) return node;

  const localWins = (ctx.localTouchedAt.get(k) ?? 0) > (ctx.remoteUpdatedAt.get(k) ?? 0);
  const pick = <F extends Field>(f: F): SyncNode[F] => {
    if (l[f] === r[f]) return l[f];
    if (b && l[f] === b[f]) return r[f]; // only remote changed
    if (b && r[f] === b[f]) return l[f]; // only local changed
    return localWins ? l[f] : r[f]; // both changed (or no base): LWW, ties go to remote
  };
  node.title = pick('title');
  node.url = pick('url');
  node.parentKey = pick('parentKey');
  return node;
}

function isLiveFolder(result: Map<NodeKey, SyncNode>, key: NodeKey): boolean {
  return key === ROOT_KEY || result.get(key)?.kind === 'folder';
}

/** A node whose resolved parent no longer exists anywhere: try the other candidates, then root. */
function fallbackParent(ctx: Ctx, result: Map<NodeKey, SyncNode>, k: NodeKey): NodeKey {
  const candidates = [ctx.local, ctx.remote, ctx.base].map((s) => s.nodes.get(k)?.parentKey);
  return candidates.find((p): p is NodeKey => !!p && isLiveFolder(result, p)) ?? ROOT_KEY;
}

/**
 * A move that puts a folder inside its own subtree is rejected: the other side's (or the
 * base) parent wins, root as a last resort (docs/architecture.md, "Merge").
 */
function breakCycles(ctx: Ctx, result: Map<NodeKey, SyncNode>): void {
  const createsCycle = (k: NodeKey, parent: NodeKey) => {
    for (let p: NodeKey | null = parent, steps = 0; p && p !== ROOT_KEY; steps++) {
      if (p === k || steps > result.size) return true;
      p = result.get(p)?.parentKey ?? null;
    }
    return false;
  };

  for (const k of [...result.keys()].sort()) {
    const n = result.get(k)!;
    if (!createsCycle(k, n.parentKey!)) continue;
    const candidates = [ctx.local, ctx.remote, ctx.base]
      .map((s) => s.nodes.get(k)?.parentKey)
      .filter((p): p is NodeKey => !!p && p !== n.parentKey && isLiveFolder(result, p));
    n.parentKey = candidates.find((p) => !createsCycle(k, p)) ?? ROOT_KEY;
  }
}

// ---------------------------------------------------------------------------
// Child order
// ---------------------------------------------------------------------------

/**
 * Per folder: if only one side reordered (relative to base) its order wins, if both did the
 * side with the newer change wins. Nodes the winning side does not have are placed after
 * their neighbour from their own side (docs/architecture.md, "Ordering"). On first sync local order
 * wins and remote-only nodes are appended.
 */
function resolveOrder(ctx: Ctx, result: Map<NodeKey, SyncNode>): void {
  const children = new Map<NodeKey, NodeKey[]>();
  for (const k of [...result.keys()].sort()) {
    const p = result.get(k)!.parentKey!;
    children.set(p, [...(children.get(p) ?? []), k]);
  }

  for (const [folder, keys] of children) {
    const members = new Set(keys);
    const localSeq = childKeys(ctx.local, folder);
    const remoteSeq = childKeys(ctx.remote, folder);
    const baseSeq = childKeys(ctx.base, folder);

    const localFirst = ctx.firstSync || chooseLocalOrder(ctx, folder, localSeq, remoteSeq, baseSeq);
    const [primary, secondary] = localFirst ? [localSeq, remoteSeq] : [remoteSeq, localSeq];

    const order = primary.filter((k) => members.has(k));
    const placed = new Set(order);
    for (const [i, k] of secondary.entries()) {
      if (!members.has(k) || placed.has(k)) continue;
      let at = ctx.firstSync ? order.length : 0;
      if (!ctx.firstSync) {
        for (let j = i - 1; j >= 0; j--) {
          const pos = order.indexOf(secondary[j]!);
          if (pos >= 0) {
            at = pos + 1;
            break;
          }
        }
      }
      order.splice(at, 0, k);
      placed.add(k);
    }
    // Anything else (e.g. a move reverted by cycle prevention) goes last, in base order.
    const rest = keys.filter((k) => !placed.has(k));
    rest.sort((a, b) => (ctx.base.nodes.get(a)?.index ?? 0) - (ctx.base.nodes.get(b)?.index ?? 0));
    order.push(...rest);

    order.forEach((k, i) => (result.get(k)!.index = i));
  }
}

function chooseLocalOrder(
  ctx: Ctx,
  folder: NodeKey,
  localSeq: NodeKey[],
  remoteSeq: NodeKey[],
  baseSeq: NodeKey[],
): boolean {
  const localChanged = reordered(localSeq, baseSeq);
  const remoteChanged = reordered(remoteSeq, baseSeq);
  if (localChanged !== remoteChanged) return localChanged;
  if (!localChanged) return true; // same relative order on both sides

  const localAt = Math.max(0, ...[folder, ...localSeq].map((k) => ctx.localTouchedAt.get(k) ?? 0));
  const remoteAt =
    ctx.remoteUpdatedAt.get(orderKey(folder)) ??
    Math.max(0, ...remoteSeq.map((k) => ctx.remoteUpdatedAt.get(k) ?? 0));
  return localAt > remoteAt;
}

/** True if the keys `side` shares with `base` are in a different relative order. */
function reordered(side: NodeKey[], base: NodeKey[]): boolean {
  const inSide = new Set(side);
  const inBase = new Set(base);
  const a = side.filter((k) => inBase.has(k));
  const b = base.filter((k) => inSide.has(k));
  return a.some((k, i) => k !== b[i]);
}

function childKeys(snap: Snapshot, parentKey: NodeKey): NodeKey[] {
  return childrenOf(snap, parentKey).map((n) => n.key);
}

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

/**
 * Ops that turn `side` into `target`, in applicable order: creates and moves in pre-order of
 * the final tree (parents first, siblings left to right, so `afterKey` is always in place),
 * then updates, then deletes deepest first.
 */
function emitOps(final: Snapshot, side: Snapshot, target: OpTarget): SyncOp[] {
  const placements: SyncOp[] = [];
  const updates: SyncOp[] = [];

  const walk = (folder: NodeKey) => {
    const kids = childrenOf(final, folder);
    const stay = stayingInPlace(kids, side, folder);
    kids.forEach((n, i) => {
      const afterKey = i === 0 ? null : kids[i - 1]!.key;
      const cur = side.nodes.get(n.key);
      if (!cur) {
        placements.push({ type: 'create', target, node: { ...n }, afterKey });
      } else {
        if (!stay.has(n.key)) {
          placements.push({ type: 'move', target, key: n.key, parentKey: folder, index: n.index, afterKey });
        }
        const update: Extract<SyncOp, { type: 'update' }> = { type: 'update', target, key: n.key };
        if (cur.title !== n.title) update.title = n.title;
        if (cur.url !== n.url && n.kind === 'bookmark') update.url = n.url;
        if ('title' in update || 'url' in update) updates.push(update);
      }
      if (n.kind === 'folder') walk(n.key);
    });
  };
  walk(ROOT_KEY);

  const depth = (k: NodeKey) => {
    let d = 0;
    for (let p = side.nodes.get(k)?.parentKey; p && p !== ROOT_KEY; p = side.nodes.get(p)?.parentKey) d++;
    return d;
  };
  const deletes: SyncOp[] = [...side.nodes.keys()]
    .filter((k) => k !== ROOT_KEY && !final.nodes.has(k))
    .sort((a, b) => depth(b) - depth(a) || a.localeCompare(b))
    .map((key) => ({ type: 'delete', target, key }));

  return [...placements, ...updates, ...deletes];
}

/**
 * Children that are already in `folder` on this side and whose relative order is kept: the
 * longest increasing subsequence of their final positions. Everything else gets a move op.
 */
function stayingInPlace(finalKids: SyncNode[], side: Snapshot, folder: NodeKey): Set<NodeKey> {
  const finalPos = new Map(finalKids.map((n, i) => [n.key, i]));
  const seq = childrenOf(side, folder)
    .map((n) => n.key)
    .filter((k) => finalPos.has(k));
  return new Set(longestIncreasing(seq, (k) => finalPos.get(k)!));
}

function longestIncreasing<T>(items: T[], value: (t: T) => number): T[] {
  const tails: number[] = []; // index into items of the smallest tail for each length
  const prev: number[] = new Array(items.length).fill(-1);
  items.forEach((item, i) => {
    const v = value(item);
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (value(items[tails[mid]!]!) < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    tails[lo] = i;
  });
  const out: T[] = [];
  for (let i = tails.length ? tails[tails.length - 1]! : -1; i >= 0; i = prev[i]!) out.unshift(items[i]!);
  return out;
}

// ---------------------------------------------------------------------------
// First sync
// ---------------------------------------------------------------------------

/**
 * First-sync matching: folders by path (title at each level), bookmarks by normalized URL
 * within matched folders. Duplicates in one folder are matched in order of appearance.
 * Unmatched nodes keep their own key and count as new on their side.
 */
export function matchInitial(
  local: Snapshot,
  remote: Snapshot,
): { rekey: Map<NodeKey, NodeKey>; localRekeyed: Snapshot } {
  const rekey = new Map<NodeKey, NodeKey>();

  const pairUp = (ls: SyncNode[], rs: SyncNode[], id: (n: SyncNode) => string) => {
    const queues = new Map<string, SyncNode[]>();
    for (const r of rs) queues.set(id(r), [...(queues.get(id(r)) ?? []), r]);
    const pairs: [SyncNode, SyncNode][] = [];
    for (const l of ls) {
      const r = queues.get(id(l))?.shift();
      if (r) pairs.push([l, r]);
    }
    return pairs;
  };

  const walk = (localFolder: NodeKey, remoteFolder: NodeKey) => {
    const lc = childrenOf(local, localFolder);
    const rc = childrenOf(remote, remoteFolder);
    const folders = (ns: SyncNode[]) => ns.filter((n) => n.kind === 'folder');
    const bookmarks = (ns: SyncNode[]) => ns.filter((n) => n.kind === 'bookmark');

    for (const [l, r] of pairUp(bookmarks(lc), bookmarks(rc), (n) => normalizeUrl(n.url ?? ''))) {
      rekey.set(l.key, r.key);
    }
    for (const [l, r] of pairUp(folders(lc), folders(rc), (n) => n.title)) {
      rekey.set(l.key, r.key);
      walk(l.key, r.key);
    }
  };
  walk(local.rootKey, remote.rootKey);

  return { rekey, localRekeyed: rekeySnapshot(local, rekey) };
}

export function rekeySnapshot(snap: Snapshot, rekey: Map<NodeKey, NodeKey>): Snapshot {
  const re = (k: NodeKey) => rekey.get(k) ?? k;
  const nodes = new Map<NodeKey, SyncNode>();
  for (const n of snap.nodes.values()) {
    nodes.set(re(n.key), { ...n, key: re(n.key), parentKey: n.parentKey === null ? null : re(n.parentKey) });
  }
  return { rootKey: snap.rootKey, nodes };
}

export function pathOf(snap: Snapshot, node: SyncNode): string {
  const parts: string[] = [];
  let cur: SyncNode | undefined = node;
  while (cur && cur.parentKey !== null) {
    parts.unshift(cur.title);
    cur = cur.parentKey ? snap.nodes.get(cur.parentKey) : undefined;
  }
  return '/' + parts.join('/');
}

function sortedKeys(...snaps: Snapshot[]): NodeKey[] {
  const keys = new Set<NodeKey>();
  for (const s of snaps) for (const k of s.nodes.keys()) if (k !== ROOT_KEY) keys.add(k);
  return [...keys].sort();
}

function summarize(ops: SyncOp[]): MergeResult['summary'] {
  const zero = (): OpCounts => ({ create: 0, update: 0, move: 0, delete: 0 });
  const summary = { local: zero(), remote: zero() };
  for (const op of ops) summary[op.target][op.type]++;
  return summary;
}
