import { browser, type Browser } from 'wxt/browser';

type BookmarkNode = Browser.bookmarks.BookmarkTreeNode;

const FIREFOX_TOOLBAR_ID = 'toolbar_____';
const CHROMIUM_BAR_ID = '1';

/**
 * Returns the id of the native bookmarks bar folder in the current browser.
 * See docs/architecture.md, "Browser differences". Not yet verified on Vivaldi and Brave.
 */
export async function getBookmarksBarId(): Promise<string> {
  const [root] = await browser.bookmarks.getTree();
  const top: BookmarkNode[] = root?.children ?? [];

  const firefox = top.find((n) => n.id === FIREFOX_TOOLBAR_ID);
  if (firefox) return firefox.id;

  // Newer Chromium exposes folderType.
  const typed = top.find((n) => (n as { folderType?: string }).folderType === 'bookmarks-bar');
  if (typed) return typed.id;

  const legacy = top.find((n) => n.id === CHROMIUM_BAR_ID);
  if (legacy) return legacy.id;

  throw new Error('Could not locate the bookmarks bar folder');
}

export function isSeparator(n: BookmarkNode): boolean {
  return (n as { type?: string }).type === 'separator';
}

export function isUnmodifiable(n: BookmarkNode): boolean {
  return Boolean((n as { unmodifiable?: string }).unmodifiable);
}
