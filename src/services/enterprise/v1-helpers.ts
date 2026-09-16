import { adminDb } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/api-errors';
import { enqueueForOrg, EndpointLike, DeliveryRow, WebhookDeliveryEvent } from '@/services/enterprise/webhook';
import { EventService, SystemEvent, LogEventOptions } from '@/services/events';
import type { V1Auth } from '@/lib/api-auth';
import { randomBytes } from 'crypto';

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export async function loadOrgWebhookEndpoints(organizationId: string): Promise<EndpointLike[]> {
  if (!adminDb) return [];
  const snap = await adminDb
    .collection('organizations')
    .doc(organizationId)
    .collection('webhookEndpoints')
    .where('enabled', '==', true)
    .get();
  const out: EndpointLike[] = [];
  snap.forEach((d) => {
    const raw = d.data() as any;
    out.push({
      id: d.id,
      organizationId: raw.organizationId ?? organizationId,
      url: raw.url,
      enabled: raw.enabled,
      events: raw.events ?? [],
      consecutiveFailures: raw.consecutiveFailures ?? 0,
      disabledAt: raw.disabledAt ?? null,
      secret: raw.secret,
      signingAlgo: raw.signingAlgo ?? 'HMAC-SHA256',
    });
  });
  return out;
}

export async function loadOrgExistingDeliveries(organizationId: string): Promise<{ dedupeKey?: string }[]> {
  if (!adminDb) return [];
  const snap = await adminDb
    .collection('organizations')
    .doc(organizationId)
    .collection('webhookDeliveries')
    .orderBy('scheduledAt', 'desc')
    .limit(200)
    .get();
  const out: { dedupeKey?: string }[] = [];
  snap.forEach((d) => out.push(d.data() as { dedupeKey?: string }));
  return out;
}

export async function persistDeliveries(organizationId: string, deliveries: DeliveryRow[]): Promise<void> {
  if (!adminDb || deliveries.length === 0) return;
  const batch = adminDb.batch();
  for (const row of deliveries) {
    const ref = adminDb
      .collection('organizations')
      .doc(organizationId)
      .collection('webhookDeliveries')
      .doc(row.id);
    batch.set(ref, { ...row });
  }
  await batch.commit();
}

export async function processWebhookEnqueue(
  organizationId: string,
  evt: WebhookDeliveryEvent,
): Promise<{ queued: number; deliveries: DeliveryRow[] }> {
  const endpoints = await loadOrgWebhookEndpoints(organizationId);
  if (endpoints.length === 0) return { queued: 0, deliveries: [] };
  const existing = await loadOrgExistingDeliveries(organizationId);
  const deliveries: DeliveryRow[] = [];
  for (const ep of endpoints) {
    const row = enqueueForOrg(ep, evt, existing);
    if (row) deliveries.push(row);
  }
  if (deliveries.length > 0) {
    await persistDeliveries(organizationId, deliveries);
  }
  return { queued: deliveries.length, deliveries };
}

export function actorFromAuth(auth: V1Auth): LogEventOptions['actor'] {
  switch (auth.method) {
    case 'api_key':
      return { type: 'api_key', id: auth.keyId };
    case 'firebase':
      return { type: 'user', id: auth.uid };
    case 'cron':
      return { type: 'cron', id: 'system:cron' };
  }
}

export async function logV1Event(
  auth: V1Auth,
  event: SystemEvent,
  details: any,
  opts: { requestId?: string; resource?: { type: string; id: string }; result?: LogEventOptions['result'] } = {},
): Promise<void> {
  const organizationId = (auth as any).organizationId;
  const actor = actorFromAuth(auth);
  const userId = auth.method === 'firebase' ? auth.uid : (actor?.id ?? (auth as any).actorId ?? 'system');
  await EventService.logEvent(userId, event, details, {
    organizationId,
    actor: actor ?? undefined,
    requestId: opts.requestId,
    resource: opts.resource,
    result: opts.result ?? 'success',
  });
}

export function makeWebhookDeliveryEvent(
  id: string,
  type: string,
  organizationId: string,
  data: unknown,
  extra: { idempotencyKey?: string; requestId?: string; actor?: string } = {},
): WebhookDeliveryEvent {
  return {
    id,
    type,
    createdAt: new Date().toISOString(),
    organizationId,
    data,
    idempotencyKey: extra.idempotencyKey,
    requestId: extra.requestId,
    actor: extra.actor,
  };
}

type WriteEntityOpts<T> = {
  collectionSuffix: string;
  entity: T;
  organizationId: string;
  entityId: string;
};

export async function writeEntity<T extends object>({
  collectionSuffix,
  entity,
  organizationId,
  entityId,
}: WriteEntityOpts<T>): Promise<T> {
  if (adminDb) {
    await adminDb
      .collection('organizations')
      .doc(organizationId)
      .collection(collectionSuffix)
      .doc(entityId)
      .set({ ...entity });
  }
  return entity;
}

export async function queryOrgCollection<T = any>(
  organizationId: string,
  collectionSuffix: string,
  filters: Array<[string, string, any]> = [],
  pagination: { limit: number; offset: number } = { limit: 20, offset: 0 },
): Promise<{ items: T[]; total: number }> {
  if (!adminDb) return { items: [], total: 0 };
  let q: any = adminDb
    .collection('organizations')
    .doc(organizationId)
    .collection(collectionSuffix)
    .where('organizationId', '==', organizationId);
  for (const [field, op, val] of filters) {
    if (val !== undefined && val !== null) {
      q = q.where(field, op, val);
    }
  }
  const snap = await q.get();
  const all: T[] = [];
  snap.forEach((d: any) => all.push(d.data() as T));
  const total = all.length;
  const items = all.slice(pagination.offset, pagination.offset + pagination.limit);
  return { items, total };
}

export async function assertBeneficiarySharesNotOverflow(
  organizationId: string,
  customerId: string,
  legacyPlanId: string | undefined | null,
  incomingShare: number,
): Promise<void> {
  if (!adminDb) return;
  let q: any = adminDb
    .collection('organizations')
    .doc(organizationId)
    .collection('beneficiaries')
    .where('organizationId', '==', organizationId)
    .where('customerId', '==', customerId);
  if (legacyPlanId) {
    q = q.where('legacyPlanId', '==', legacyPlanId);
  } else {
    q = q.where('legacyPlanId', 'in', [null, undefined]);
  }
  const snap = await q.get();
  let running = incomingShare;
  snap.forEach((d: any) => {
    const row = d.data();
    running += Number(row.share ?? 0);
  });
  if (running > 100) {
    throw new ApiError(
      400,
      'BENEFICIARY_SHARES_OVERFLOW',
      `Beneficiary shares total ${running} exceeds 100 for customerId=${customerId} legacyPlanId=${legacyPlanId ?? 'none'}`,
      { total: running, max: 100 },
    );
  }
}

export { genId };
