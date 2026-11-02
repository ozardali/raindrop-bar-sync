import { describe, expect, it } from 'vitest';
import { RaindropClient, RaindropNetworkError } from '../src/lib/raindrop/client';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('RaindropClient.getAllCollections', () => {
  it('dedupes root collections that /collections/childrens also returns', async () => {
    const root = { _id: 1, title: 'Bar' };
    const child = { _id: 2, title: 'Dev', parent: { $id: 1 } };
    const fetchImpl = (async (url: string) =>
      url.endsWith('/collections/childrens')
        ? json({ result: true, items: [root, child] })
        : json({ result: true, items: [root] })) as unknown as typeof fetch;
    const client = new RaindropClient(async () => 'token', fetchImpl);
    expect((await client.getAllCollections()).map((c) => c._id)).toEqual([1, 2]);
  });
});

describe('RaindropClient network errors', () => {
  it('reports an unreachable API as RaindropNetworkError', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const client = new RaindropClient(async () => 'token', fetchImpl);
    await expect(client.getUser()).rejects.toBeInstanceOf(RaindropNetworkError);
  });
});
