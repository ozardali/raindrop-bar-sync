import { msg, type Msg } from '../../i18n/types';
import { RaindropApiError, type RaindropClient } from '../raindrop/client';
import type { RdCollection, RdRaindrop } from '../raindrop/types';
import {
  MANIFEST_LINK,
  MANIFEST_TITLE,
  ManifestTooLargeError,
  applyManifestOrder,
  emptyManifest,
  parseManifest,
  serializeManifest,
  type OrderManifest,
} from './order-manifest';
import { DEVICES_LINK, DEVICES_TITLE, emptyDevices, mergeDevices, parseDevices, serializeDevices, type DevicesDoc } from './devices';
import { ROOT_KEY, childrenOf, orderKey, type NodeKey, type Snapshot, type SyncNode, type SyncOp, type Timestamps } from './types';

export interface FolderManifest {
  manifest: OrderManifest;
  /** null when the folder has no manifest raindrop yet. */
  raindropId: number | null;
}

export interface RemoteRead {
  snapshot: Snapshot;
  /** Per node `lastUpdate`, plus `orderKey(folderKey)` -> manifest `updatedAt` (docs/architecture.md). */
  updatedAt: Timestamps;
  /** folderKey -> that folder's manifest. Folders without one are absent. */
  manifests: Map<NodeKey, FolderManifest>;
  /** The shared devices record in the root collection (docs/architecture.md, "Devices"). */
  devices: { doc: DevicesDoc; raindropId: number | null };
}

/** Links of raindrops this extension keeps for itself; never synced as bookmarks. */
const INTERNAL_LINK_PREFIX = 'https://raindrop-bar-sync.invalid/';

/**
 * Reads the chosen root collection and all of its descendant collections and raindrops.
 * Interleaved order comes from each folder's manifest (docs/architecture.md).
 */
export async function readRemoteSnapshot(client: RaindropClient, rootId: number): Promise<RemoteRead> {
  const all = await client.getAllCollections();
  const subtree = descendantCollections(all, rootId);

  const nodes = new Map<NodeKey, SyncNode>();
  const updatedAt: Timestamps = new Map();
  const manifests = new Map<NodeKey, FolderManifest>();
  let devices: RemoteRead['devices'] = { doc: emptyDevices(), raindropId: null };
  // parentKey -> child keys in Raindrop UI order: collections (`sort` ascending) first,
  // then raindrops (`sort=-sort`). Used for children the manifest does not list.
  const children = new Map<NodeKey, NodeKey[]>();
  const push = (parent: NodeKey, child: NodeKey) =>
    children.set(parent, [...(children.get(parent) ?? []), child]);

  const keyOfCollection = (id: number): NodeKey => (id === rootId ? ROOT_KEY : `c:${id}`);

  // Folders. Collection `sort` is a 0-based ascending position among siblings (docs/raindrop-api.md).
  for (const c of [...subtree].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
    const key = keyOfCollection(c._id);
    const parentKey = keyOfCollection(c.parent!.$id);
    nodes.set(key, { key, kind: 'folder', title: c.title, parentKey, index: 0 });
    if (c.lastUpdate) updatedAt.set(key, Date.parse(c.lastUpdate));
    push(parentKey, key);
  }

  // Bookmarks. TODO: parallelize with a small concurrency limit (rate limit 120/min).
  for (const collectionId of [rootId, ...subtree.map((c) => c._id)]) {
    const parentKey = keyOfCollection(collectionId);
    const items: RdRaindrop[] = await client.listRaindrops(collectionId);
    for (const r of items) {
      if (r.link === MANIFEST_LINK) {
        const manifest = parseManifest(r.note);
        manifests.set(parentKey, { manifest, raindropId: r._id });
        updatedAt.set(orderKey(parentKey), Date.parse(manifest.updatedAt));
        continue;
      }
      if (r.link === DEVICES_LINK && collectionId === rootId) {
        // Two browsers creating it at once leaves two records: read them as one.
        const doc = parseDevices(r.note);
        devices = { doc: mergeDevices(devices.doc, doc), raindropId: devices.raindropId ?? r._id };
        continue;
      }
      if (r.link.startsWith(INTERNAL_LINK_PREFIX)) continue; // from a newer version of this extension
      const key = `r:${r._id}`;
      nodes.set(key, { key, kind: 'bookmark', title: r.title, url: r.link, parentKey, index: 0 });
      updatedAt.set(key, Date.parse(r.lastUpdate));
      push(parentKey, key);
    }
  }

  // Assign interleaved indexes from each folder's manifest.
  for (const [parentKey, keys] of children) {
    const manifest = manifests.get(parentKey)?.manifest ?? emptyManifest();
    applyManifestOrder(keys, manifest).forEach((k, i) => {
      const n = nodes.get(k);
      if (n) n.index = i;
    });
  }

  return { snapshot: { rootKey: ROOT_KEY, nodes }, updatedAt, manifests, devices };
}

