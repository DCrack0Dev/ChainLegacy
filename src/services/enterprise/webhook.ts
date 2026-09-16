import { createHmac, timingSafeEqual, randomBytes, createHash } from 'crypto';

export function generateSigningSecret(bytes = 32): string {
  return 'whsec_' + randomBytes(bytes).toString('hex');
}

export function signSignature(secret: string, payload: string, t: number): string {
  const signedPayload = `${t}.${payload}`;
  const mac = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${t},v1=${mac}`;
}

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export function verifySignature(secret: string, payload: string, header: string, toleranceSec = DEFAULT_TOLERANCE_SECONDS): boolean {
  if (typeof header !== 'string') return false;
  let t = 0;
  const v1s: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1);
    if (k === 't') t = Number(v);
    if (k === 'v1') v1s.push(v);
  }
  if (!t || Number.isNaN(t) || v1s.length === 0) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now - t > toleranceSec) return false;
  const signedPayload = `${t}.${payload}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  for (const cand of v1s) {
    if (cand.length !== expected.length) continue;
    try {
      if (timingSafeEqual(Buffer.from(cand, 'hex'), expectedBuf)) return true;
    } catch {
      /* swallow */
    }
  }
  return false;
}

export type WebhookDeliveryEvent = {
  id: string;
  type: string;
  createdAt: string;
  organizationId: string;
  data: unknown;
  idempotencyKey?: string;
  requestId?: string;
  actor?: string;
};

export const MAX_ATTEMPTS = 8;
export const CONSECUTIVE_FAILURE_DISABLE_THRESHOLD = 5;

function deliveryPayload(evt: WebhookDeliveryEvent): string {
  return JSON.stringify(evt);
}
export function retryDelayMs(attempt: number): number {
  return Math.min(60_000 * Math.pow(2, Math.max(0, attempt)), 24 * 3600_000);
}

export type EndpointLike = {
  id: string;
  organizationId: string;
  url: string;
  enabled: boolean;
  events: readonly string[];
  consecutiveFailures: number;
  disabledAt?: Date | null;
  secret: string;
  signingAlgo?: 'HMAC-SHA256';
};

export type DeliveryRow = {
  id: string;
  dedupeKey: string;
  attempt: number;
  deliverAfter: number;
  lastAttemptAt?: number;
  httpStatus?: number;
  lastError?: string;
  deliveredAt?: number;
  deadLetterAt?: number;
  endpointId: string;
  organizationId: string;
  eventId: string;
  eventType: string;
  scheduledAt: number;
  payload: string;
  signatureHeader?: string;
};

export type EndpointUpdate = {
  id: string;
  organizationId: string;
  consecutiveFailures?: number;
  enabled?: boolean;
  disabledAt?: number | null;
  lastDeliveredAt?: number;
};

export function computeDedupeKey(endpointId: string, evt: WebhookDeliveryEvent): string {
  const hex = createHash('sha256').update(deliveryPayload(evt)).digest('hex').slice(0, 16);
  return `${endpointId}:${evt.id}:${hex}`;
}

export function enqueueForOrg(
  endpoint: EndpointLike,
  evt: WebhookDeliveryEvent,
  existingDeliveries: readonly { dedupeKey?: string; dedupe?: string }[],
  scheduledAt = Date.now(),
): DeliveryRow | null {
  if (!endpoint.enabled || !!endpoint.disabledAt) return null;
  const subscribed = endpoint.events.includes('*') || endpoint.events.includes(evt.type);
  if (!subscribed) return null;
  const dedupeKey = computeDedupeKey(endpoint.id, evt);
  const dup = existingDeliveries.some((d) => d && (d.dedupeKey === dedupeKey || d.dedupe === dedupeKey));
  if (dup) return null;
  const payload = deliveryPayload(evt);
  const t = Math.floor(scheduledAt / 1000);
  const signatureHeader = signSignature(endpoint.secret, payload, t);
  return {
    id: `wev_${randomBytes(8).toString('hex')}`,
    dedupeKey,
    attempt: 0,
    deliverAfter: scheduledAt,
    endpointId: endpoint.id,
    organizationId: endpoint.organizationId,
    eventId: evt.id,
    eventType: evt.type,
    scheduledAt,
    payload,
    signatureHeader,
  };
}

export type FetchResult = { ok: boolean; status: number; err?: string };
export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; timeoutMs?: number }) => Promise<FetchResult>;

export const DEFAULT_FETCHER: Fetcher = async (url, init) => {
  try {
    const ctrl = new (typeof AbortController !== 'undefined' ? AbortController : (class { abort() {} signal: any = {} }))();
    const t = init.timeoutMs ?? 15000;
    const timeout = setTimeout(() => ctrl.abort?.(), t);
    const resp = await (globalThis as any).fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: (ctrl as any).signal,
    });
    clearTimeout(timeout);
    return { ok: resp.status >= 200 && resp.status < 300, status: resp.status };
  } catch (e: any) {
    return { ok: false, status: 0, err: String(e?.message ?? e) };
  }
};

