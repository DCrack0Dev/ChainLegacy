import { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-errors';
import { ApiKeyScope, ApiScopes } from '@/types/enterprise';
import { ApiKeyService, isKeyPrefix, hasScope } from '@/services/enterprise/organization';

export type V1Auth =
  | { method: 'firebase'; uid: string; organizationId?: string; scopes: ApiKeyScope[]; actorId: string }
  | { method: 'api_key'; keyId: string; organizationId: string; scopes: ApiKeyScope[]; actorId: string; env: 'sandbox' | 'production' }
  | { method: 'cron'; organizationId?: string; scopes: ApiKeyScope[]; actorId: string };

export function withApiScope(granted: readonly ApiKeyScope[], required: ApiKeyScope | ApiKeyScope[]): void {
  const list = Array.isArray(required) ? required : [required];
  for (const s of list) {
    if (!hasScope(granted, s)) {
      throw new ApiError(403, 'MISSING_SCOPE', `Required scope ${s} is not granted`, { required: s });
    }
  }
}

export function parseIdempotencyKey(req: { headers: { get: (k: string) => string | null } }): string | null {
  const v = req.headers.get('idempotency-key');
  if (!v || v.length > 64) return null;
  return v;
}

export function parsePagination(req: { url: string; nextUrl?: { searchParams: URLSearchParams } } | URLSearchParams): { limit: number; offset: number; nextCursor?: string } {
  const params = req instanceof URLSearchParams ? req : (req.nextUrl?.searchParams ?? new URL(req.url).searchParams);
  const limitRaw = params.get('limit');
  const offsetRaw = params.get('offset');
  const cursor = params.get('nextCursor') ?? undefined;
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || 20, 100) : 20;
  const offset = offsetRaw ? Math.max(parseInt(offsetRaw, 10) || 0, 0) : 0;
  return { limit, offset, nextCursor: cursor };
}

export function paginatedResponse<T>(items: T[], meta: { total?: number; limit: number; offset: number; nextCursor?: string }, req: { headers?: { get: (k: string) => string | null } }) {
  return structuredJson({ data: items, meta });
}

export function structuredJson(body: unknown, status = 200, headersInit?: Record<string, string>) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', ...(headersInit ?? {}) });
  return new Response(JSON.stringify(body), { status, headers });
}

export function clientIp(req: { headers: Headers | { get: (k: string) => string | null } }): string {
  const h = req.headers as any;
  const g = typeof h.get === 'function' ? (k: string) => h.get(k) : (k: string) => h[k];
  return g('x-forwarded-for')?.split(',')[0]?.trim()
    ?? g('x-real-ip')
    ?? g('cf-connecting-ip')
    ?? '0.0.0.0';
}

export function requireOrganizationContext(auth: V1Auth): asserts auth is Extract<V1Auth, { organizationId: string }> {
  if (!auth.organizationId) throw new ApiError(403, 'ORG_CONTEXT_REQUIRED', 'This request requires an organization context');
}

function bearerFromRequest(req: NextRequest | Request): { scheme: string; value: string } | null {
  const auth = req.headers.get('authorization');
  if (!auth) {
    const x = req.headers.get('x-api-key');
    if (x && isKeyPrefix(x)) return { scheme: 'X-API-Key', value: x };
    return null;
  }
  const parts = auth.split(' ');
  if (parts.length < 2) return null;
  return { scheme: parts[0]!, value: parts.slice(1).join(' ') };
}

export function authenticateApiKey(bearerValue: string, keyRows: Parameters<typeof ApiKeyService.verify>[1]): V1Auth {
  const row = ApiKeyService.verify(bearerValue, keyRows as any[]);
  if (!row) throw new ApiError(401, 'INVALID_API_KEY', 'Api key not found or expired');
  return { method: 'api_key', keyId: row.id, organizationId: row.organizationId, scopes: row.scopes, actorId: `key:${row.id}`, env: row.env };
}

