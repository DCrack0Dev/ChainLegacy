import { createHash, randomBytes } from 'crypto';
import { ApiError } from '@/lib/api-errors';

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_KEY_MAX_LEN = 64;

export type CachedResponse = {
  status: number;
  body: string;
  headers: Record<string, string>;
  requestId: string;
};

export type IdempotencyDoc = {
  id: string;
  idempotencyKey: string;
  organizationId: string;
  status: 'LOCK' | 'DONE' | 'ERROR';
  createdAt: number;
  expiresAt: number;
  response?: CachedResponse;
  lastError?: { code?: string; message?: string };
  requestId?: string;
};

export function computeIdempotencyDocId(organizationId: string, idempotencyKey: string): string {
  const raw = `${organizationId}|${idempotencyKey}`;
  return createHash('sha256').update(raw).digest('hex');
}

export type IdempotencyBackend = {
  getDoc(orgId: string, docId: string): Promise<IdempotencyDoc | null>;
  tryCreateLock(doc: IdempotencyDoc): Promise<'OK' | 'EXISTS'>;
  finalize(docId: string, status: 'DONE' | 'ERROR', response: CachedResponse | null, err: { code?: string; message?: string } | null, finalRequestId: string, finalExpiresAt: number): Promise<void>;
  clearDoc(docId: string): Promise<void>;
};

export class InMemoryIdempotencyBackend implements IdempotencyBackend {
  private docs = new Map<string, IdempotencyDoc>();
  private readonly clock: () => number;
  constructor(clock?: () => number) { this.clock = clock ?? (() => Date.now()); }
  async getDoc(_orgId: string, docId: string): Promise<IdempotencyDoc | null> {
    const d = this.docs.get(docId) ?? null;
    if (d && d.expiresAt < this.clock()) {
      this.docs.delete(docId);
      return null;
    }
    return d;
  }
  async tryCreateLock(doc: IdempotencyDoc): Promise<'OK' | 'EXISTS'> {
    if (this.docs.has(doc.id)) return 'EXISTS';
    this.docs.set(doc.id, doc);
    return 'OK';
  }
  async finalize(docId: string, status: 'DONE' | 'ERROR', response: CachedResponse | null, err: { code?: string; message?: string } | null, finalRequestId: string, finalExpiresAt: number): Promise<void> {
    const cur = this.docs.get(docId);
    if (!cur) return;
    const n: IdempotencyDoc = {
      ...cur,
      status,
      response: response ?? undefined,
      lastError: err ?? undefined,
      requestId: finalRequestId,
      expiresAt: finalExpiresAt,
    };
    this.docs.set(docId, n);
  }
  async clearDoc(docId: string): Promise<void> { this.docs.delete(docId); }
}

let defaultBackend: IdempotencyBackend = new InMemoryIdempotencyBackend();
export function setIdempotencyBackend(b: IdempotencyBackend): void { defaultBackend = b; }
export function getIdempotencyBackend(): IdempotencyBackend { return defaultBackend; }

export type IdempotencyOutcome =
  | { kind: 'new'; lock: IdempotencyDoc }
  | { kind: 'hit'; doc: IdempotencyDoc }
  | { kind: 'conflict' };

export async function resolveIdempotency(
  organizationId: string,
  idempotencyKey: string,
  requestId: string,
  nowMs = Date.now(),
  backend = defaultBackend,
): Promise<IdempotencyOutcome> {
  if (!organizationId) throw new ApiError(400, 'INVALID_IDEMPOTENCY_SCOPE', 'Idempotency requires organization context');
  if (!idempotencyKey) return { kind: 'new', lock: createLockPlaceholder(organizationId, '__none__', requestId, nowMs) };
  if (idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LEN) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_TOO_LONG', `Idempotency key length ${idempotencyKey.length} exceeds ${IDEMPOTENCY_KEY_MAX_LEN}`);
  }
  const docId = computeIdempotencyDocId(organizationId, idempotencyKey);
  const existing = await backend.getDoc(organizationId, docId);
  if (existing) {
    if (existing.status === 'LOCK') {
      if (nowMs - existing.createdAt < 60_000) return { kind: 'conflict' };
      await backend.clearDoc(docId);
    } else if (existing.status === 'DONE' || existing.status === 'ERROR') {
      return { kind: 'hit', doc: existing };
    }
  }
  const lock: IdempotencyDoc = {
    id: docId,
    idempotencyKey,
    organizationId,
    status: 'LOCK',
    createdAt: nowMs,
    expiresAt: nowMs + 90_000,
    requestId,
  };
  const rc = await backend.tryCreateLock(lock);
  if (rc === 'EXISTS') {
    const cur = await backend.getDoc(organizationId, docId);
    if (cur && (cur.status === 'DONE' || cur.status === 'ERROR')) return { kind: 'hit', doc: cur };
    return { kind: 'conflict' };
  }
  return { kind: 'new', lock };
}

function createLockPlaceholder(organizationId: string, idempotencyKey: string, requestId: string, nowMs: number): IdempotencyDoc {
  return {
    id: 'none_' + randomBytes(4).toString('hex'),
    idempotencyKey,
    organizationId,
    status: 'LOCK',
    createdAt: nowMs,
    expiresAt: nowMs + 90_000,
    requestId,
  };
}

export function cachedResponseToHttp(doc: IdempotencyDoc): Response {
  if (!doc.response) {
    return new Response(JSON.stringify({
      code: doc.lastError?.code ?? 'INTERNAL',
      error: doc.lastError?.message ?? 'Cached response missing',
      requestId: doc.requestId ?? '',
    }), { status: doc.status === 'ERROR' ? 500 : 503, headers: { 'content-type': 'application/json; charset=utf-8', 'x-idempotency': 'hit' } });
  }
  return new Response(doc.response.body, {
    status: doc.response.status,
    headers: new Headers({
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': doc.response.requestId,
      'x-idempotency': 'hit',
      ...(doc.response.headers ?? {}),
    }),
  });
}

export function apiErrorConflict409(requestId: string, retryAfterSec = 5): Response {
  return new Response(JSON.stringify({
    code: 'IDEMPOTENCY_CONFLICT',
    error: 'Another concurrent request with same idempotency key is being processed; try again shortly',
    requestId,
    details: { retryAfterSec },
  }), {
    status: 409,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Retry-After': String(retryAfterSec),
      'x-request-id': requestId,
    },
  });
}