export type DeliveryBatchDeps = {
  now?: number;
  fetcher?: Fetcher;
  loadScheduledEvents: (orgId: string, endpointId: string, limit?: number) => Promise<DeliveryRow[]>;
  loadEndpoint: (orgId: string, endpointId: string) => Promise<EndpointLike | null>;
  persistDeliveryUpdate: (row: DeliveryRow) => Promise<void>;
  moveToDeadLetter: (row: DeliveryRow) => Promise<void>;
  persistEndpointUpdate: (patch: EndpointUpdate) => Promise<void>;
};

export async function processDeliveryBatch(
  orgId: string,
  endpointId: string,
  deps: DeliveryBatchDeps,
  limit = 50,
): Promise<{ delivered: number; failed: number; movedToDeadLetter: number; endpointDisabled: boolean }> {
  const endpoint = await deps.loadEndpoint(orgId, endpointId);
  const now = deps.now ?? Date.now();
  const out = { delivered: 0, failed: 0, movedToDeadLetter: 0, endpointDisabled: false };
  if (!endpoint) return out;
  const rows = await deps.loadScheduledEvents(orgId, endpointId, limit);
  const fetcher = deps.fetcher ?? DEFAULT_FETCHER;
  let consecutiveAccumulator = endpoint.consecutiveFailures ?? 0;
  let endpointEnabledBefore = !!endpoint.enabled && !endpoint.disabledAt;
  for (const row of rows) {
    if (!endpointEnabledBefore) break;
    if (row.deliverAfter > now) continue;
    if (row.deliveredAt) continue;
    if (row.attempt >= MAX_ATTEMPTS) {
      if (!row.deadLetterAt) {
        row.deadLetterAt = now;
        await deps.moveToDeadLetter({ ...row });
        out.movedToDeadLetter += 1;
        await deps.persistDeliveryUpdate(row);
      }
      continue;
    }
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'ChainLegacy-Webhooks/1.0',
      'chainlegacy-signature': row.signatureHeader ?? signSignature(endpoint.secret, row.payload, Math.floor(now / 1000)),
      'chainlegacy-event-id': row.eventId,
      'chainlegacy-event-type': row.eventType,
      'chainlegacy-delivery-id': row.id,
    };
    const res = await fetcher(endpoint.url, { method: 'POST', headers, body: row.payload, timeoutMs: 15000 });
    const nextAttempt = row.attempt + 1;
    if (res.ok) {
      consecutiveAccumulator = 0;
      row.deliveredAt = now;
      row.lastAttemptAt = now;
      row.httpStatus = res.status;
      row.attempt = nextAttempt;
      out.delivered += 1;
    } else {
      consecutiveAccumulator += 1;
      row.lastAttemptAt = now;
      row.httpStatus = res.status;
      row.lastError = res.err;
      row.attempt = nextAttempt;
      row.deliverAfter = now + retryDelayMs(nextAttempt);
      out.failed += 1;
      if (row.attempt >= MAX_ATTEMPTS) {
        row.deadLetterAt = now;
        await deps.moveToDeadLetter({ ...row });
        out.movedToDeadLetter += 1;
        await deps.persistDeliveryUpdate(row);
        if (consecutiveAccumulator >= CONSECUTIVE_FAILURE_DISABLE_THRESHOLD && endpointEnabledBefore) {
          endpointEnabledBefore = false;
          out.endpointDisabled = true;
          await deps.persistEndpointUpdate({
            id: endpoint.id,
            organizationId: orgId,
            enabled: false,
            consecutiveFailures: consecutiveAccumulator,
            disabledAt: now,
          });
        }
        continue;
      }
    }
    await deps.persistDeliveryUpdate(row);
    if (consecutiveAccumulator >= CONSECUTIVE_FAILURE_DISABLE_THRESHOLD && endpointEnabledBefore) {
      endpointEnabledBefore = false;
      out.endpointDisabled = true;
      await deps.persistEndpointUpdate({
        id: endpoint.id,
        organizationId: orgId,
        enabled: false,
        consecutiveFailures: consecutiveAccumulator,
        disabledAt: now,
      });
    }
  }
  if (!out.endpointDisabled) {
    await deps.persistEndpointUpdate({
      id: endpoint.id,
      organizationId: orgId,
      consecutiveFailures: consecutiveAccumulator,
      enabled: endpointEnabledBefore,
      disabledAt: endpointEnabledBefore ? null : endpoint.disabledAt ? (endpoint.disabledAt instanceof Date ? endpoint.disabledAt.getTime() : (endpoint.disabledAt as any)) : null,
      lastDeliveredAt: out.delivered > 0 ? now : undefined,
    });
  }
  return out;
}

