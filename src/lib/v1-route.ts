import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema } from 'zod';
import { ApiKeyScope, ApiScopes } from '@/types/enterprise';
import { adminDb } from '@/lib/firebase-admin';
import { ApiError, apiErrorResponse, extractRequestId } from '@/lib/api-errors';
import {
  assertPayloadOrgMatchesAuth,
  parseIdempotencyKey,
  parsePagination,
  requireOrganizationContext,
  structuredJson,
  v1AuthFromRequest,
  V1Auth,
  withApiScope,
} from '@/lib/api-auth';
import {
  enforceRateLimit,
  __setDefaultRateLimitBackend,
  __apiErrorForRateLimit,
  rateLimit429Response,
  RateLimitCounterBackend,
  InMemoryRateLimitBackend,
} from '@/services/enterprise/rate-limiter';
import {
  resolveIdempotency,
  IdempotencyBackend,
  InMemoryIdempotencyBackend,
  setIdempotencyBackend,
  CachedResponse,
  apiErrorConflict409,
  cachedResponseToHttp,
} from '@/services/enterprise/idempotency';

export type V1HandlerArgs<TBody = unknown> = {
  request: NextRequest | Request;
  auth: V1Auth;
  body: TBody;
  params: Record<string, string>;
  pagination: ReturnType<typeof parsePagination>;
  idempotencyKey: string | null;
  requestId: string;
  searchParams: URLSearchParams;
};

export type V1RouteArgs<TBody> = {
  scope?: ApiKeyScope | ApiKeyScope[];
  bodySchema?: ZodSchema<TBody>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  allowCron?: boolean;
  requireOrg?: boolean;
  rateLimitExempt?: boolean;
  orgPayloadGuard?: boolean;
  idempotency?: boolean;
  handle: (a: V1HandlerArgs<TBody>) => Promise<Response> | Response;
};

let defaultRateBackendOverride: RateLimitCounterBackend | null = null;
const defaultIdempotencyBackend: InMemoryIdempotencyBackend = new InMemoryIdempotencyBackend();
setIdempotencyBackend(defaultIdempotencyBackend);
export function setV1RouteRateBackend(b: RateLimitCounterBackend | null): void {
  defaultRateBackendOverride = b;
  if (b) __setDefaultRateLimitBackend(b);
  else __setDefaultRateLimitBackend(new InMemoryRateLimitBackend());
}

function routePathFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const idx = u.pathname.indexOf('/api/v1');
    return idx >= 0 ? u.pathname.slice(idx) : u.pathname;
  } catch {
    return url;
  }
}

