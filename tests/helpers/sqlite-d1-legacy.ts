/**
 * Legacy stubs extracted from the original mock-env.ts so later tests can
 * continue to import them unchanged while the auth tests use the new
 * createMockEnv() surface. Kept separate to avoid circular imports.
 */

// ---------------------------------------------------------------------------
// R2 stub — tracks operations for assertion
// ---------------------------------------------------------------------------

export interface R2ObjectStub {
  key: string;
  body: Uint8Array;
  httpEtag: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  get(options?: { range?: { offset: number; length: number } }): R2ObjectStub | null;
}

export class R2BucketStub {
  private objects = new Map<string, Uint8Array>();
  public deleted: string[] = [];

  async head(key: string): Promise<{ key: string } | null> {
    if (!this.objects.has(key)) return null;
    return { key };
  }

  async get(
    key: string,
    opts?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectBodyStub | null> {
    const data = this.objects.get(key);
    if (!data) return null;
    const slice = opts?.range
      ? data.slice(opts.range.offset, opts.range.offset + opts.range.length)
      : data;
    return new R2ObjectBodyStub(slice);
  }

  async put(key: string, body: ArrayBuffer | Uint8Array): Promise<void> {
    const buf = body instanceof Uint8Array ? body : new Uint8Array(body);
    this.objects.set(key, buf);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deleted.push(key);
  }

  seed(key: string, data: Uint8Array): void {
    this.objects.set(key, data);
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }
}

export class R2ObjectBodyStub {
  readonly httpEtag = '"test-etag"';
  readonly body: ReadableStream;

  constructor(private data: Uint8Array) {
    const d = data;
    this.body = new ReadableStream({
      start(controller) {
        controller.enqueue(d);
        controller.close();
      },
    });
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    // Slice to get a plain ArrayBuffer (avoids SharedArrayBuffer union type)
    const ab = this.data.buffer instanceof SharedArrayBuffer
      ? new Uint8Array(this.data).buffer
      : this.data.buffer;
    return (ab as ArrayBuffer).slice(
      this.data.byteOffset,
      this.data.byteOffset + this.data.byteLength,
    );
  }
}

// ---------------------------------------------------------------------------
// KV stub
// ---------------------------------------------------------------------------

export class KVNamespaceStub {
  private store = new Map<string, { value: string; expiry?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() / 1000 > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const expiry = opts?.expirationTtl
      ? Math.floor(Date.now() / 1000) + opts.expirationTtl
      : undefined;
    this.store.set(key, { value, expiry });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Test helper: seed a raw count into a bucket key. */
  seed(key: string, value: string, expirySecondsFromNow?: number): void {
    const expiry = expirySecondsFromNow
      ? Math.floor(Date.now() / 1000) + expirySecondsFromNow
      : undefined;
    this.store.set(key, { value, expiry });
  }
}

// ---------------------------------------------------------------------------
// Record shapes preserved for legacy callers
// ---------------------------------------------------------------------------

export interface PhotoRecord {
  id: string;
  person_id: string;
  object_key: string;
  mime: string;
  bytes: number;
  uploaded_by: string | null;
  created_at: Date;
}

export interface PersonRecord {
  id: string;
  tree_id: string;
  name: string;
  name_en: string | null;
  nick: string | null;
  born: number | null;
  died: number | null;
  gender: 'm' | 'f' | null;
  hometown: string | null;
  is_me: boolean;
  external: boolean;
  avatar_key: string | null;
  extra: unknown;
}

export interface TreeRecord {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  owner_id: string | null;
  is_public: boolean;
  created_at: Date;
}

export interface TreeMemberRecord {
  id: string;
  tree_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: Date;
}

export class InMemoryStore {
  photos: PhotoRecord[] = [];
  people: PersonRecord[] = [];
  trees: TreeRecord[] = [];
  tree_members: TreeMemberRecord[] = [];
}

/**
 * Legacy env builder — leaves DB as an empty shim, matches the original surface
 * used by upload tests. Auth tests should use `createMockEnv()` instead.
 */
export function buildMockEnv(overrides?: {
  r2?: R2BucketStub;
  kv?: KVNamespaceStub;
  store?: InMemoryStore;
}) {
  const r2 = overrides?.r2 ?? new R2BucketStub();
  const kv = overrides?.kv ?? new KVNamespaceStub();

  return {
    r2,
    kv,
    env: {
      ASSETS: {} as Fetcher,
      DB: {} as D1Database,
      PHOTOS: r2 as unknown as R2Bucket,
      KV_RL: kv as unknown as KVNamespace,
      APP_URL: 'http://localhost:8787',
    },
  };
}