function descendantCollections(all: RdCollection[], rootId: number): RdCollection[] {
  const out: RdCollection[] = [];
  const frontier = [rootId];
  while (frontier.length) {
    const parent = frontier.pop()!;
    for (const c of all) {
      if (c.parent?.$id === parent) {
        out.push(c);
        frontier.push(c._id);
      }
    }
  }
  return out;
}

export interface RemoteApplyContext {
  client: RaindropClient;
  rootId: number;
  /**
   * Called right after a temporary "n:" key gets a real "c:"/"r:" key. Must persist the
   * mapping before resolving, so an interrupted sync does not create duplicates next time.
   */
  onRekey: (oldKey: NodeKey, newKey: NodeKey) => Promise<void>;
  /** Raindrop rejected a bookmark's link (400). The node stays local-only (docs/architecture.md). */
  onUnsyncable: (key: NodeKey, reason: string) => Promise<void>;
  /** Non-fatal problems, e.g. a manifest that is too large. */
  onWarning: (warning: Msg) => Promise<void>;
}

/**
 * Applies ops with target 'remote', then writes the manifest of every folder whose child
 * order in `finalTree` differs from its stored manifest.
 * Remote ops run BEFORE local ops so that new local nodes receive Raindrop ids.
 * Returns the rekeys made during this run (old key -> new key).
 */
export async function applyRemoteOps(
  ops: SyncOp[],
  ctx: RemoteApplyContext,
  finalTree: Snapshot,
  manifests: Map<NodeKey, FolderManifest>,
): Promise<Map<NodeKey, NodeKey>> {
  const { client } = ctx;
  const rekey = new Map<NodeKey, NodeKey>();
  const unsyncable = new Set<NodeKey>();
  const re = (k: NodeKey) => rekey.get(k) ?? k;
  const collectionId = (k: NodeKey) => (re(k) === ROOT_KEY ? ctx.rootId : idOf(re(k), 'c:'));
  const isFolder = (k: NodeKey) => finalTree.nodes.get(k)?.kind === 'folder' || re(k).startsWith('c:');

  const rejected = async (key: NodeKey, e: unknown) => {
    if (!(e instanceof RaindropApiError && e.status === 400)) return false;
    unsyncable.add(key);
    await ctx.onUnsyncable(key, e.message);
    return true;
  };

  for (const op of ops) {
    if (op.target !== 'remote') continue;
    switch (op.type) {
      case 'create': {
        const { node } = op;
        let newKey: NodeKey;
        if (node.kind === 'folder') {
          const c = await client.createCollection({ title: node.title, parent: { $id: collectionId(node.parentKey!) } });
          newKey = `c:${c._id}`;
        } else {
          try {
            const r = await client.createRaindrop({
              link: node.url ?? '',
              title: node.title,
              collection: { $id: collectionId(node.parentKey!) },
            });
            newKey = `r:${r._id}`;
          } catch (e) {
            if (await rejected(node.key, e)) continue;
            throw e;
          }
        }
        if (newKey !== node.key) {
          rekey.set(node.key, newKey);
          await ctx.onRekey(node.key, newKey);
        }
        break;
      }
      case 'update':
        if (isFolder(op.key)) {
          if (op.title !== undefined) await client.updateCollection(idOf(re(op.key), 'c:'), { title: op.title });
        } else {
          try {
            await client.updateRaindrop(idOf(re(op.key), 'r:'), {
              ...(op.title !== undefined && { title: op.title }),
              ...(op.url !== undefined && { link: op.url }),
            });
          } catch (e) {
            if (!(await rejected(op.key, e))) throw e;
          }
        }
        break;
      case 'move':
        if (isFolder(op.key)) {
          await client.updateCollection(idOf(re(op.key), 'c:'), { parent: { $id: collectionId(op.parentKey) } });
        } else {
          await client.updateRaindrop(idOf(re(op.key), 'r:'), { collection: { $id: collectionId(op.parentKey) } });
        }
        break;
      case 'delete':
        try {
          if (isFolder(op.key)) await client.deleteCollection(idOf(re(op.key), 'c:'));
          else await client.deleteRaindrop(idOf(re(op.key), 'r:'));
        } catch (e) {
          if (!(e instanceof RaindropApiError && e.status === 404)) throw e; // already gone
        }
        break;
    }
  }

  await writeOrder(ctx, finalTree, manifests, re, unsyncable);
  return rekey;
}

