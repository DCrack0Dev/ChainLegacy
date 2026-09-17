import { v1Route, structuredJson } from '@/lib/v1-route';
import { LegacyPlanCreateSchema, LegacyPlan } from '@/types/enterprise';
import { ApiError } from '@/lib/api-errors';
import {
  DOMAIN_ERROR_CODES,
  assertPlanRelationship,
  assertVaultBelongsToCustomer,
  getCustomerInOrg,
  getVaultInOrg,
} from '@/services/enterprise/domain-model';
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
    const input = body as any;
    const customerId = input.customerId;
    if (!customerId) {
      throw new ApiError(400, 'RELATIONSHIP_REQUIRED', 'customerId is required: a legacy plan belongs to a customer');
    }
    // Canonical chain: Customer → Vault → Legacy Plan. A plan arranges exactly one vault.
    const customer = await getCustomerInOrg(organizationId, customerId).catch((err) => {
      if (err instanceof ApiError) throw err;
      throw new ApiError(500, 'INTERNAL', 'Failed to load customer');
    });
    const vaultId = input.vaultId ?? customer.vaultId ?? null;
    if (!vaultId) {
      throw new ApiError(
        400,
        DOMAIN_ERROR_CODES.RELATIONSHIP_REQUIRED,
        'Customer has no vault yet: create the vault (POST /api/v1/customers/{customerId}/vault) before its legacy plan',
        { customerId },
      );
    }
    const vault = await getVaultInOrg(organizationId, vaultId);
    assertVaultBelongsToCustomer(vault, customer);

    const now = new Date();
    const plan: LegacyPlan = {
      id,
      organizationId,
      customerId,
      vaultId,
      status: 'draft',
      lastCheckInAt: undefined,
      nextEscalationAt: undefined,
      suspicionScore: 0,
      ...input,
      createdAt: now,
      updatedAt: now,
    } as LegacyPlan;
    assertPlanRelationship(plan, customer, vault);
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
