import { NextRequest, NextResponse, NextMiddleware } from 'next/server';
const STRICT_CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "connect-src 'self' https://*.firebaseio.com https://firestore.googleapis.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://cloudflareinsights.com https://*.walletconnect.com https://pulse.walletconnect.org https://api.web3modal.org wss://relay.walletconnect.com https://api.coinbase.com https://metamask-sdk.api.cx.metamask.io https://rpc.walletconnect.com",
  "img-src 'self' data: https: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://verify.walletconnect.org https://verify.walletconnect.com https://app.kitcoin.xyz https://*.sendwyre.com https://pay.coinbase.com",
  "media-src 'self' blob:",
  "manifest-src 'self'",
];
const SECURITY_HEADERS_BASE: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'off',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

function extractRequestId(req: NextRequest): { requestId: string; fromHeader: boolean } {
  const existing = req.headers.get('x-request-id');
  if (existing) return { requestId: existing, fromHeader: true };
  const cryptoAvailable =
    typeof (globalThis as any).crypto !== 'undefined' &&
    typeof (globalThis as any).crypto.randomUUID === 'function';
  const id = cryptoAvailable
    ? (globalThis as any).crypto.randomUUID()
    : 'req_' + Math.random().toString(36).slice(2, 14);
  return { requestId: id, fromHeader: false };
}

function buildCspHeader(): string {
  const scriptSrc = ["script-src 'self' 'unsafe-inline' https:"];
  return [...STRICT_CSP_DIRECTIVES, scriptSrc.join(' ')].join('; ');
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};

export const middleware: NextMiddleware = (req: NextRequest, _evt) => {
  const { requestId } = extractRequestId(req);
  const csp = buildCspHeader();
  const res = NextResponse.next();
  res.headers.set('x-request-id', requestId);
  res.headers.set('Content-Security-Policy', csp);
  for (const [k, v] of Object.entries(SECURITY_HEADERS_BASE)) {
    res.headers.set(k, v);
  }
  const { pathname } = req.nextUrl;
  if (process.env.NODE_ENV === 'production' && pathname.startsWith('/api/test/')) {
    return NextResponse.json(
      { code: 'NOT_AVAILABLE', error: 'Disabled in production', requestId },
      { status: 404 },
    );
  }
  if (pathname.startsWith('/enterprise')) {
    const sessionCookie =
      req.cookies.get('__session')?.value ||
      req.cookies.get('session')?.value ||
      req.headers.get('x-firebase-session') ||
      '';
    if (!sessionCookie) {
      const redirectTo = new URL('/login', req.nextUrl.origin);
      redirectTo.searchParams.set('redirect', pathname + req.nextUrl.search);
      const redir = NextResponse.redirect(redirectTo.toString(), 302);
      redir.headers.set('x-request-id', requestId);
      return redir;
    }
  }
  const cron = pathname.startsWith('/api/cron/') || pathname.startsWith('/api/v1/webhooks/deliver');
  if (cron && process.env.CRON_SECRET) {
    const h = req.headers.get('authorization');
    if (!h || h !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { code: 'CRON_AUTH_REQUIRED', error: 'Cron secret required', requestId },
        { status: 401 },
      );
    }
  }
  return res;
};
