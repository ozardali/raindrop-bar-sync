// Subset of the Raindrop.io REST API types we use. Verify against
// https://developer.raindrop.io (see docs/raindrop-api.md).

export interface RdRef {
  $id: number;
}

export interface RdCollection {
  _id: number;
  title: string;
  parent?: RdRef;
  /** 0-based position among sibling collections, ascending (docs/raindrop-api.md). */
  sort?: number;
  count?: number;
  lastUpdate?: string;
}

export interface RdRaindrop {
  _id: number;
  link: string;
  title: string;
  note?: string;
  collection: RdRef;
  /** Write-only target index; never returned on GET (docs/raindrop-api.md). */
  order?: number;
  /** Read-side position; `sort=-sort` lists by this, descending. */
  sort?: number;
  lastUpdate: string;
}

export interface RdUser {
  _id: number;
  fullName?: string;
  email?: string;
}

export interface RdListResponse<T> {
  result: boolean;
  items: T[];
  count?: number;
}

export interface RdItemResponse<T> {
  result: boolean;
  item: T;
}

export interface CreateRaindropBody {
  link: string;
  title: string;
  collection: RdRef;
  /** Ignored on create (new items go to index 0); apply with a follow-up update. */
  order?: number;
  /** Silently truncated at 10 000 chars (docs/raindrop-api.md). */
  note?: string;
}

export interface CreateCollectionBody {
  title: string;
  parent?: RdRef;
  /** Ignored on create; move with a follow-up update. */
  sort?: number;
}
