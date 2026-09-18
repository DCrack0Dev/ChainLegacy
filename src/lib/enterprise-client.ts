'use client';

import { auth } from '@/lib/firebase';

export class EnterpriseApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'EnterpriseApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Authenticated fetch for enterprise v1 APIs.
 * Attaches the current Firebase ID token so the server resolves organization context.
 */
export async function enterpriseFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new EnterpriseApiError('Not authenticated', 401, 'UNAUTHENTICATED');
  }

  const token = await user.getIdToken();
  const headers = new Headers(init.headers || {});
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, { ...init, headers });
}

export async function enterpriseJson<T = unknown>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await enterpriseFetch(input, init);
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    throw new EnterpriseApiError(
      payload?.error || payload?.message || `Request failed (${res.status})`,
      res.status,
      payload?.code,
      payload?.details ?? payload,
    );
  }
  return payload as T;
}
