import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { RaindropClient } from '../src/lib/raindrop/client';
import { merge, rekeySnapshot } from '../src/lib/sync/merge';
import { applyRemoteOps, readRemoteSnapshot } from '../src/lib/sync/remote';
import { ROOT_KEY, type NodeKey, type Snapshot } from '../src/lib/sync/types';
import { bm, canonical, dir, show, tree } from './helpers';

// Runs applyRemoteOps against the real Raindrop API inside a temporary collection, which is
// deleted afterwards (and its raindrops purged from Trash). Opt-in:
//   RAINDROP_TOKEN_FILE=/path/to/token npx vitest run tests/remote.live.test.ts
const tokenFile = process.env.RAINDROP_TOKEN_FILE;

describe.skipIf(!tokenFile)('applyRemoteOps (live Raindrop API)', () => {
  const client = new RaindropClient(async () => readFileSync(tokenFile!, 'utf8').trim());
  let rootId = 0;
  const created: number[] = [];

  afterAll(async () => {
    if (!rootId) return;
    await client.deleteCollection(rootId);
    for (const id of created) await client.deleteRaindrop(id).catch(() => {}); // purge from Trash
  });

  /** One sync round in which only the remote side receives ops. */
  async function syncFrom(base: Snapshot | null, local: Snapshot) {
    const remote = await readRemoteSnapshot(client, rootId);
    const result = merge({
      base,
      local,
      remote: remote.snapshot,
      localTouchedAt: new Map([...local.nodes.keys()].map((k) => [k, Date.now() + 60_000])),
      remoteUpdatedAt: remote.updatedAt,
    });
    const rekey = await applyRemoteOps(
      result.ops,
      {
        client,
        rootId,
        onRekey: async (_from, to) => void (to.startsWith('r:') && created.push(Number(to.slice(2)))),
        onUnsyncable: async (key, reason) => {
          throw new Error(`unexpected unsyncable ${key}: ${reason}`);
        },
        onWarning: async (m) => {
          throw new Error(JSON.stringify(m));
        },
      },
      result.newBase,
      remote.manifests,
    );
    const final = rekeySnapshot(result.newBase, rekey);
    const after = await readRemoteSnapshot(client, rootId);
    for (const m of after.manifests.values()) if (m.raindropId) created.push(m.raindropId);
    return { result, final, after: after.snapshot, rekey };
  }

  let state: Snapshot;

  it('first sync pushes a nested, interleaved tree with its exact order', { timeout: 120_000 }, async () => {
    rootId = (await client.createCollection({ title: 'bar-sync live test (temp)' }))._id;
    const local = tree(
      bm('n:1', 'One', 'https://one.test/'),
      dir('n:2', 'Dev', bm('n:3', 'Laravel', 'https://laravel.com/'), dir('n:4', 'Deep', bm('n:5', 'X', 'https://x.test/'))),
      bm('n:6', 'Two', 'https://two.test/'),
      dir('n:7', 'Empty'),
      bm('n:8', 'Three', 'https://three.test/'),
    );
    const { final, after } = await syncFrom(null, local);
    expect(show(after)).toBe('One,Dev[Laravel,Deep[X]],Two,Empty[],Three');
    expect(canonical(after)).toEqual(canonical(final));
    state = final;
  });

  it('applies rename, url change, move between folders, reorder and delete', { timeout: 120_000 }, async () => {
    const key = (title: string): NodeKey => [...state.nodes.values()].find((n) => n.title === title)!.key;
    const local = structuredClone(state);
    const set = (title: string, patch: object) => Object.assign(local.nodes.get(key(title))!, patch);
    // Root: One, Dev, Two, Empty, Three  ->  Three, Dev(renamed Code), One(url), Empty
    set('Three', { index: 0 });
    set('Dev', { index: 1, title: 'Code' });
    set('One', { index: 2, url: 'https://one.test/v2' });
    set('Empty', { index: 3 });
    local.nodes.delete(key('Two'));
    // Laravel moves from Dev into Deep, before X.
    set('Laravel', { parentKey: key('Deep'), index: 0 });
    set('Deep', { index: 0 });
    set('X', { index: 1 });

    const { result, final, after } = await syncFrom(state, local);
    expect(result.ops.every((o) => o.target === 'remote')).toBe(true);
    expect(show(after)).toBe('Three,Code[Deep[Laravel,X]],One,Empty[]');
    expect(after.nodes.get(key('One'))?.url).toBe('https://one.test/v2');
    expect(canonical(after)).toEqual(canonical(final));
    state = final;
  });

  it('a second round with no changes does nothing', { timeout: 60_000 }, async () => {
    const remote = await readRemoteSnapshot(client, rootId);
    const result = merge({
      base: state,
      local: state,
      remote: remote.snapshot,
      localTouchedAt: new Map(),
      remoteUpdatedAt: remote.updatedAt,
    });
    expect(result.ops).toEqual([]);
    expect(remote.snapshot.nodes.get(ROOT_KEY)).toBeUndefined();
  });
});