export function v1Route<TBody = unknown>(opts: V1RouteArgs<TBody>) {
  return async function (request: NextRequest | Request, params?: { params?: Record<string, string> }): Promise<Response> {
    const requestId = extractRequestId(request);
    let idempotencyLock: { id: string; orgId: string; key: string } | null = null;
    try {
      if (opts.method && request.method !== opts.method) {
        return apiErrorResponse(new ApiError(405, 'METHOD_NOT_ALLOWED', `${request.method} not allowed`), { requestId });
      }
      const cronSecret = opts.allowCron ? process.env.CRON_SECRET : undefined;
      // Runtime auth wiring: load organization metadata and API keys from persistence and use Firebase admin for token verification.
      // This replaces the previous placeholder that passed empty keyRows/ownerUid map into v1AuthFromRequest.
      const { FirestorePersistenceBackend } = await import('@/services/enterprise/persistence');
      const { EnterpriseApiKeyService } = await import('@/services/enterprise/apikey-service');
      const persistence = new FirestorePersistenceBackend();
      const apiKeyService = new EnterpriseApiKeyService(persistence as any);
      // Build ownerUid -> orgId map
      const ownerUidToOrgId = new Map<string, string>();
      try {
        const orgs = await (persistence as any).listOrgs?.();
        if (Array.isArray(orgs)) {
          for (const o of orgs) {
            if (o && o.ownerUid && o.id) ownerUidToOrgId.set(o.ownerUid, o.id);
          }
        }
      } catch (e) {
        // ignore failures here; ownerUid map may be empty but firebase auth will still be attempted
      }
      // Parse credentials from request
      const authHeader = request.headers.get('authorization');
      const apiKeyHeader = request.headers.get('x-api-key');
      let auth: any = null;
      // Helper to parse bearer
      const parseBearer = (hdr: string | null | undefined) => {
        if (!hdr) return null;
        const parts = hdr.split(' ');
        if (parts.length < 2) return null;
        return { scheme: parts[0], value: parts.slice(1).join(' ') };
      };
      const bearer = parseBearer(authHeader) ?? (apiKeyHeader ? { scheme: 'X-API-Key', value: apiKeyHeader } : null);
      if (!bearer) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'Missing credentials');
      }
      if (bearer.scheme.toLowerCase() === 'bearer') {
        // Cron secret
        if (cronSecret && bearer.value === cronSecret) {
          auth = { method: 'cron', scopes: [] as any[], actorId: 'system:cron' };
        } else if (bearer.value.startsWith('clsbox_') || bearer.value.startsWith('clprod_')) {
          // API key in Bearer
          // Aggregate api keys across orgs and verify using EnterpriseApiKeyService.verifySecret
          let allKeys: any[] = [];
          try {
            const orgs = await (persistence as any).listOrgs?.();
            if (Array.isArray(orgs)) {
              for (const o of orgs) {
                try {
                  const keys = await apiKeyService.listKeys(o.id, { includeDisabled: true });
                  // listKeys returns safe rows (no keyHash). Need raw rows: use persistence.get to fetch each raw key
                  const rawKeys: any[] = [];
                  for (const k of keys) {
                    const raw = await (persistence as any).get(o.id, 'apiKeys', k.id);
                    if (raw) rawKeys.push(raw);
                  }
                  allKeys = allKeys.concat(rawKeys);
                } catch (e) {
                  // continue
                }
              }
            }
          } catch (e) {
            // continue with empty list
          }
          const matched = await apiKeyService.verifySecret(bearer.value, allKeys as any);
          if (!matched) throw new ApiError(401, 'INVALID_API_KEY', 'Api key not found or expired');
          auth = { method: 'api_key', keyId: matched.id, organizationId: matched.organizationId, scopes: matched.scopes, actorId: `key:${matched.id}`, env: matched.env };
        } else {
          // Treat as Firebase ID token
          try {
            const { adminAuth } = await import('@/lib/firebase-admin');
            if (!adminAuth) throw new Error('FIREBASE_ADMIN_NOT_INITIALIZED');
            const decoded = await adminAuth.verifyIdToken(bearer.value);
            let orgId = ownerUidToOrgId.get(decoded.uid);
            if (!orgId && adminDb) {
              const mapSnap = await adminDb.collection('ownerUidToOrgId').doc(decoded.uid).get();
              if (mapSnap.exists) {
                orgId = (mapSnap.data() as any)?.organizationId as string | undefined;
              }
            }
            // Org owners receive full API scopes for console operations.
            // Partner integrations should continue using scoped API keys.
            auth = {
              method: 'firebase',
              uid: decoded.uid,
              organizationId: orgId,
              scopes: orgId ? ([...ApiScopes] as ApiKeyScope[]) : [],
              actorId: `user:${decoded.uid}`,
            };
          } catch (e) {
            throw new ApiError(401, 'INVALID_ID_TOKEN', 'ID token invalid or expired');
          }
        }
      } else if (bearer.scheme === 'X-API-Key') {
        // API key in X-API-Key header
        // Similar verification as above
        let allKeys: any[] = [];
        try {
          const orgs = await (persistence as any).listOrgs?.();
          if (Array.isArray(orgs)) {
            for (const o of orgs) {
              try {
                const keys = await apiKeyService.listKeys(o.id, { includeDisabled: true });
                const rawKeys: any[] = [];
                for (const k of keys) {
                  const raw = await (persistence as any).get(o.id, 'apiKeys', k.id);
                  if (raw) rawKeys.push(raw);
                }
                allKeys = allKeys.concat(rawKeys);
              } catch (e) {
                // continue
              }
            }
          }
        } catch (e) {
          // continue
        }
        const matched = await apiKeyService.verifySecret(bearer.value, allKeys as any);
        if (!matched) throw new ApiError(401, 'INVALID_API_KEY', 'Api key not found or expired');
        auth = { method: 'api_key', keyId: matched.id, organizationId: matched.organizationId, scopes: matched.scopes, actorId: `key:${matched.id}`, env: matched.env };
      } else {
        throw new ApiError(401, 'UNAUTHENTICATED', 'Unrecognized credentials');
      }
      if (!opts.rateLimitExempt) {
        const d = await enforceRateLimit({
          req: request,
          method: request.method,
          routePath: routePathFromUrl(request.url),
          authMethod: (auth.method === 'cron' ? 'cron' : auth.method) as any,
          orgId: (auth as any).organizationId ?? 'no-org',
          apiKeyId: auth.method === 'api_key' ? auth.keyId : '',
        });
        if (!d.allowed) {
          const resp = apiErrorResponse(__apiErrorForRateLimit(d), { requestId });
          resp.headers.set('Retry-After', String(d.retryAfterSec));
          resp.headers.set('X-RateLimit-Limit', String(d.limit));
          resp.headers.set('X-RateLimit-Remaining', '0');
          return resp;
        }
      }
      if (opts.requireOrg) requireOrganizationContext(auth);
      if (opts.scope) withApiScope(auth.scopes, opts.scope);
      const urlObj = new URL(request.url);
      const pagination = parsePagination(request as NextRequest);
      const idempotencyKey = parseIdempotencyKey(request as any);
      const orgIdForIdem = (auth as any).organizationId ?? (auth.method === 'cron' ? 'cron' : 'anon');
      const idemEnabled = opts.idempotency ?? (!!idempotencyKey && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH'));
      if (idemEnabled && idempotencyKey) {
        const outcome = await resolveIdempotency(orgIdForIdem, idempotencyKey, requestId);
        if (outcome.kind === 'hit') {
          return cachedResponseToHttp((outcome as any).doc);
        }
        if (outcome.kind === 'conflict') {
          return apiErrorConflict409(requestId);
        }
        if (outcome.kind === 'new') {
          idempotencyLock = { id: (outcome as any).lock.id, orgId: orgIdForIdem, key: idempotencyKey };
        }
      }
      let body: TBody = undefined as unknown as TBody;
      if (opts.bodySchema && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
        let raw: any;
        try {
          raw = request.headers.get('content-type')?.includes('application/json') ? await (request as any).json?.() : undefined;
        } catch {
          throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
        }
        const parsed = opts.bodySchema.safeParse(raw);
        if (!parsed.success) {
          return apiErrorResponse(new ApiError(400, 'VALIDATION_ERROR', 'Invalid payload', parsed.error.format()), { requestId });
        }
        body = parsed.data;
        if (opts.orgPayloadGuard !== false && opts.requireOrg !== false && (auth as any).organizationId) {
          assertPayloadOrgMatchesAuth(auth as any, body as unknown);
        }
      }
      const response = await opts.handle({
        request,
        auth,
        body,
        params: params?.params ?? {},
        pagination,
        idempotencyKey,
        requestId,
        searchParams: urlObj.searchParams,
      });
      if (idempotencyLock) {
        try {
          const status = response.status;
          const contentType = response.headers.get('content-type') ?? undefined;
          const headersMap: Record<string, string> = {};
          response.headers.forEach((v, k) => { if (!k.toLowerCase().startsWith('x-ratelimit')) headersMap[k] = v; });
          const cloned = response.clone();
          const bodyTxt = contentType?.includes('application/json') ? await cloned.text() : '';
          const cache: CachedResponse = {
            status,
            body: bodyTxt,
            headers: headersMap,
            requestId,
          };
          await defaultIdempotencyBackend.finalize(
            idempotencyLock.id,
            (status >= 200 && status < 400) ? 'DONE' : 'ERROR',
            cache,
            null,
            requestId,
            Date.now() + 24 * 3600 * 1000,
          );
        } catch {
          // ignore
        }
      }
      return response;
    } catch (err: unknown) {
      if (idempotencyLock) {
        try {
          await defaultIdempotencyBackend.finalize(
            idempotencyLock.id, 'ERROR',
            { status: 500, body: '', headers: {}, requestId },
            null, requestId, Date.now() + 60_000,
          );
        } catch { /* ignore */ }
      }
      return apiErrorResponse(err, { requestId });
    }
  };
}

export { parseIdempotencyKey, parsePagination, structuredJson, requireOrganizationContext, withApiScope, extractRequestId, assertPayloadOrgMatchesAuth };
export type { V1Auth };
export { InMemoryRateLimitBackend, rateLimit429Response };
