import { describe, it, expect, beforeEach } from 'vitest';
import {
  enforceRateLimit,
  InMemoryRateLimitBackend,
  rateLimit429Response,
  rateLimitTierForEndpoint,
  __setDefaultRateLimitBackend,
} from '@/services/enterprise/rate-limiter';

const HEADERS: any = new Headers();
const mockReq = (ip: string) => {
  const h = new Headers();
  h.set('x-forwarded-for', ip);
  return { headers: h };
};

describe('rate limiter (AC-7 / TR-7.1 TR-7.2)', () => {
  beforeEach(() => {
    __setDefaultRateLimitBackend(new InMemoryRateLimitBackend());
  });
  it('61st POST write returns RESOURCE_EXHAUSTED 429 + Retry-After header', async () => {
    const backend = new InMemoryRateLimitBackend();
    __setDefaultRateLimitBackend(backend);
    let last: any = null;
    for (let i = 1; i <= 62; i++) {
      const d = await enforceRateLimit({
        req: mockReq('10.0.0.1'),
        method: 'POST',
        routePath: '/api/v1/customers',
        authMethod: 'api_key',
        orgId: 'orgO',
        apiKeyId: 'k1',
        backend,
      });
      if (i <= 60) {
        expect(d.allowed).toBe(true);
      } else {
        last = d;
        break;
      }
    }
    expect(last.allowed).toBe(false);
    const r = rateLimit429Response(last, 'req-test');
    expect(r.status).toBe(429);
    const payload: any = await r.json();
    expect(payload.code).toBe('RESOURCE_EXHAUSTED');
    expect(payload.requestId).toBe('req-test');
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(Number(r.headers.get('retry-after'))).toBeLessThanOrEqual(61);
  });
  it('cron tier is unlimited regardless of count', async () => {
    const backend = new InMemoryRateLimitBackend();
    for (let i = 0; i < 500; i++) {
      const d = await enforceRateLimit({
        req: mockReq('127.0.0.1'),
        method: 'POST',
        routePath: '/api/v1/webhooks/deliver',
        authMethod: 'cron',
        orgId: '',
        apiKeyId: '',
        backend,
      });
      expect(d.allowed).toBe(true);
    }
  });
  it('rateLimitTierForEndpoint maps correctly', () => {
    expect(rateLimitTierForEndpoint('GET', '/api/v1/customers')).toBe('read');
    expect(rateLimitTierForEndpoint('POST', '/api/v1/customers')).toBe('write');
    expect(rateLimitTierForEndpoint('POST', '/api/v1/claims/transition')).toBe('claims_sensitive');
    expect(rateLimitTierForEndpoint('POST', '/api/v1/api-keys')).toBe('apikeys_sensitive');
  });
});
