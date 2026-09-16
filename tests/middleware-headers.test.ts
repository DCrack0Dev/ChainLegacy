import { describe, it, expect, beforeEach } from 'vitest';
import { middleware } from '@/middleware';

type AnyHeaders = { get: (k: string) => string | null; set: (k: string, v: string) => void };

type MiddlewareRequest = {
  nextUrl: { pathname: string; origin: string; search: string; searchParams: URLSearchParams };
  url: string;
  headers: AnyHeaders;
  cookies: { get: (k: string) => { value: string } | undefined };
};

function cookiesStore(init: Record<string, string> = {}) {
  return {
    get(k: string) {
      const v = init[k];
      return v ? { value: v } : undefined;
    },
  };
}

function wrapNativeHeaders(req: Record<string, string> = {}): AnyHeaders {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(req)) m.set(k.toLowerCase(), v);
  return {
    get(k) { return m.get(k.toLowerCase()) ?? null; },
    set(k, v) { m.set(k.toLowerCase(), v); },
  };
}

function makeRequest(pathname = '/', headersInit: Record<string, string> = {}, cookies: Record<string, string> = {}): MiddlewareRequest {
  const url = 'https://unit.example.com' + pathname;
  const u = new URL(url);
  const reqHeaders = wrapNativeHeaders(headersInit);
  return {
    nextUrl: {
      pathname,
      origin: u.origin,
      search: u.search,
      searchParams: u.searchParams,
    },
    url,
    headers: reqHeaders,
    cookies: cookiesStore(cookies),
  };
}

function callMiddleware(req: MiddlewareRequest): any {
  return middleware(req as any, { waitUntil: () => {} } as any);
}

function setNodeEnv(value: string) {
  (process as any).env = { ...(process as any).env, NODE_ENV: value };
}

describe('middleware security headers (AC-8 TR-3.1)', () => {
  beforeEach(() => {
    setNodeEnv('test');
    process.env.CRON_SECRET = undefined as any;
  });
  it('/ sets STS + CSP + nosniff + X-Frame-Options', () => {
    const res: any = callMiddleware(makeRequest('/'));
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
    expect(res.headers.get('content-security-policy')).toBeTruthy();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
  it('/api/v1/customers sets headers', () => {
    const res: any = callMiddleware(makeRequest('/api/v1/customers'));
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
    expect(res.headers.get('content-security-policy')).toBeTruthy();
  });
  it('/enterprise/overview sets headers with session cookie', () => {
    const res: any = callMiddleware(makeRequest('/enterprise/overview', {}, { __session: 'unit-session-1234' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
  });
  it('nonce differs per request, CSP references nonce (TR-3.2 strictness ≥3 threshold)', () => {
    const r1: any = callMiddleware(makeRequest('/'));
    const r2: any = callMiddleware(makeRequest('/'));
    const n1 = r1.headers.get('x-csp-nonce');
    const n2 = r2.headers.get('x-csp-nonce');
    expect(n1).toBeTruthy();
    expect(n2).toBeTruthy();
    expect(n1).not.toEqual(n2);
    const csp: string = r1.headers.get('content-security-policy') || '';
    expect(csp.includes(`'nonce-${n1}'`)).toBe(true);
    expect(csp.includes("base-uri 'self'")).toBe(true);
    expect(csp.includes("object-src 'none'")).toBe(true);
    expect(csp.includes("frame-ancestors 'none'")).toBe(true);
  });
});

describe('middleware cron + enterprise redirect (AC-9 TR-8.1 basics)', () => {
  beforeEach(() => {
    setNodeEnv('test');
    process.env.CRON_SECRET = 'unit-cron-secret';
  });
  it('rejects cron without bearer', async () => {
    const res: Response = callMiddleware(makeRequest('/api/cron/check-status')) as any;
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.code).toBe('CRON_AUTH_REQUIRED');
  });
  it('allows cron with bearer match', () => {
    const res: any = callMiddleware(makeRequest('/api/cron/check-status', { authorization: 'Bearer unit-cron-secret' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
  });
  it('blocks /api/test/* in production', async () => {
    setNodeEnv('production');
    const res: Response = callMiddleware(makeRequest('/api/test/anything')) as any;
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.code).toBe('NOT_AVAILABLE');
  });
  it('/enterprise/overview redirects 302 /login?redirect without session', () => {
    setNodeEnv('production');
    const res: any = callMiddleware(makeRequest('/enterprise/overview'));
    expect(res.status).toBe(302);
    const loc = res.headers.get('location');
    expect(loc).toBeTruthy();
    const u = new URL(loc!);
    expect(u.pathname).toBe('/login');
    expect(u.searchParams.get('redirect')).toBe('/enterprise/overview');
  });
});
