import { describe, expect, it } from 'vitest';
import { ROOT_KEY, type NodeKey, type Snapshot } from '../src/lib/sync/types';
import { clone, edit, prng } from './random';
import { run } from './helpers';

// Randomized check of the invariants `run` asserts (ops converge both sides to newBase,
// second merge is a no-op) plus "nothing new is ever lost", over many random edit histories.

describe('merge: randomized invariants', () => {
  for (let seed = 1; seed <= 400; seed++) {
    it(`seed ${seed}`, () => {
      const rand = prng(seed);
      let next = 0;
      const base: Snapshot = { rootKey: ROOT_KEY, nodes: new Map() };
      const baseTouched = new Map<NodeKey, number>();
      const n = 3 + Math.floor(rand() * 10);
      for (let i = 0; i < n; i++) edit(base, rand, () => `r:${next++}`, baseTouched, 0);

      const local = clone(base);
      const remote = clone(base);
      const lt = new Map<NodeKey, number>();
      const rt = new Map<NodeKey, number>();
      let now = 1;
      for (let i = 0; i < 1 + Math.floor(rand() * 6); i++) {
        if (rand() < 0.5) edit(local, rand, () => `n:${next++}`, lt, now++);
        else edit(remote, rand, () => `r:${next++}`, rt, now++);
      }

      const r = run({ base, local, remote, localTouchedAt: Object.fromEntries(lt), remoteUpdatedAt: Object.fromEntries(rt) });

      // Nothing created on either side since the base may be lost.
      for (const side of [local, remote]) {
        for (const k of side.nodes.keys()) {
          if (!base.nodes.has(k)) expect(r.newBase.nodes.has(k), `new node ${k} kept`).toBe(true);
        }
      }
    });
  }
});

describe('merge: randomized first sync', () => {
  for (let seed = 1; seed <= 200; seed++) {
    it(`seed ${seed}`, () => {
      const rand = prng(seed * 7919);
      let next = 0;
      const local: Snapshot = { rootKey: ROOT_KEY, nodes: new Map() };
      const remote: Snapshot = { rootKey: ROOT_KEY, nodes: new Map() };
      // Small title/url domains so that many nodes match, including duplicates.
      for (let i = 0; i < 2 + Math.floor(rand() * 10); i++) edit(local, rand, () => `n:${next++}`, new Map(), 0);
      for (let i = 0; i < 2 + Math.floor(rand() * 10); i++) edit(remote, rand, () => `r:${next++}`, new Map(), 0);

      const r = run({ local, remote });
      expect(r.ops.some((o) => o.type === 'delete')).toBe(false);
      // Every node of both sides survives (local ones possibly under their matched remote key).
      expect(r.newBase.nodes.size).toBe(local.nodes.size + remote.nodes.size - r.localRekey.size);
    });
  }
});
