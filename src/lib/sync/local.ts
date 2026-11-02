import { browser, type Browser } from 'wxt/browser';
import { getBookmarksBarId, isSeparator, isUnmodifiable } from '../browser-roots';
import { expectEvent } from './echo-guard';
import { isSyncableUrl } from './url';
import { ROOT_KEY, type NodeKey, type Snapshot, type SyncNode, type SyncOp } from './types';

type BookmarkNode = Browser.bookmarks.BookmarkTreeNode;

/**
 * Reads the native bookmarks bar into a Snapshot.
 * Separators, managed bookmarks and links Raindrop rejects are skipped; `index` counts only
 * synced siblings.
 */
export async function readLocalSnapshot(
  nativeToKey: Record<string, NodeKey>,
  unsyncable: Record<string, string> = {},
): Promise<{ snapshot: Snapshot; barId: string }> {
  const barId = await getBookmarksBarId();
  const [bar] = await browser.bookmarks.getSubTree(barId);
  const nodes = new Map<NodeKey, SyncNode>();

  const walk = (children: BookmarkNode[] | undefined, parentKey: NodeKey) => {
    let index = 0;
    for (const child of children ?? []) {
      if (isSeparator(child) || isUnmodifiable(child)) continue;
      if (child.url !== undefined && (!isSyncableUrl(child.url) || child.id in unsyncable)) continue;
      const key = nativeToKey[child.id] ?? `n:${child.id}`;
      const isFolder = child.url === undefined;
      nodes.set(key, {
        key,
        kind: isFolder ? 'folder' : 'bookmark',
        // Raindrop stores an empty title as the link (docs/raindrop-api.md), so an icon-only bookmark
        // is read as titled by its URL on both sides and never gets a title written back.
        title: !isFolder && !child.title.trim() ? child.url! : child.title,
        url: child.url,
        parentKey,
        index: index++,
      });
      if (isFolder) walk(child.children, key);
    }
  };
  walk(bar?.children, ROOT_KEY);

  return { snapshot: { rootKey: ROOT_KEY, nodes }, barId };
}

export interface LocalApplyContext {
  barId: string;
  /** Native id of a key (after any rekeying in this run), or undefined if unknown. */
  nativeIdOf: (key: NodeKey) => string | undefined;
  /** Called when a create returns a new native id. Must persist the mapping before resolving. */
  onCreated: (key: NodeKey, nativeId: string) => Promise<void>;
}

/**
 * Applies ops with target 'local'. Every write registers its expected event with the echo
 * guard BEFORE calling the bookmarks API. Positions are computed relative to `afterKey`
 * against the live native children, so separators, managed and unsyncable bookmarks keep
 * their places.
 */
export async function applyLocalOps(ops: SyncOp[], ctx: LocalApplyContext): Promise<void> {
  const native = (key: NodeKey) => {
    if (key === ROOT_KEY) return ctx.barId;
    const id = ctx.nativeIdOf(key);
    if (!id) throw new Error(`No native bookmark for ${key}`);
    return id;
  };

  for (const op of ops) {
    if (op.target !== 'local') continue;
    switch (op.type) {
      case 'create': {
        const parentId = native(op.node.parentKey!);
        const index = await targetIndex(parentId, op.afterKey && native(op.afterKey));
        const { url } = op.node;
        const title = nativeTitle(op.node.title, url);
        await expectEvent('created', createdSignature(parentId, title, url));
        const created = await browser.bookmarks.create({ parentId, index, title, ...(url !== undefined && { url }) });
        await ctx.onCreated(op.node.key, created.id);
        break;
      }
      case 'update': {
        const id = native(op.key);
        const url = op.url ?? (await browser.bookmarks.get(id))[0]?.url;
        await expectEvent('changed', id);
        await browser.bookmarks.update(id, {
          ...(op.title !== undefined && { title: nativeTitle(op.title, url) }),
          ...(op.url !== undefined && { url: op.url }),
        });
        break;
      }
      case 'move':
        await moveAfter(native(op.key), native(op.parentKey), op.afterKey && native(op.afterKey));
        break;
      case 'delete': {
        const id = native(op.key);
        await expectEvent('removed', id);
        try {
          await browser.bookmarks.removeTree(id);
        } catch {
          // Already gone (e.g. the user deleted it meanwhile): nothing to do.
        }
        break;
      }
    }
  }
}

/** A bookmark titled by its own URL is written untitled, so icon-only bar items stay icon-only. */
function nativeTitle(title: string, url: string | undefined): string {
  return url !== undefined && title === url ? '' : title;
}

/** Native index right after `afterId` among the live children (0 when afterId is null). */
async function targetIndex(parentId: string, afterId: string | null): Promise<number> {
  if (afterId === null) return 0;
  const siblings = await browser.bookmarks.getChildren(parentId);
  const pos = siblings.findIndex((n) => n.id === afterId);
  if (pos < 0) throw new Error(`Bookmark ${afterId} is not in folder ${parentId}`);
  return pos + 1;
}

/**
 * Moves `id` right after `afterId` in `parentId`. Chrome counts a same-folder move index
 * before removing the node, Firefox after, so the result is checked and corrected once.
 */
async function moveAfter(id: string, parentId: string, afterId: string | null): Promise<void> {
  const placed = async () => {
    const siblings = await browser.bookmarks.getChildren(parentId);
    const pos = siblings.findIndex((n) => n.id === id);
    const want = afterId === null ? 0 : siblings.findIndex((n) => n.id === afterId) + 1;
    return { ok: pos === want, pos, want };
  };
  const now = await placed();
  if (now.ok) return;

  await expectEvent('moved', id);
  await browser.bookmarks.move(id, { parentId, index: await targetIndex(parentId, afterId) });
  const after = await placed();
  if (!after.ok) {
    await expectEvent('moved', id);
    await browser.bookmarks.move(id, { parentId, index: after.pos < after.want ? after.want - 1 : after.want });
  }
}

/** Created ids are unknown before the call, so creations are matched by content. */
export function createdSignature(parentId: string | undefined, title: string, url: string | undefined): string {
  return JSON.stringify([parentId ?? '', title, url ?? '']);
}

/**
 * True if the node (or, for a removed node, its old parent) is inside the bookmarks bar.
 * Used to ignore events elsewhere, e.g. in "Other bookmarks".
 */
export async function isInBar(id: string): Promise<boolean> {
  const barId = await getBookmarksBarId();
  for (let cur: string | undefined = id, depth = 0; cur && depth < 100; depth++) {
    if (cur === barId) return true;
    try {
      cur = (await browser.bookmarks.get(cur))[0]?.parentId;
    } catch {
      return false; // removed meanwhile
    }
  }
  return false;
}
