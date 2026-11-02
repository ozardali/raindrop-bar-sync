/**
 * Human-readable activity entries. `describeOps` is pure so it can be tested; storing the
 * entries lives in state.ts.
 */
import { msg, type Msg } from '../../i18n/types';
import { ROOT_KEY, type NodeKey, type Snapshot, type SyncOp } from './types';

export type ActivityKind = 'sync' | 'error' | 'warn' | 'paused';

export interface ActivityEntry {
  at: number;
  kind: ActivityKind;
  /** What happened, translated when shown. Entries from before translations have `message`. */
  msg?: Msg;
  message?: string;
  /** One line per change, e.g. "Added to Raindrop: GitHub". */
  details?: (Msg | string)[];
  /** How many times the same message repeated in a row (shown as ×n). */
  count?: number;
}

export const MAX_ACTIVITY = 50;
const MAX_DETAILS = 30;

/**
 * Describes one sync's ops. `remote` ops are changes made in this browser and sent to
 * Raindrop; `local` ops are changes that came from Raindrop. Titles come from the final
 * tree, or from the side's snapshot for deleted and renamed nodes.
 */
export function describeOps(
  ops: SyncOp[],
  final: Snapshot,
  sides: { local: Snapshot; remote: Snapshot },
  /** Which other browser sent a change for this key to Raindrop, if known. */
  origin: (key: NodeKey) => string | undefined = () => undefined,
  firstSync = false,
): { msg: Msg; details: Msg[] } {
  const lines: Msg[] = [];
  const origins = new Set<string | undefined>();
  for (const op of ops) {
    const from = op.target === 'local' ? origin(op.type === 'create' ? op.node.key : op.key) : undefined;
    if (op.target === 'local') origins.add(from);
    const count = lines.length;
    const side = sides[op.target];
    const remote = op.target === 'remote';
    const title = (key: NodeKey) =>
      key === ROOT_KEY ? msg('common.bar') : label(final.nodes.get(key)?.title ?? side.nodes.get(key)?.title);

    switch (op.type) {
      case 'create':
        lines.push(msg(remote ? 'act.addedRemote' : 'act.addedLocal', { title: label(op.node.title) }));
        break;
      case 'update': {
        const before = side.nodes.get(op.key);
        if (op.title !== undefined) {
          lines.push(msg(remote ? 'act.renamedRemote' : 'act.renamedLocal', { from: label(before?.title), to: label(op.title) }));
        }
        if (op.url !== undefined) lines.push(msg(remote ? 'act.linkRemote' : 'act.linkLocal', { title: title(op.key) }));
        break;
      }
      case 'move': {
        const before = side.nodes.get(op.key);
        lines.push(
          before?.parentKey === op.parentKey
            ? msg(remote ? 'act.reorderedRemote' : 'act.reorderedLocal', { title: title(op.key) })
            : msg(remote ? 'act.movedRemote' : 'act.movedLocal', { title: title(op.key), folder: title(op.parentKey) }),
        );
        break;
      }
      case 'delete':
        lines.push(msg(remote ? 'act.deletedRemote' : 'act.deletedLocal', { title: label(side.nodes.get(op.key)?.title) }));
        break;
    }
    if (from) for (let i = count; i < lines.length; i++) lines[i] = msg('act.fromDevice', { line: lines[i]!, device: from });
  }
  // "received from Firefox" when every incoming change is known to come from one browser.
  const source = origins.size === 1 ? [...origins][0] : undefined;

  const toRaindrop = ops.filter((o) => o.target === 'remote').length;
  const fromRaindrop = ops.length - toRaindrop;
  const sent = msg('act.sent', { n: toRaindrop });
  const received = msg('act.received', { n: fromRaindrop, source: source ?? 'Raindrop' });
  const summary =
    toRaindrop && fromRaindrop
      ? msg(firstSync ? 'act.firstSyncBoth' : 'act.syncedBoth', { sent, received })
      : msg(firstSync ? 'act.firstSync' : 'act.synced', { parts: toRaindrop ? sent : received });

  const details = lines.length > MAX_DETAILS
    ? [...lines.slice(0, MAX_DETAILS), msg('act.more', { n: lines.length - MAX_DETAILS })]
    : lines;
  return { msg: summary, details };
}

/**
 * Adds an entry to the front of the log. The same kind and message right after itself is
 * folded into one entry with a counter (e.g. the same error on every alarm).
 */
export function appendActivity(log: ActivityEntry[], entry: ActivityEntry): ActivityEntry[] {
  const [last, ...rest] = log;
  const same = (a: ActivityEntry, b: ActivityEntry) =>
    a.kind === b.kind && JSON.stringify(a.msg ?? a.message) === JSON.stringify(b.msg ?? b.message);
  if (last && !entry.details?.length && same(last, entry)) {
    return [{ ...last, at: entry.at, count: (last.count ?? 1) + 1 }, ...rest];
  }
  return [entry, ...log].slice(0, MAX_ACTIVITY);
}

function label(title: string | undefined): Msg {
  return title?.trim() ? msg('common.quoted', { text: title }) : msg('common.untitled');
}
