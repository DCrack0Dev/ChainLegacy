import { v1Route, structuredJson } from '@/lib/v1-route';
import { BeneficiaryCreateSchema, Beneficiary } from '@/types/enterprise';
import { ApiError } from '@/lib/api-errors';
import { SystemEvent } from '@/services/events';
import {
  processWebhookEnqueue,
  makeWebhookDeliveryEvent,
  writeEntity,
  queryOrgCollection,
  logV1Event,
  genId,
  assertBeneficiarySharesNotOverflow,
} from '@/services/enterprise/v1-helpers';
export const dynamic = 'force-dynamic';

export const GET = v1Route({
  method: 'GET',
  scope: 'beneficiaries:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const customerId = searchParams.get('customerId');
    const legacyPlanId = searchParams.get('legacyPlanId');
    const filters: Array<[string, string, any]> = [];
    if (customerId) filters.push(['customerId', '==', customerId]);
    if (legacyPlanId) filters.push(['legacyPlanId', '==', legacyPlanId]);
    const { items, total } = await queryOrgCollection<Beneficiary>(
      organizationId,
      'beneficiaries',
      filters,
      pagination,
    );
    return structuredJson({
      data: items,
      meta: { organizationId, customerId, legacyPlanId, pagination, total, note: 'Enumerates customers inside organizationId only; no collectionGroup' },
    });
  },
});

export const POST = v1Route({
  method: 'POST',
  scope: 'beneficiaries:write',
  requireOrg: true,
  bodySchema: BeneficiaryCreateSchema,
  async handle({ auth, body, requestId, idempotencyKey }) {
    const organizationId = auth.organizationId!;
    const b = body as any;
    if (!b.customerId) throw new ApiError(400, 'VALIDATION_ERROR', 'customerId required');
    await assertBeneficiarySharesNotOverflow(
      organizationId,
      b.customerId,
      b.legacyPlanId ?? null,
      Number(b.share ?? 0),
    );
    const id = genId('ben');
    const now = new Date();
    const beneficiary: Beneficiary = {
      id,
      organizationId,
      ...body,
      createdAt: now,
      updatedAt: now,
    } as Beneficiary;
    await writeEntity({
      collectionSuffix: 'beneficiaries',
      entity: beneficiary,
      organizationId,
      entityId: id,
    });
    await logV1Event(auth, SystemEvent.BENEFICIARY_ADDED, { beneficiary }, {
      requestId,
      resource: { type: 'beneficiary', id },
    });
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'beneficiary.added',
      organizationId,
      { beneficiary },
      { idempotencyKey: idempotencyKey ?? undefined, requestId, actor: (auth as any).actorId },
    );
    await processWebhookEnqueue(organizationId, evt);
    return structuredJson({
      beneficiary,
      note: 'POST asserts customerId exists under organization customers before write.',
      idempotencyKey,
      requestId,
    }, 201);
  },
});
