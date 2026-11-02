import { describe, expect, it } from 'vitest';
import { appendActivity, describeOps, MAX_ACTIVITY, type ActivityEntry } from '../src/lib/sync/activity';
import { translator } from '../src/i18n';
import { merge } from '../src/lib/sync/merge';
import { bm, dir, tree } from './helpers';

const en = translator('en');
/** describeOps in English, as the UI shows it. */
const text = (d: { msg: Parameters<typeof en.m>[0]; details: Parameters<typeof en.m>[0][] }) => ({
  message: en.m(d.msg),
  details: d.details.map((x) => en.m(x)),
});

describe('describeOps', () => {
  it('describes changes in both directions with titles', () => {
    const base = tree(bm('r:1', 'GitHub'), bm('r:2', 'Old name'), dir('c:1', 'Dev', bm('r:3', 'Laravel')), bm('r:4', 'Gone'));
    const local = tree(bm('r:2', 'New name'), bm('r:1', 'GitHub'), dir('c:1', 'Dev', bm('r:3', 'Laravel')), bm('n:9', 'Fresh'));
    const remote = tree(bm('r:1', 'GitHub'), bm('r:2', 'Old name'), dir('c:1', 'Dev'), bm('r:3', 'Laravel'), bm('r:4', 'Gone'));
    const result = merge({ base, local, remote, localTouchedAt: new Map(), remoteUpdatedAt: new Map() });

    const { message, details } = text(describeOps(result.ops, result.newBase, { local, remote }));
    expect(message).toMatch(/^Synced: \d+ changes? sent to Raindrop, \d+ changes? received from Raindrop$/);
    expect(details).toEqual(
      expect.arrayContaining([
        'Added to Raindrop: “Fresh”',
        'Renamed in Raindrop: “Old name” → “New name”',
        'Deleted from Raindrop: “Gone”',
        'Moved here: “Laravel” → Bookmarks bar',
      ]),
    );
  });

  it('calls a move inside the same folder a reorder', () => {
    const base = tree(bm('r:1', 'A'), bm('r:2', 'B'));
    const local = tree(bm('r:2', 'B'), bm('r:1', 'A'));
    const result = merge({ base, local, remote: base, localTouchedAt: new Map(), remoteUpdatedAt: new Map() });
    expect(text(describeOps(result.ops, result.newBase, { local, remote: base })).details).toEqual(['Reordered in Raindrop: “A”']);
  });

  it('names the browser an incoming change came from', () => {
    const base = tree(bm('r:1', 'A'));
    const remote = tree(bm('r:1', 'A'), bm('r:2', 'From Firefox'));
    const result = merge({ base, local: base, remote, localTouchedAt: new Map(), remoteUpdatedAt: new Map() });
    const described = text(describeOps(result.ops, result.newBase, { local: base, remote }, (k) => (k === 'r:2' ? 'Firefox' : undefined)));
    expect(described).toEqual({
      message: 'Synced: 1 change received from Firefox',
      details: ['Added here: “From Firefox” (from Firefox)'],
    });
  });

  it('caps very long change lists', () => {
    const local = tree(...Array.from({ length: 40 }, (_, i) => bm(`n:${i}`, `B${i}`)));
    const result = merge({ base: tree(), local, remote: tree(), localTouchedAt: new Map(), remoteUpdatedAt: new Map() });
    const { details } = text(describeOps(result.ops, result.newBase, { local, remote: tree() }));
    expect(details).toHaveLength(31);
    expect(details.at(-1)).toBe('…and 10 more');
  });
});

describe('appendActivity', () => {
  const err = (at: number): ActivityEntry => ({ at, kind: 'error', msg: { k: 'common.tokenInvalid' } });

  it('folds the same message in a row into a counter', () => {
    const log = appendActivity(appendActivity(appendActivity([], err(1)), err(2)), err(3));
    expect(log).toEqual([{ ...err(3), count: 3 }]);
  });

  it('keeps different messages apart and caps the log', () => {
    let log: ActivityEntry[] = [];
    for (let i = 0; i < MAX_ACTIVITY + 10; i++) log = appendActivity(log, { at: i, kind: 'warn', msg: { k: 'act.error', p: { error: `w${i}` } } });
    expect(log).toHaveLength(MAX_ACTIVITY);
    expect(en.m(log[0]!.msg!)).toBe(`w${MAX_ACTIVITY + 9}`);
  });
});
