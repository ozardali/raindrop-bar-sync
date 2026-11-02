import type { Translator } from '../../src/i18n';
import type { RdCollection } from '../../src/lib/raindrop/types';
import { childrenOf, type NodeKey, type Snapshot } from '../../src/lib/sync/types';

/** Renders a Snapshot as nested <li> elements in index order. Uses textContent only. */
export function renderSnapshot(list: HTMLUListElement, snap: Snapshot, tr: Translator): void {
  list.replaceChildren(...renderChildren(snap, snap.rootKey, tr));
}

function renderChildren(snap: Snapshot, parentKey: NodeKey, tr: Translator): HTMLLIElement[] {
  return childrenOf(snap, parentKey).map((n) => {
    const li = document.createElement('li');
    if (n.kind === 'folder') {
      li.textContent = `📁 ${n.title}`;
      const ul = document.createElement('ul');
      ul.append(...renderChildren(snap, n.key, tr));
      li.append(ul);
    } else {
      li.textContent = `🔖 ${n.title || tr.t('common.untitled')}`;
      const url = document.createElement('span');
      url.className = 'url';
      url.textContent = n.url ?? '';
      li.append(url);
    }
    return li;
  });
}

export function summarizeSnapshot(snap: Snapshot, tr: Translator): string {
  let folders = 0;
  let bookmarks = 0;
  for (const n of snap.nodes.values()) n.kind === 'folder' ? folders++ : bookmarks++;
  return tr.list([tr.t('common.folders', { n: folders }), tr.t('common.bookmarks', { n: bookmarks })]);
}

/** Collections in Raindrop sidebar order (`sort` ascending) with their nesting depth. */
export function collectionTree(all: RdCollection[]): { collection: RdCollection; depth: number }[] {
  const byParent = new Map<number | null, RdCollection[]>();
  const ids = new Set(all.map((c) => c._id));
  for (const c of all) {
    const parent = c.parent && ids.has(c.parent.$id) ? c.parent.$id : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), c]);
  }
  const out: { collection: RdCollection; depth: number }[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const c of (byParent.get(parent) ?? []).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
      out.push({ collection: c, depth });
      walk(c._id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
