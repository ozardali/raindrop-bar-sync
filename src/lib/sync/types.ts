/**
 * Normalized tree model shared by local (native bookmarks) and remote (Raindrop).
 * See docs/architecture.md.
 */

/**
 * Stable sync identity.
 *  - "root"            the synced root (bookmarks bar <-> chosen collection)
 *  - "c:<id>"          Raindrop collection (folder)
 *  - "r:<id>"          Raindrop raindrop (bookmark)
 *  - "n:<nativeId>"    local node not yet created on Raindrop (temporary)
 */
export type NodeKey = string;

export const ROOT_KEY: NodeKey = 'root';

export type NodeKind = 'folder' | 'bookmark';

export interface SyncNode {
  key: NodeKey;
  kind: NodeKind;
  title: string;
  /** Bookmarks only. */
  url?: string;
  /** null only for the root. */
  parentKey: NodeKey | null;
  /** Position among siblings, folders and bookmarks interleaved, separators excluded. */
  index: number;
}

export interface Snapshot {
  rootKey: NodeKey;
  nodes: Map<NodeKey, SyncNode>;
}

/**
 * Epoch ms of the last known change per node, used for last-write-wins. Remote timestamps
 * also hold `orderKey(folderKey)` -> that folder's manifest `updatedAt` (docs/architecture.md).
 */
export type Timestamps = Map<NodeKey, number>;

/** Timestamp key for a folder's child order. */
export const orderKey = (folderKey: NodeKey): string => `order:${folderKey}`;

export type OpTarget = 'local' | 'remote';

/**
 * Placement ops (create, move) carry the final `index` and `afterKey`: the sibling the node
 * must sit right after once everything is applied (null = first child). Ops are ordered so
 * that `afterKey` is always already in place, so appliers should position relative to it
 * rather than trusting `index`, which ignores stale siblings that are deleted later.
 */
export type SyncOp =
  | { type: 'create'; target: OpTarget; node: SyncNode; afterKey: NodeKey | null }
  | { type: 'update'; target: OpTarget; key: NodeKey; title?: string; url?: string }
  | { type: 'move'; target: OpTarget; key: NodeKey; parentKey: NodeKey; index: number; afterKey: NodeKey | null }
  | { type: 'delete'; target: OpTarget; key: NodeKey };

export interface MergeInput {
  base: Snapshot | null; // null => first sync, see docs/architecture.md, "First sync"
  local: Snapshot;
  remote: Snapshot;
  localTouchedAt: Timestamps;
  remoteUpdatedAt: Timestamps;
}

export interface MergeResult {
  /** Ordered so they can be applied sequentially: parents created first, children deleted first. */
  ops: SyncOp[];
  /** The state both sides will be in once all ops are applied. Stored as the next base. */
  newBase: Snapshot;
  /**
   * First sync only: local key -> matched remote key. Local ops and `newBase` already use the
   * remote keys, so the engine must apply this to its native-id mapping before applying ops.
   */
  localRekey: Map<NodeKey, NodeKey>;
  /** Human-readable summary for dry-run confirmation. */
  summary: { local: OpCounts; remote: OpCounts };
}

export interface OpCounts {
  create: number;
  update: number;
  move: number;
  delete: number;
}

export function emptySnapshot(): Snapshot {
  return { rootKey: ROOT_KEY, nodes: new Map() };
}

/** Children of `parentKey` sorted by index. */
export function childrenOf(snap: Snapshot, parentKey: NodeKey): SyncNode[] {
  return [...snap.nodes.values()]
    .filter((n) => n.parentKey === parentKey)
    .sort((a, b) => a.index - b.index);
}

// --- serialization for storage (Maps are not JSON-serializable) ---

export interface SerializedSnapshot {
  rootKey: NodeKey;
  nodes: SyncNode[];
}

export function serializeSnapshot(s: Snapshot): SerializedSnapshot {
  return { rootKey: s.rootKey, nodes: [...s.nodes.values()] };
}

export function deserializeSnapshot(s: SerializedSnapshot): Snapshot {
  return { rootKey: s.rootKey, nodes: new Map(s.nodes.map((n) => [n.key, n])) };
}
