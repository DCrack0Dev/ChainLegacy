import { v1Route, structuredJson } from '@/lib/v1-route';
import { LegacyPlanCreateSchema, LegacyPlan } from '@/types/enterprise';
import { SystemEvent } from '@/services/events';
import {
  processWebhookEnqueue,
  makeWebhookDeliveryEvent,
  writeEntity,
  queryOrgCollection,
  logV1Event,
  genId,
} from '@/services/enterprise/v1-helpers';
export const dynamic = 'force-dynamic';

export const GET = v1Route({
  method: 'GET',
  scope: 'legacy_plans:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const customerId = searchParams.get('customerId');
    const filters: Array<[string, string, any]> = [];
    if (customerId) filters.push(['customerId', '==', customerId]);
    const { items, total } = await queryOrgCollection<LegacyPlan>(
      organizationId,
      'legacyPlans',
      filters,
      pagination,
    );
    return structuredJson({
      data: items,
      meta: { organizationId, customerId, pagination, total },
    });
  },
});

export const POST = v1Route({
  method: 'POST',
  scope: 'legacy_plans:write',
  requireOrg: true,
  bodySchema: LegacyPlanCreateSchema,
  async handle({ auth, body, requestId, idempotencyKey }) {
    const organizationId = auth.organizationId!;
    const id = genId('plan');
    const now = new Date();
    const plan: LegacyPlan = {
      id,
      organizationId,
      status: 'draft',
      lastCheckInAt: undefined,
      nextEscalationAt: undefined,
      suspicionScore: 0,
      ...body,
      createdAt: now,
      updatedAt: now,
    } as LegacyPlan;
    await writeEntity({
      collectionSuffix: 'legacyPlans',
      entity: plan,
      organizationId,
      entityId: id,
    });
    await logV1Event(auth, SystemEvent.LEGACY_PLAN_CREATED, { plan }, {
      requestId,
      resource: { type: 'legacyPlan', id },
    });
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'legacy_plan.created',
      organizationId,
      { plan },
      { idempotencyKey: idempotencyKey ?? undefined, requestId, actor: (auth as any).actorId },
    );
    await processWebhookEnqueue(organizationId, evt);
    return structuredJson({
      plan,
      webhookEvent: 'legacy_plan.created',
      requestId,
    }, 201);
  },
});
