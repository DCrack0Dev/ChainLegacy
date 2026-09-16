import { ApiError } from '@/lib/api-errors';
import { clientIp } from '@/lib/api-auth';

export type RateLimitTier = 'read' | 'write' | 'claims_sensitive' | 'apikeys_sensitive' | 'cron';
export type RateLimitDecision = { allowed: boolean; retryAfterSec: number; remaining: number; limit: number; used: number };

const TIER_LIMITS_PER_MIN: Record<RateLimitTier, number> = {
  read: 300,
  write: 60,
  claims_sensitive: 20,
  apikeys_sensitive: 20,
  cron: Number.POSITIVE_INFINITY as any,
};
const TTL_SECONDS = 61;

export function rateLimitTierForEndpoint(method: string, path: string): RateLimitTier {
  const u = path.toLowerCase();
  const isWrite = method !== 'GET';
  if (!isWrite) return 'read';
  if (u.includes('/claims/transition') || u.includes('/claims') && u.endsWith('/claims')) return 'claims_sensitive';
  if (u.includes('/claims') && method === 'POST') return 'claims_sensitive';
  if (u.includes('/api-keys') || u.includes('/apikeys') || u.includes('/api_keys')) return 'apikeys_sensitive';
  return 'write';
}

function normalizeBucketKey(
  orgId: string,
  apiKeyId: string,
  ip: string,
  method: string,
  route: string,
): string {
  const safeRoute = route.replace(/[^\w\-/]+/g, '_').slice(0, 120);
  return `rl:${orgId}:${apiKeyId || 'anon'}:${ip}:${method.toUpperCase()}:${safeRoute}`;
}

function shardNowKey(tsMs: number): string {
  const ttlStart = Math.floor(tsMs / (TTL_SECONDS * 1000)) * (TTL_SECONDS * 1000);
  return String(ttlStart);
}

export interface RateLimitCounterBackend {
  incrementAndGet(bucketId: string, shardKey: string, ttlSec: number): Promise<number>;
  usedCount(bucketId: string, shardKey: string): Promise<number>;
}

export class InMemoryRateLimitBackend implements RateLimitCounterBackend {
  private state = new Map<string, { value: number; expireAt: number }>();
  async incrementAndGet(bucketId: string, shardKey: string, ttlSec: number): Promise<number> {
    const key = `${bucketId}@${shardKey}`;
    const existing = this.state.get(key);
    const now = Date.now();
    if (existing && existing.expireAt > now) {
      existing.value += 1;
      return existing.value;
    }
    const n = { value: 1, expireAt: now + ttlSec * 1000 };
    this.state.set(key, n);
    return 1;
  }
  async usedCount(bucketId: string, shardKey: string): Promise<number> {
    const key = `${bucketId}@${shardKey}`;
    const row = this.state.get(key);
    if (!row || row.expireAt <= Date.now()) return 0;
    return row.value;
  }
}

let defaultBackend: RateLimitCounterBackend = new InMemoryRateLimitBackend();
export function __setDefaultRateLimitBackend(b: RateLimitCounterBackend): void {
  defaultBackend = b;
}

export async function enforceRateLimit(args: {
  req: { headers: Headers | { get: (k: string) => string | null } };
  method: string;
  routePath: string;
  authMethod: 'api_key' | 'firebase' | 'cron' | 'unauthenticated';
  orgId: string;
  apiKeyId: string;
  now?: number;
  backend?: RateLimitCounterBackend;
}): Promise<RateLimitDecision> {
  const { method, routePath, now = Date.now(), backend = defaultBackend } = args;
  const tier = args.authMethod === 'cron' ? 'cron' : rateLimitTierForEndpoint(method, routePath);
  const limit = tier === 'cron' ? Number.POSITIVE_INFINITY : TIER_LIMITS_PER_MIN[tier];
  if (tier === 'cron') {
    return { allowed: true, retryAfterSec: 0, remaining: Number.POSITIVE_INFINITY as any, limit, used: 0 };
  }
  const ip = clientIp(args.req);
  const bucketId = normalizeBucketKey(args.orgId || 'no-org', args.apiKeyId || 'anon', ip, method, routePath);
  const shard = shardNowKey(now);
  const usedAfter = await backend.incrementAndGet(bucketId, shard, TTL_SECONDS);
  if (usedAfter > limit) {
    const bucketStartMs = parseInt(shard, 10);
    const retryAfter = Math.max(1, Math.ceil((bucketStartMs + TTL_SECONDS * 1000 - now) / 1000));
    return { allowed: false, retryAfterSec: retryAfter, remaining: 0, limit, used: usedAfter };
  }
  return { allowed: true, retryAfterSec: 0, remaining: Math.max(0, limit - usedAfter), limit, used: usedAfter };
}

export function rateLimit429Response(d: RateLimitDecision, requestId: string): Response {
  if (d.allowed) throw new Error('rateLimit429Response called with allowed=true');
  const body = JSON.stringify({
    code: 'RESOURCE_EXHAUSTED',
    error: 'Rate limit exceeded; try again later',
    requestId,
    details: { limitPerMin: d.limit, retryAfterSec: d.retryAfterSec, used: d.used },
  });
  return new Response(body, {
    status: 429,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Retry-After': String(d.retryAfterSec),
      'X-RateLimit-Limit': String(d.limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + d.retryAfterSec),
      'x-request-id': requestId,
    },
  });
}

export function __apiErrorForRateLimit(d: RateLimitDecision): ApiError {
  return new ApiError(429, 'RESOURCE_EXHAUSTED', 'Rate limit exceeded; try again later', {
    limitPerMin: d.limit,
    retryAfterSec: d.retryAfterSec,
    used: d.used,
  });
}
