import type {
  CreateCollectionBody,
  CreateRaindropBody,
  RdCollection,
  RdItemResponse,
  RdListResponse,
  RdRaindrop,
  RdUser,
} from './types';

const BASE = 'https://api.raindrop.io/rest/v1';
const PER_PAGE = 50; // API maximum
const MAX_RETRIES = 4;

export class RaindropAuthError extends Error {}
/** The request never reached Raindrop (offline, DNS, blocked). Not the user's fault; retried later. */
export class RaindropNetworkError extends Error {}
export class RaindropApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Auth is behind a function so OAuth can replace the test token later (docs/architecture.md, "Authentication"). */
export type TokenProvider = () => Promise<string>;

export class RaindropClient {
  constructor(
    private readonly getToken: TokenProvider,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  /** Cheapest authenticated call; used to test the token. */
  async getUser(): Promise<RdUser> {
    return (await this.req<{ result: boolean; user: RdUser }>('GET', '/user')).user;
  }

  // ---------- collections ----------

  async getAllCollections(): Promise<RdCollection[]> {
    const [roots, children] = await Promise.all([
      this.req<RdListResponse<RdCollection>>('GET', '/collections'),
      this.req<RdListResponse<RdCollection>>('GET', '/collections/childrens'),
    ]);
    // `/collections/childrens` also returns root collections (docs/raindrop-api.md), so dedupe by id.
    const byId = new Map<number, RdCollection>();
    for (const c of [...roots.items, ...children.items]) byId.set(c._id, c);
    return [...byId.values()];
  }

  async createCollection(body: CreateCollectionBody): Promise<RdCollection> {
    return (await this.req<RdItemResponse<RdCollection>>('POST', '/collection', body)).item;
  }

  async updateCollection(id: number, body: Partial<CreateCollectionBody>): Promise<RdCollection> {
    return (await this.req<RdItemResponse<RdCollection>>('PUT', `/collection/${id}`, body)).item;
  }

  /** Removes the collection and its descendants; their raindrops go to Trash. */
  async deleteCollection(id: number): Promise<void> {
    await this.req('DELETE', `/collection/${id}`);
  }

  // ---------- raindrops ----------

  /** All raindrops directly inside one collection (not nested), all pages. */
  async listRaindrops(collectionId: number): Promise<RdRaindrop[]> {
    const out: RdRaindrop[] = [];
    for (let page = 0; ; page++) {
      const res = await this.req<RdListResponse<RdRaindrop>>(
        'GET',
        `/raindrops/${collectionId}?perpage=${PER_PAGE}&page=${page}&sort=-sort`,
      );
      out.push(...res.items);
      if (res.items.length < PER_PAGE) return out;
    }
  }

  async createRaindrop(body: CreateRaindropBody): Promise<RdRaindrop> {
    return (await this.req<RdItemResponse<RdRaindrop>>('POST', '/raindrop', body)).item;
  }

  async updateRaindrop(id: number, body: Partial<CreateRaindropBody>): Promise<RdRaindrop> {
    return (await this.req<RdItemResponse<RdRaindrop>>('PUT', `/raindrop/${id}`, body)).item;
  }

  /** Moves to Trash (recoverable). */
  async deleteRaindrop(id: number): Promise<void> {
    await this.req('DELETE', `/raindrop/${id}`);
  }

  // ---------- transport ----------

  private async req<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    if (!token) throw new RaindropAuthError('No Raindrop token configured');

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(BASE + path, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body !== undefined && { 'Content-Type': 'application/json' }),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        throw new RaindropNetworkError(`Raindrop is unreachable (${e instanceof Error ? e.message : String(e)})`);
      }

      if (res.status === 401) throw new RaindropAuthError('Raindrop token rejected (401)');

      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(res, attempt));
        continue;
      }

      if (!res.ok) {
        throw new RaindropApiError(`${method} ${path} failed: ${res.status}`, res.status);
      }

      // Slow down proactively when close to the 120 req/min limit.
      const remaining = Number(res.headers.get('X-RateLimit-Remaining') ?? NaN);
      if (Number.isFinite(remaining) && remaining < 5) {
        await sleep(retryDelayMs(res, 0));
      }

      return (await res.json()) as T;
    }
  }
}

function retryDelayMs(res: Response, attempt: number): number {
  const reset = Number(res.headers.get('X-RateLimit-Reset') ?? NaN); // epoch seconds
  if (Number.isFinite(reset)) {
    const ms = reset * 1000 - Date.now();
    if (ms > 0 && ms < 65_000) return ms + 250;
  }
  return Math.min(30_000, 1000 * 2 ** attempt);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