/**
 * Writes each changed folder's manifest and, best-effort, the collection `sort` of its
 * subcollections so Raindrop's own UI shows folders in the same order. Raindrop `order`
 * of bookmarks is not written: it costs one request per bookmark (docs/architecture.md).
 */
async function writeOrder(
  ctx: RemoteApplyContext,
  finalTree: Snapshot,
  manifests: Map<NodeKey, FolderManifest>,
  re: (k: NodeKey) => NodeKey,
  unsyncable: Set<NodeKey>,
): Promise<void> {
  const folders = [ROOT_KEY, ...[...finalTree.nodes.values()].filter((n) => n.kind === 'folder').map((n) => n.key)];
  for (const folder of folders) {
    const kids = childrenOf(finalTree, folder).filter((n) => !unsyncable.has(n.key));
    const children = kids.map((n) => re(n.key)).filter((k) => k.startsWith('c:') || k.startsWith('r:'));
    const existing = manifests.get(folder) ?? manifests.get(re(folder));
    if (sameKeys(children, existing?.manifest.children ?? [])) continue;
    if (!existing && children.length === 0) continue;

    const collection = re(folder) === ROOT_KEY ? ctx.rootId : idOf(re(folder), 'c:');
    let note: string;
    try {
      note = serializeManifest({ v: 2, updatedAt: new Date().toISOString(), children });
    } catch (e) {
      if (!(e instanceof ManifestTooLargeError)) throw e;
      const title = finalTree.nodes.get(folder)?.title;
      await ctx.onWarning(msg('act.orderTooLarge', { folder: title ? msg('common.quoted', { text: title }) : msg('common.bar') }));
      continue;
    }

    const saved = existing?.raindropId
      ? await ctx.client.updateRaindrop(existing.raindropId, { note })
      : await ctx.client.createRaindrop({ link: MANIFEST_LINK, title: MANIFEST_TITLE, collection: { $id: collection }, note });
    if (!existing?.raindropId) await ctx.client.updateRaindrop(saved._id, { order: MANIFEST_LAST });
    if (!sameKeys(parseManifest(saved.note).children, children)) {
      throw new Error(`Order manifest of folder ${folder} did not round-trip`);
    }

    // Best-effort folder order in Raindrop's UI: ascending positions among subcollections.
    const subcollections = children.filter((k) => k.startsWith('c:'));
    for (const [i, k] of subcollections.entries()) {
      await ctx.client.updateCollection(idOf(k, 'c:'), { sort: i });
    }
  }
}

/** Creates or updates the devices record in the root collection. */
export async function writeDevices(
  client: RaindropClient,
  rootId: number,
  raindropId: number | null,
  doc: DevicesDoc,
): Promise<void> {
  const note = serializeDevices(doc);
  if (raindropId) {
    await client.updateRaindrop(raindropId, { note });
  } else {
    const created = await client.createRaindrop({ link: DEVICES_LINK, title: DEVICES_TITLE, collection: { $id: rootId }, note });
    await client.updateRaindrop(created._id, { order: MANIFEST_LAST });
  }
}

/** `PUT order` past the end is clamped to the last position (docs/raindrop-api.md). */
const MANIFEST_LAST = 1_000_000;

function sameKeys(a: NodeKey[], b: NodeKey[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

function idOf(key: NodeKey, prefix: 'c:' | 'r:'): number {
  if (!key.startsWith(prefix)) throw new Error(`Expected a ${prefix} key, got ${key}`);
  return Number(key.slice(prefix.length));
}