export function authenticateFirebaseUser(_decodedIdToken: { uid: string; email?: string }, ownerUidToOrgId: Map<string, string>): V1Auth {
  const uid = _decodedIdToken.uid;
  const organizationId = ownerUidToOrgId.get(uid);
  return { method: 'firebase', uid, organizationId, scopes: organizationId ? ([...ApiScopes] as ApiKeyScope[]) : [], actorId: `user:${uid}` };
}

export function requireOwnershipOrScope(_resourceOwnerUid: string, auth: V1Auth, scopeIfCrossOwner: ApiKeyScope): void {
  if (auth.method === 'firebase' && auth.uid === _resourceOwnerUid) return;
  if (hasScope(auth.scopes, scopeIfCrossOwner)) return;
  throw new ApiError(403, 'FORBIDDEN', 'Ownership or scope required');
}

const ORG_ID_KEYS_CANDIDATES: readonly string[] = [
  'organizationId',
  'orgId',
  'organisationId',
] as const;
const NESTED_ENTITY_ORG_KEYS: readonly [string, string][] = [
  ['customer', 'organizationId'],
  ['legacyPlan', 'organizationId'],
  ['claim', 'organizationId'],
  ['beneficiary', 'organizationId'],
  ['plan', 'organizationId'],
  ['guardian', 'organizationId'],
  ['livenessReset', 'organizationId'],
  ['webhook', 'organizationId'],
  ['apiKey', 'organizationId'],
] as const;

export function assertPayloadOrgMatchesAuth(
  auth: V1Auth & { organizationId: string },
  payload: unknown,
): void {
  const expected = auth.organizationId;
  const checkScalar = (v: unknown, source: string): void => {
    if (v === undefined || v === null) return;
    if (typeof v !== 'string') return;
    if (v && v !== expected) {
      throw new ApiError(403, 'TENANT_MISMATCH', `Payload ${source} does not match authenticated organization`);
    }
  };
  for (const k of ORG_ID_KEYS_CANDIDATES) {
    checkScalar((payload as Record<string, unknown> | null)?.[k], `body.${k}`);
  }
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    for (const [entityKey, orgField] of NESTED_ENTITY_ORG_KEYS) {
      const nested = record[entityKey];
      if (nested && typeof nested === 'object') {
        const nv = (nested as Record<string, unknown>)[orgField];
        checkScalar(nv, `body.${entityKey}.${orgField}`);
      }
    }
    const arr = Array.isArray(record.items) ? (record.items as unknown[]) : null;
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (item && typeof item === 'object') {
          for (const k of ORG_ID_KEYS_CANDIDATES) {
            checkScalar((item as Record<string, unknown>)[k], `body.items[${i}].${k}`);
          }
        }
      }
    }
  }
}

export async function v1AuthFromRequest(
  req: NextRequest | Request,
  deps: {
    keyRows: Parameters<typeof ApiKeyService.verify>[1];
    ownerUidToOrgId: Map<string, string>;
    verifyIdToken?: (t: string) => Promise<{ uid: string; email?: string }>;
    cronSecret?: string;
  },
): Promise<V1Auth> {
  const bearer = bearerFromRequest(req);
  if (!bearer) throw new ApiError(401, 'UNAUTHENTICATED', 'Missing credentials');
  if (bearer.scheme.toLowerCase() === 'bearer') {
    if (deps.cronSecret && bearer.value === deps.cronSecret) {
      return { method: 'cron', scopes: [...ApiScopes] as ApiKeyScope[], actorId: 'system:cron' };
    }
    if (isKeyPrefix(bearer.value)) return authenticateApiKey(bearer.value, deps.keyRows);
    if (deps.verifyIdToken) {
      try {
        const decoded = await deps.verifyIdToken(bearer.value);
        return authenticateFirebaseUser(decoded, deps.ownerUidToOrgId);
      } catch (e: any) {
        throw new ApiError(401, 'INVALID_ID_TOKEN', 'ID token invalid or expired');
      }
    }
  }
  if (bearer.scheme === 'X-API-Key') return authenticateApiKey(bearer.value, deps.keyRows);
  throw new ApiError(401, 'UNAUTHENTICATED', 'Unrecognized credentials');
}
