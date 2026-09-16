import { NextResponse } from 'next/server';

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }
}

export type ApiErrorResponseShape = {
  code: string;
  error: string;
  details?: unknown;
  requestId: string;
};

export function apiErrorResponse(err: ApiError | Error | unknown, opts: { requestId: string; defaultStatusCode?: number }): NextResponse<ApiErrorResponseShape> {
  const requestId = opts.requestId;
  if (err instanceof ApiError) {
    return NextResponse.json(
      { code: err.code, error: err.message, details: safeDetails(err.details), requestId },
      { status: err.statusCode },
    );
  }
  const msg = err instanceof Error ? err.message : 'Internal Server Error';
  return NextResponse.json(
    { code: 'INTERNAL', error: 'Internal Server Error', details: process.env.NODE_ENV === 'production' ? undefined : safeDetails(msg), requestId },
    { status: opts.defaultStatusCode ?? 500 },
  );
}

function safeDetails(d: unknown): unknown {
  if (d === null || d === undefined) return undefined;
  if (typeof d !== 'object') return d;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (key.includes('stack') || key.includes('password') || key.includes('secret') || key.includes('token') || key.includes('key')) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function extractRequestId(reqOrHeaders: { headers?: { get?: (key: string) => string | null; [k: string]: unknown } } | Headers | Request | { headers?: Headers }): string {
  let h: Headers | { get?: (key: string) => string | null; [k: string]: unknown } | undefined;
  if (reqOrHeaders instanceof Headers) {
    const existing = reqOrHeaders.get('x-request-id');
    if (existing) return existing;
    const id = randomId();
    reqOrHeaders.set('x-request-id', id);
    return id;
  }
  if (reqOrHeaders && typeof (reqOrHeaders as Request).headers !== 'undefined' && (reqOrHeaders as Request).headers instanceof Headers) {
    const hdrs = (reqOrHeaders as Request).headers;
    const existing = hdrs.get('x-request-id');
    if (existing) return existing;
    return randomId();
  }
  h = (reqOrHeaders as any).headers;
  const existing = typeof h?.get === 'function' ? h.get('x-request-id') : (h as any)?.['x-request-id'];
  return existing ?? randomId();
}

function randomId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) return globalThis.crypto.randomUUID();
  return 'req_' + Math.random().toString(36).slice(2, 14);
}
