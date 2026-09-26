import { Redis } from "@upstash/redis";

// the few Redis operations rooms need
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts: { ex: number; nx?: boolean }): Promise<boolean>;
  hset(key: string, field: string, value: unknown, ex: number): Promise<void>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hincr(key: string, field: string, by: number, ex: number): Promise<void>; // atomic counter (admin metrics)
}

export function memoryStore(): Store {
  const data = new Map<string, { v: unknown; until: number }>();
  const live = (k: string) => {
    const e = data.get(k);
    if (e && e.until < Date.now()) data.delete(k);
    return data.get(k);
  };
  const clone = <T>(v: unknown) => structuredClone(v) as T;
  return {
    async get<T>(k: string) {
      const e = live(k);
      return e ? clone<T>(e.v) : null;
    },
    async set(k, v, { ex, nx }) {
      if (nx && live(k)) return false;
      data.set(k, { v: clone(v), until: Date.now() + ex * 1000 });
      return true;
    },
    async hset(k, f, v, ex) {
      const h = (live(k)?.v as Record<string, unknown>) ?? {};
      data.set(k, { v: { ...h, [f]: clone(v) }, until: Date.now() + ex * 1000 });
    },
    async hgetall<T>(k: string) {
      return clone<Record<string, T>>(live(k)?.v ?? {});
    },
    async hget<T>(k: string, f: string) {
      const v = (live(k)?.v as Record<string, unknown> | undefined)?.[f];
      return v === undefined ? null : clone<T>(v);
    },
    async hincr(k, f, by, ex) {
      const h = (live(k)?.v as Record<string, number>) ?? {};
      data.set(k, { v: { ...h, [f]: (Number(h[f]) || 0) + by }, until: Date.now() + ex * 1000 });
    },
  };
}

function redisStore(redis: Redis): Store {
  return {
    get: (k) => redis.get(k),
    async set(k, v, { ex, nx }) {
      return (await (nx ? redis.set(k, v, { ex, nx: true }) : redis.set(k, v, { ex }))) === "OK";
    },
    async hset(k, f, v, ex) {
      await redis.multi().hset(k, { [f]: v }).expire(k, ex).exec();
    },
    async hgetall<T>(k: string) {
      return ((await redis.hgetall(k)) ?? {}) as Record<string, T>;
    },
    hget: (k, f) => redis.hget(k, f),
    async hincr(k, f, by, ex) {
      await redis.multi().hincrby(k, f, by).expire(k, ex).exec();
    },
  };
}

// Vercel's Upstash integration sets KV_REST_API_*; plain Upstash uses UPSTASH_REDIS_REST_*
export const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
export const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const persistent = !!(url && token);

// ponytail: memory fallback only works on a single dev server; on Vercel each function instance has its own memory
const g = globalThis as { __imposterStore?: Store };
export const db: Store =
  url && token ? redisStore(new Redis({ url, token })) : (g.__imposterStore ??= memoryStore());
