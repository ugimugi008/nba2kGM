/**
 * Room storage backends.
 *
 * - memory:  single Node process (local `npm run dev`, tests).
 * - upstash: Upstash Redis REST (Vercel Marketplace "Upstash for Redis").
 *            Env: KV_REST_API_URL + KV_REST_API_TOKEN, or
 *                 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 * - redis:   any Redis over TCP. Env: REDIS_URL (or KV_URL).
 *
 * Writes use compare-and-set on a revision number so two players acting at
 * the same moment (e.g. both locking lineups) can never overwrite each other.
 */
import { ROOM_TTL_SECONDS } from './partyLogic.js';

export interface StoredRoom {
  rev: number;
  json: string;
}

export interface RoomStorage {
  readonly kind: 'memory' | 'upstash' | 'redis';
  getRev(code: string): Promise<number | null>;
  get(code: string): Promise<StoredRoom | null>;
  /** Returns false if the code is already taken. */
  create(code: string, json: string): Promise<boolean>;
  /** Writes only if the stored rev still equals expectedRev. */
  compareAndSet(code: string, expectedRev: number, json: string): Promise<boolean>;
}

const key = (code: string) => `hwgm:room:${code}`;

// KEYS[1]=room key, ARGV[1]=json, ARGV[2]=ttl
const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'rev', '1', 'data', ARGV[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return 1`;

// KEYS[1]=room key, ARGV[1]=expected rev, ARGV[2]=json, ARGV[3]=ttl
const CAS_SCRIPT = `
local cur = redis.call('HGET', KEYS[1], 'rev')
if (not cur) or cur ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'rev', tostring(tonumber(ARGV[1]) + 1), 'data', ARGV[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 1`;

function toRev(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function createMemoryStorage(): RoomStorage {
  const rooms = new Map<string, { rev: number; json: string; expiresAt: number }>();
  const live = (code: string) => {
    const entry = rooms.get(code);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      rooms.delete(code);
      return null;
    }
    return entry;
  };
  const ttlMs = ROOM_TTL_SECONDS * 1000;
  return {
    kind: 'memory',
    async getRev(code) {
      return live(code)?.rev ?? null;
    },
    async get(code) {
      const e = live(code);
      return e ? { rev: e.rev, json: e.json } : null;
    },
    async create(code, json) {
      if (live(code)) return false;
      rooms.set(code, { rev: 1, json, expiresAt: Date.now() + ttlMs });
      return true;
    },
    async compareAndSet(code, expectedRev, json) {
      const e = live(code);
      if (!e || e.rev !== expectedRev) return false;
      rooms.set(code, { rev: expectedRev + 1, json, expiresAt: Date.now() + ttlMs });
      return true;
    },
  };
}

export async function createUpstashStorage(url: string, token: string): Promise<RoomStorage> {
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url, token, automaticDeserialization: false });
  return {
    kind: 'upstash',
    async getRev(code) {
      return toRev(await redis.hget(key(code), 'rev'));
    },
    async get(code) {
      // Returns an array when automaticDeserialization is off, an object otherwise.
      const res = (await redis.hmget(key(code), 'rev', 'data')) as
        | unknown[]
        | Record<string, unknown>
        | null;
      if (!res) return null;
      const [rawRev, json] = Array.isArray(res) ? res : [res.rev, res.data];
      const rev = toRev(rawRev);
      if (rev === null || typeof json !== 'string') return null;
      return { rev, json };
    },
    async create(code, json) {
      const r = await redis.eval(CREATE_SCRIPT, [key(code)], [json, String(ROOM_TTL_SECONDS)]);
      return Number(r) === 1;
    },
    async compareAndSet(code, expectedRev, json) {
      const r = await redis.eval(
        CAS_SCRIPT,
        [key(code)],
        [String(expectedRev), json, String(ROOM_TTL_SECONDS)]
      );
      return Number(r) === 1;
    },
  };
}

type TcpClient = {
  isOpen: boolean;
  connect(): Promise<unknown>;
  hGet(k: string, f: string): Promise<string | null | undefined>;
  hmGet(k: string, f: string[]): Promise<(string | null)[]>;
  eval(script: string, opts: { keys: string[]; arguments: string[] }): Promise<unknown>;
  on(ev: 'error', cb: (err: unknown) => void): unknown;
};

export async function createTcpRedisStorage(url: string): Promise<RoomStorage> {
  const { createClient } = await import('redis');
  const client = createClient({ url }) as unknown as TcpClient;
  client.on('error', (err) => console.error('[party] redis error', err));
  let connecting: Promise<unknown> | null = null;
  const ready = async () => {
    if (client.isOpen) return;
    connecting ??= client.connect();
    await connecting;
  };
  return {
    kind: 'redis',
    async getRev(code) {
      await ready();
      return toRev(await client.hGet(key(code), 'rev'));
    },
    async get(code) {
      await ready();
      const [rev, json] = await client.hmGet(key(code), ['rev', 'data']);
      const r = toRev(rev);
      if (r === null || typeof json !== 'string') return null;
      return { rev: r, json };
    },
    async create(code, json) {
      await ready();
      const r = await client.eval(CREATE_SCRIPT, {
        keys: [key(code)],
        arguments: [json, String(ROOM_TTL_SECONDS)],
      });
      return Number(r) === 1;
    },
    async compareAndSet(code, expectedRev, json) {
      await ready();
      const r = await client.eval(CAS_SCRIPT, {
        keys: [key(code)],
        arguments: [String(expectedRev), json, String(ROOM_TTL_SECONDS)],
      });
      return Number(r) === 1;
    },
  };
}

let shared: Promise<RoomStorage> | null = null;

/** Picks a backend from environment variables (cached per process). */
export function getStorageFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<RoomStorage> {
  shared ??= (async () => {
    const restUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
    const restToken = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
    if (restUrl && restToken) return createUpstashStorage(restUrl, restToken);
    const tcpUrl = env.REDIS_URL || env.KV_URL;
    if (tcpUrl) return createTcpRedisStorage(tcpUrl);
    return createMemoryStorage();
  })();
  shared.catch(() => {
    shared = null;
  });
  return shared;
}
