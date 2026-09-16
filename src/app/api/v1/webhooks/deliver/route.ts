import { v1Route, structuredJson } from '@/lib/v1-route';
import { signSignature, processDeliveryBatch, DeliveryRow, EndpointLike, EndpointUpdate } from '@/services/enterprise/webhook';
import { adminDb } from '@/lib/firebase-admin';
import { FirestorePersistenceBackend } from '@/services/enterprise/persistence';

export const dynamic = 'force-dynamic';

const persistence = new FirestorePersistenceBackend();

async function listAllOrganizations(): Promise<{ id: string }[]> {
  if (!adminDb) return [];
  const snap = await adminDb.collection('organizations').select('id').get();
  const out: { id: string }[] = [];
  snap.forEach((d: any) => out.push({ id: d.id }));
  return out;
}

async function listOrgEndpoints(orgId: string): Promise<EndpointLike[]> {
  if (!adminDb) return [];
  const snap = await adminDb
    .collection('organizations')
    .doc(orgId)
    .collection('webhookEndpoints')
    .get();
  const out: EndpointLike[] = [];
  snap.forEach((d: any) => {
    const raw = d.data() as any;
    out.push({
      id: d.id,
      organizationId: raw.organizationId ?? orgId,
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

function makeFirestoreDeps() {
  return {
    async loadScheduledEvents(orgId: string, endpointId: string, limit = 50): Promise<DeliveryRow[]> {
      if (!adminDb) return [];
      const now = Date.now();
      const snap = await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('webhookDeliveries')
        .where('endpointId', '==', endpointId)
        .orderBy('deliverAfter', 'asc')
        .limit(limit)
        .get();
      const rows: DeliveryRow[] = [];
      snap.forEach((d: any) => {
        const raw = d.data() as any;
        if (raw.deliveredAt) return;
        if (raw.deadLetterAt) return;
        rows.push({
          id: d.id,
          dedupeKey: raw.dedupeKey,
          attempt: raw.attempt ?? 0,
          deliverAfter: raw.deliverAfter ? (raw.deliverAt as Date ? (raw.deliverAt as Date).getTime() : Number(raw.deliverAfter)) : 0,
          lastAttemptAt: raw.lastAttemptAt ? (raw.lastAttemptAt as Date ? (raw.lastAttemptAt as Date).getTime() : Number(raw.lastAttemptAt)) : undefined,
          httpStatus: raw.httpStatus,
          lastError: raw.lastError,
          deliveredAt: raw.deliveredAt ? (raw.deliveredAt as Date ? (raw.deliveredAt as Date).getTime() : Number(raw.deliveredAt)) : undefined,
          deadLetterAt: raw.deadLetterAt ? (raw.deadLetterAt as Date ? (raw.deadLetterAt as Date).getTime() : Number(raw.deadLetterAt)) : undefined,
          endpointId: raw.endpointId,
          organizationId: raw.organizationId ?? orgId,
          eventId: raw.eventId,
          eventType: raw.eventType,
          scheduledAt: raw.scheduledAt ? (raw.scheduledAt as Date ? (raw.scheduledAt as Date).getTime() : Number(raw.scheduledAt)) : now,
          payload: raw.payload,
          signatureHeader: raw.signatureHeader,
        });
      });
      return rows;
    },
    async loadEndpoint(orgId: string, endpointId: string): Promise<EndpointLike | null> {
      const ep = await persistence.getWebhookEndpoint(orgId, endpointId);
      if (!ep) return null;
      return {
        id: ep.id,
        organizationId: ep.organizationId,
        url: ep.url,
        enabled: ep.enabled,
        events: ep.events,
        consecutiveFailures: ep.consecutiveFailures,
        disabledAt: ep.disabledAt ?? null,
        secret: ep.secret,
        signingAlgo: ep.signingAlgo,
      };
    },
    async persistDeliveryUpdate(row: DeliveryRow): Promise<void> {
      if (!adminDb) return;
      const ref = adminDb
        .collection('organizations')
        .doc(row.organizationId)
        .collection('webhookDeliveries')
        .doc(row.id);
      const payload: any = { ...row };
      if (row.lastAttemptAt) payload.lastAttemptAt = new Date(row.lastAttemptAt);
      if (row.deliveredAt) payload.deliveredAt = new Date(row.deliveredAt);
      if (row.deadLetterAt) payload.deadLetterAt = new Date(row.deadLetterAt);
      payload.deliverAfter = new Date(row.deliverAfter);
      payload.scheduledAt = new Date(row.scheduledAt);
      await ref.set(payload, { merge: true });
    },
    async moveToDeadLetter(row: DeliveryRow): Promise<void> {
      if (!adminDb) return;
      const ref = adminDb
        .collection('organizations')
        .doc(row.organizationId)
        .collection('webhookDeadLetters')
        .doc(row.id);
      await ref.set({
        id: row.id,
        deliveryId: row.id,
        endpointId: row.endpointId,
        eventId: row.eventId,
        eventType: row.eventType,
        payload: row.payload,
        reason: 'max_attempts_exceeded',
        lastError: row.lastError,
        lastAttemptAt: row.lastAttemptAt ? new Date(row.lastAttemptAt) : undefined,
        createdAt: new Date(row.deadLetterAt ?? Date.now()),
      });
      await persistence.createWebhookDeadLetter(row.organizationId, {
        deliveryId: row.id,
        endpointId: row.endpointId,
        eventId: row.eventId,
        eventType: row.eventType,
        payload: row.payload,
        reason: 'max_attempts_exceeded',
        lastError: row.lastError,
      }).catch(() => {});
    },
    async persistEndpointUpdate(patch: EndpointUpdate): Promise<void> {
      if (!adminDb) return;
      const ref = adminDb
        .collection('organizations')
        .doc(patch.organizationId)
        .collection('webhookEndpoints')
        .doc(patch.id);
      const updatePayload: any = {};
      if (patch.consecutiveFailures !== undefined) updatePayload.consecutiveFailures = patch.consecutiveFailures;
      if (patch.enabled !== undefined) updatePayload.enabled = patch.enabled;
      if (patch.disabledAt !== undefined) {
        updatePayload.disabledAt = patch.disabledAt === null ? null : new Date(patch.disabledAt);
      }
      if (patch.lastDeliveredAt !== undefined) updatePayload.lastDeliveredAt = new Date(patch.lastDeliveredAt);
      updatePayload.updatedAt = new Date();
      await ref.set(updatePayload, { merge: true });
    },
  };
}

export const POST = v1Route({
  method: 'POST',
  allowCron: true,
  requireOrg: false,
  async handle({ auth, requestId }) {
    const started = new Date();
    const deps = makeFirestoreDeps();
    const orgs = await listAllOrganizations();
    const batches: Array<{
      organizationId: string;
      endpointId: string;
      endpointUrl: string;
      delivered: number;
      failed: number;
      movedToDeadLetter: number;
      endpointDisabled: boolean;
    }> = [];
    let totalAttempts = 0;
    let delivered = 0;
    let failures = 0;
    let movedToDeadLetter = 0;
    let endpointsDisabled = 0;
    const orgsProcessed: string[] = [];

    for (const org of orgs) {
      const endpoints = await listOrgEndpoints(org.id);
      if (endpoints.length === 0) continue;
      orgsProcessed.push(org.id);
      for (const ep of endpoints) {
        const batch = await processDeliveryBatch(org.id, ep.id, deps, 50);
        const batchAttempts = batch.delivered + batch.failed;
        totalAttempts += batchAttempts;
        delivered += batch.delivered;
        failures += batch.failed;
        movedToDeadLetter += batch.movedToDeadLetter;
        if (batch.endpointDisabled) endpointsDisabled += 1;
        batches.push({
          organizationId: org.id,
          endpointId: ep.id,
          endpointUrl: ep.url,
          delivered: batch.delivered,
          failed: batch.failed,
          movedToDeadLetter: batch.movedToDeadLetter,
          endpointDisabled: batch.endpointDisabled,
        });
      }
    }

    return structuredJson({
      started,
      finishedAt: new Date(),
      authMethod: auth.method,
      orgsScanned: orgs.length,
      orgsProcessed: orgsProcessed.length,
      endpointsScanned: batches.length,
      batches,
      totalAttempts,
      delivered,
      failures,
      movedToDeadLetter,
      endpointsDisabled,
      note: 'per-endpoint: 8 attempts, exp backoff 1min*2^attempt capped 24h; HMAC-SHA256 t=,v1= signature; 5-minute tolerance; consecutive failures disable endpoint.',
      signatureExample: signSignature('whsec_demo', JSON.stringify({}), Math.floor(Date.now() / 1000)),
      requestId,
    });
  },
});
