import { v1Route, structuredJson } from '@/lib/v1-route';
import { WebhookEndpointCreateSchema } from '@/types/enterprise';
import { FirestorePersistenceBackend } from '@/services/enterprise/persistence';
import { generateSigningSecret } from '@/services/enterprise/webhook';
import { SystemEvent } from '@/services/events';
import { logV1Event, processWebhookEnqueue, makeWebhookDeliveryEvent, genId } from '@/services/enterprise/v1-helpers';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

const persistence = new FirestorePersistenceBackend();

export const GET = v1Route({
  method: 'GET',
  scope: 'webhooks:manage',
  requireOrg: true,
  async handle({ auth, searchParams }) {
    const organizationId = auth.organizationId!;
    const includeDeliveries = searchParams.get('include') === 'deliveries';
    const enabledParam = searchParams.get('enabled');
    const whereFilters: [string, string, any][] = [['organizationId', '==', organizationId]];
    if (enabledParam !== null && enabledParam !== undefined) {
      whereFilters.push(['enabled', '==', enabledParam === 'true']);
    }
    const allEndpoints = await persistence.list<any>(organizationId, 'webhookEndpoints', {
      where: whereFilters,
      orderBy: ['createdAt', 'desc'],
    });
    const endpoints = allEndpoints.map(e => ({ ...e }));
    let deliveriesByEndpoint: Record<string, any[]> = {};
    if (includeDeliveries && adminDb) {
      const deliveriesSnap = await adminDb
        .collection('organizations')
        .doc(organizationId)
        .collection('webhookDeliveries')
        .orderBy('scheduledAt', 'desc')
        .limit(100)
        .get();
      const allDeliveries: any[] = [];
      deliveriesSnap.forEach((d: any) => allDeliveries.push({ id: d.id, ...d.data() }));
      for (const ep of endpoints) {
        deliveriesByEndpoint[ep.id] = allDeliveries.filter((d) => d.endpointId === ep.id).slice(0, 20);
      }
    }
    const data = endpoints.map((ep) => {
      const { secret, ...rest } = ep;
      return {
        ...rest,
        ...(includeDeliveries ? { recentDeliveries: deliveriesByEndpoint[ep.id] ?? [] } : {}),
      };
    });
    return structuredJson({
      data,
      meta: {
        organizationId,
        includeDeliveries,
        total: data.length,
        enabledFilter: enabledParam,
        note: 'consecutiveFailures >= threshold auto-disables endpoint',
      },
    });
  },
});

export const POST = v1Route({
  method: 'POST',
  scope: 'webhooks:manage',
  requireOrg: true,
  bodySchema: WebhookEndpointCreateSchema,
  async handle({ auth, body, requestId }) {
    const organizationId = auth.organizationId!;
    const secret = generateSigningSecret();
    const endpoint = await persistence.createWebhookEndpoint(organizationId, {
      ...body,
      secret,
    });
    await logV1Event(auth, SystemEvent.WEBHOOK_UPDATED, { endpoint: { id: endpoint.id, url: endpoint.url, events: endpoint.events } }, {
      requestId,
      resource: { type: 'webhookEndpoint', id: endpoint.id },
      result: 'success',
    });
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'webhook.updated',
      organizationId,
      {
        endpoint: {
          id: endpoint.id,
          url: endpoint.url,
          description: endpoint.description,
          events: endpoint.events,
          enabled: endpoint.enabled,
          signingAlgo: endpoint.signingAlgo,
          createdAt: endpoint.createdAt,
        },
      },
      { requestId, actor: auth.method === 'api_key' ? auth.keyId : auth.method === 'firebase' ? auth.uid : auth.actorId },
    );
    await processWebhookEnqueue(organizationId, evt);
    return structuredJson({
      endpoint: {
        id: endpoint.id,
        organizationId: endpoint.organizationId,
        url: endpoint.url,
        description: endpoint.description,
        events: endpoint.events,
        signingAlgo: endpoint.signingAlgo,
        secret,
        enabled: endpoint.enabled,
        consecutiveFailures: endpoint.consecutiveFailures,
        createdAt: endpoint.createdAt,
      },
      audit: 'WEBHOOK_UPDATED',
      requestId,
    }, 201);
  },
});
