import { describe, expect, it } from 'vitest';
import { merge } from '../src/lib/sync/merge';
import { orderKey } from '../src/lib/sync/types';
import { bm, dir, kinds, opsFor, run, show, tree } from './helpers';

// Every rule in docs/architecture.md ("Merge") has a test. `run` also asserts for every case that
// applying the ops brings both sides exactly to newBase and that a second merge is a no-op.

const base = tree(bm('r:1', 'A'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C')));

describe('merge: existence table', () => {
  it('local-only new node is created on remote', () => {
    const local = tree(bm('r:1', 'A'), bm('n:7', 'New'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const r = run({ base, local, remote: base });
    expect(kinds(r, 'remote')).toEqual(['create:n:7']);
    expect(kinds(r, 'local')).toEqual([]);
    expect(show(r.newBase)).toBe('A,New,B,Dev[C]');
  });

  it('remote-only new node is created locally', () => {
    const remote = tree(bm('r:1', 'A'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C'), bm('r:4', 'D')));
    const r = run({ base, local: base, remote });
    expect(kinds(r, 'local')).toEqual(['create:r:4']);
    expect(kinds(r, 'remote')).toEqual([]);
  });

  it('deleted locally, unchanged remotely -> deleted on remote', () => {
    const local = tree(bm('r:1', 'A'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const r = run({ base, local, remote: base });
    expect(kinds(r, 'remote')).toEqual(['delete:r:2']);
    expect(kinds(r, 'local')).toEqual([]);
  });

  it('deleted remotely, unchanged locally -> deleted locally', () => {
    const remote = tree(bm('r:1', 'A'), bm('r:2', 'B'), dir('c:10', 'Dev'));
    const r = run({ base, local: base, remote });
    expect(kinds(r, 'local')).toEqual(['delete:r:3']);
  });

  it('deleted locally, changed remotely later -> resurrected locally', () => {
    const local = tree(bm('r:1', 'A'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const remote = tree(bm('r:1', 'A'), bm('r:2', 'B renamed', 'https://b.test/'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const r = run({ base, local, remote, localTouchedAt: { 'r:2': 100 }, remoteUpdatedAt: { 'r:2': 200 } });
    expect(kinds(r, 'local')).toEqual(['create:r:2']);
    expect(kinds(r, 'remote')).toEqual([]);
    expect(show(r.newBase)).toBe('A,B renamed,Dev[C]');
  });

  it('deleted locally after the remote change -> deleted on remote', () => {
    const local = tree(bm('r:1', 'A'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const remote = tree(bm('r:1', 'A'), bm('r:2', 'B renamed'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const r = run({ base, local, remote, localTouchedAt: { 'r:2': 300 }, remoteUpdatedAt: { 'r:2': 200 } });
    expect(kinds(r, 'remote')).toEqual(['delete:r:2']);
  });

  it('deleted remotely, changed locally later -> resurrected on remote', () => {
    const local = tree(bm('r:1', 'A'), bm('r:2', 'B', 'https://b.test/new'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const remote = tree(bm('r:1', 'A'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const r = run({ base, local, remote, localTouchedAt: { 'r:2': 100 } });
    expect(kinds(r, 'remote')).toEqual(['create:r:2']);
    expect(r.newBase.nodes.get('r:2')?.url).toBe('https://b.test/new');
  });

  it('deleted on both sides -> dropped from base, no ops', () => {
    const both = tree(bm('r:1', 'A'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const r = run({ base, local: both, remote: both });
    expect(r.ops).toEqual([]);
    expect(r.newBase.nodes.has('r:2')).toBe(false);
  });
});

describe('merge: field conflicts (last-write-wins)', () => {
  it('only local changed title -> local wins', () => {
    const local = tree(bm('r:1', 'A local', 'https://a.test/'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C')));
    // Remote timestamp is newer but remote did not change the title.
    const r = run({ base, local, remote: base, localTouchedAt: { 'r:1': 1 }, remoteUpdatedAt: { 'r:1': 999 } });
    expect(r.ops).toEqual([{ type: 'update', target: 'remote', key: 'r:1', title: 'A local' }]);
  });

  it('both changed title, remote newer -> remote wins', () => {
    const local = tree(bm('r:1', 'A local', 'https://a.test/'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const remote = tree(bm('r:1', 'A remote', 'https://a.test/'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const r = run({ base, local, remote, localTouchedAt: { 'r:1': 100 }, remoteUpdatedAt: { 'r:1': 200 } });
    expect(r.ops).toEqual([{ type: 'update', target: 'local', key: 'r:1', title: 'A remote' }]);
  });

  it('both changed url, local newer -> local wins', () => {
    const local = tree(bm('r:1', 'A', 'https://local.test'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const remote = tree(bm('r:1', 'A', 'https://remote.test'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const r = run({ base, local, remote, localTouchedAt: { 'r:1': 300 }, remoteUpdatedAt: { 'r:1': 200 } });
    expect(r.ops).toEqual([{ type: 'update', target: 'remote', key: 'r:1', url: 'https://local.test' }]);
  });

  it('title changed on one side, url on the other -> both changes kept', () => {
    const local = tree(bm('r:1', 'A new', 'https://a.test/'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const remote = tree(bm('r:1', 'A', 'https://a.test/new'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C')));
    const r = run({ base, local, remote, localTouchedAt: { 'r:1': 100 }, remoteUpdatedAt: { 'r:1': 200 } });
    expect(r.newBase.nodes.get('r:1')).toMatchObject({ title: 'A new', url: 'https://a.test/new' });
  });

  it('move that would create a cycle is rejected', () => {
    const b = tree(dir('c:1', 'X'), dir('c:2', 'Y'));
    const local = tree(dir('c:1', 'X', dir('c:2', 'Y'))); // Y into X
    const remote = tree(dir('c:2', 'Y', dir('c:1', 'X'))); // X into Y
    const r = run({ base: b, local, remote, localTouchedAt: { 'c:2': 100 }, remoteUpdatedAt: { 'c:1': 200 } });
    // Exactly one of the two moves survives; the result is a tree, not a loop.
    expect(['X[Y[]]', 'Y[X[]]']).toContain(show(r.newBase));
  });
});

describe('merge: folders', () => {
  it('folder deleted on one side while a child was added on the other -> folder resurrected', () => {
    const local = tree(bm('r:1', 'A'), bm('r:2', 'B')); // Dev deleted locally
    const remote = tree(bm('r:1', 'A'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C'), bm('r:4', 'New')));
    const r = run({ base, local, remote, localTouchedAt: { 'c:10': 100, 'r:3': 100 } });
    expect(show(r.newBase)).toBe('A,B,Dev[New]');
    expect(kinds(r, 'local')).toEqual(['create:c:10', 'create:r:4']);
    expect(kinds(r, 'remote')).toEqual(['delete:r:3']);
  });

  it('folder deleted remotely while a child was added locally -> folder resurrected', () => {
    const local = tree(bm('r:1', 'A'), bm('r:2', 'B'), dir('c:10', 'Dev', bm('r:3', 'C'), bm('n:5', 'New')));
    const remote = tree(bm('r:1', 'A'), bm('r:2', 'B'));
    const r = run({ base, local, remote });
    expect(show(r.newBase)).toBe('A,B,Dev[New]');
    expect(kinds(r, 'remote')).toEqual(['create:c:10', 'create:n:5']);
  });

  it('creating a nested folder tree emits parent creates before children', () => {
    const local = tree(dir('n:1', 'P', dir('n:2', 'Q', bm('n:3', 'Leaf'))));
    const r = run({ base: tree(), local, remote: tree() });
    expect(kinds(r, 'remote')).toEqual(['create:n:1', 'create:n:2', 'create:n:3']);
  });

  it('deleting a folder tree emits child deletes before parent', () => {
    const local = tree(bm('r:1', 'A'), bm('r:2', 'B'));
    const r = run({ base, local, remote: base });
    expect(kinds(r, 'remote')).toEqual(['delete:r:3', 'delete:c:10']);
  });

  it('moving a bookmark out of a folder that is deleted keeps the bookmark', () => {
    const local = tree(bm('r:1', 'A'), bm('r:3', 'C'), bm('r:2', 'B')); // C moved out, Dev deleted
    const r = run({ base, local, remote: base, localTouchedAt: { 'r:3': 100, 'c:10': 100 } });
    expect(show(r.newBase)).toBe('A,C,B');
    const remoteOps = kinds(r, 'remote');
    expect(remoteOps.indexOf('move:r:3')).toBeLessThan(remoteOps.indexOf('delete:c:10'));
  });
});

describe('merge: ordering', () => {
  const flat = tree(bm('r:1', 'A'), bm('r:2', 'B'), bm('r:3', 'C'), bm('r:4', 'D'));

  it('reorder on one side only is applied to the other', () => {
    const local = tree(bm('r:4', 'D'), bm('r:1', 'A'), bm('r:2', 'B'), bm('r:3', 'C'));
    const r = run({ base: flat, local, remote: flat });
    expect(show(r.newBase)).toBe('D,A,B,C');
    expect(kinds(r, 'remote')).toEqual(['move:r:4']); // a single move, not one per sibling
  });

  it('reorder on both sides -> newer side wins for that folder', () => {
    const local = tree(bm('r:4', 'D'), bm('r:1', 'A'), bm('r:2', 'B'), bm('r:3', 'C'));
    const remote = tree(bm('r:2', 'B'), bm('r:1', 'A'), bm('r:3', 'C'), bm('r:4', 'D'));
    const remoteNewer = run({
      base: flat, local, remote,
      localTouchedAt: { 'r:4': 100 },
      remoteUpdatedAt: { [orderKey('root')]: 200 },
    });
    expect(show(remoteNewer.newBase)).toBe('B,A,C,D');

    const localNewer = run({
      base: flat, local, remote,
      localTouchedAt: { 'r:4': 300 },
      remoteUpdatedAt: { [orderKey('root')]: 200 },
    });
    expect(show(localNewer.newBase)).toBe('D,A,B,C');
  });

  it('interleaved folder/bookmark order is preserved', () => {
    const b = tree(bm('r:1', 'A'), dir('c:1', 'F1'), bm('r:2', 'B'), dir('c:2', 'F2'), bm('r:3', 'C'));
    const local = tree(dir('c:2', 'F2'), bm('r:1', 'A'), bm('r:3', 'C'), dir('c:1', 'F1'), bm('r:2', 'B'));
    const r = run({ base: b, local, remote: b });
    expect(show(r.newBase)).toBe('F2[],A,C,F1[],B');
  });

  it('new node is placed next to its neighbour from its own side', () => {
    const local = tree(bm('r:1', 'A'), bm('r:2', 'B'), bm('n:9', 'Local new'), bm('r:3', 'C'), bm('r:4', 'D'));
    const remote = tree(bm('r:4', 'D'), bm('r:1', 'A'), bm('r:2', 'B'), bm('r:3', 'C'), bm('r:5', 'Remote new'));
    const r = run({ base: flat, local, remote });
    // Remote reordered, so remote order wins; the local insert keeps its spot after B.
    expect(show(r.newBase)).toBe('D,A,B,Local new,C,Remote new');
  });

  it('new node at the start of its side stays first', () => {
    const local = tree(bm('n:9', 'First'), bm('r:1', 'A'), bm('r:2', 'B'), bm('r:3', 'C'), bm('r:4', 'D'));
    const remote = tree(bm('r:2', 'B'), bm('r:1', 'A'), bm('r:3', 'C'), bm('r:4', 'D'));
    const r = run({ base: flat, local, remote });
    expect(show(r.newBase)).toBe('First,B,A,C,D');
  });

  it('move into another folder lands at the position chosen on its side', () => {
    const b = tree(bm('r:1', 'A'), dir('c:1', 'F', bm('r:2', 'B'), bm('r:3', 'C')));
    const local = tree(dir('c:1', 'F', bm('r:2', 'B'), bm('r:1', 'A'), bm('r:3', 'C')));
    const r = run({ base: b, local, remote: b, localTouchedAt: { 'r:1': 100 } });
    expect(show(r.newBase)).toBe('F[B,A,C]');
    expect(opsFor(r, 'remote')).toEqual([
      { type: 'move', target: 'remote', key: 'r:1', parentKey: 'c:1', index: 1, afterKey: 'r:2' },
    ]);
  });
});

describe('merge: first sync (base = null)', () => {
  it('matches folders by path and bookmarks by normalized url', () => {
    const local = tree(
      bm('n:1', 'Laravel', 'https://www.laravel.com/docs/'),
      dir('n:2', 'Dev', bm('n:3', 'MDN', 'http://developer.mozilla.org#top')),
    );
    const remote = tree(
      bm('r:1', 'Laravel', 'https://laravel.com/docs'),
      dir('c:2', 'Dev', bm('r:3', 'MDN', 'https://developer.mozilla.org/')),
    );
    const r = run({ local, remote });
    expect(r.localRekey).toEqual(new Map([['n:1', 'r:1'], ['n:2', 'c:2'], ['n:3', 'r:3']]));
    expect([...r.newBase.nodes.keys()].sort()).toEqual(['c:2', 'r:1', 'r:3']);
  });

  it('only matches bookmarks inside matched folders', () => {
    const local = tree(dir('n:1', 'A', bm('n:2', 'X', 'https://x.test')));
    const remote = tree(dir('c:1', 'B', bm('r:2', 'X', 'https://x.test')));
    const r = run({ local, remote });
    expect(r.localRekey.size).toBe(0);
    expect(show(r.newBase)).toBe('A[X],B[X]');
  });

  it('duplicate urls in one folder are matched in order of appearance', () => {
    const local = tree(bm('n:1', 'one', 'https://d.test'), bm('n:2', 'two', 'https://d.test'), bm('n:3', 'three', 'https://d.test'));
    const remote = tree(bm('r:1', 'uno', 'https://d.test'), bm('r:2', 'dos', 'https://d.test'));
    const r = run({ local, remote });
    expect(r.localRekey).toEqual(new Map([['n:1', 'r:1'], ['n:2', 'r:2']]));
    expect(kinds(r, 'remote')).toEqual(['create:n:3']);
  });

  it('never emits delete ops', () => {
    const local = tree(bm('n:1', 'A'), dir('n:2', 'Only local', bm('n:3', 'B')));
    const remote = tree(bm('r:9', 'Z'), dir('c:8', 'Only remote', bm('r:7', 'Y')));
    const r = run({ local, remote });
    expect(r.ops.some((o) => o.type === 'delete')).toBe(false);
    expect(r.summary.local.create).toBe(3);
    expect(r.summary.remote.create).toBe(3);
  });

  it('keeps local order at root and appends remote-only nodes', () => {
    const local = tree(bm('n:1', 'B', 'https://b.test'), bm('n:2', 'A', 'https://a.test'));
    const remote = tree(bm('r:3', 'C', 'https://c.test'), bm('r:2', 'A', 'https://a.test'), bm('r:1', 'B', 'https://b.test'));
    const r = run({ local, remote });
    expect(show(r.newBase)).toBe('B,A,C');
  });

  it('matched pair with different titles: newer side wins', () => {
    const local = tree(bm('n:1', 'Local title', 'https://a.test'));
    const remote = tree(bm('r:1', 'Remote title', 'https://a.test'));
    expect(show(run({ local, remote, localTouchedAt: { 'n:1': 300 }, remoteUpdatedAt: { 'r:1': 200 } }).newBase)).toBe(
      'Local title',
    );
    expect(show(run({ local, remote, remoteUpdatedAt: { 'r:1': 200 } }).newBase)).toBe('Remote title');
  });
});

describe('merge: properties', () => {
  const local = tree(bm('r:2', 'B'), bm('n:5', 'New'), dir('c:10', 'Dev', bm('r:3', 'C2')));
  const remote = tree(bm('r:1', 'A'), dir('c:10', 'Dev', bm('r:3', 'C'), bm('r:6', 'R')), bm('r:2', 'B'));
  const input = {
    base,
    local,
    remote,
    localTouchedAt: new Map([['r:3', 100]]),
    remoteUpdatedAt: new Map([['r:6', 50]]),
  };

  it('is idempotent: merging the result again yields no ops', () => {
    run({ base, local, remote, localTouchedAt: { 'r:3': 100 }, remoteUpdatedAt: { 'r:6': 50 } });
  });

  it('is deterministic: same input -> same op list', () => {
    expect(merge(input)).toEqual(merge(input));
    const shuffled = { ...input, local: { ...local, nodes: new Map([...local.nodes].reverse()) } };
    expect(merge(shuffled).ops).toEqual(merge(input).ops);
  });

  it('nothing changed -> no ops', () => {
    expect(merge({ ...input, local: base, remote: base }).ops).toEqual([]);
  });
});
