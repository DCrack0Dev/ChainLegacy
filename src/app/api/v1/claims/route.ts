import { v1Route, structuredJson } from '@/lib/v1-route';
import { ClaimCreateSchema, ClaimSchema, Claim, ClaimStatus, Customer, LegacyPlan, Vault } from '@/types/enterprise';
import { assertPlanRelationship } from '@/services/enterprise/domain-model';
import { SystemEvent } from '@/services/events';
import {
  processWebhookEnqueue,
  makeWebhookDeliveryEvent,
  writeEntity,
  queryOrgCollection,
  logV1Event,
  genId,
} from '@/services/enterprise/v1-helpers';
import { adminDb } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/api-errors';
export const dynamic = 'force-dynamic';

export const GET = v1Route({
  method: 'GET',
  scope: 'claims:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const status = searchParams.get('status');
    const legacyPlanId = searchParams.get('legacyPlanId');
    const customerId = searchParams.get('customerId');
    const filters: Array<[string, string, any]> = [];
    if (status) filters.push(['status', '==', status]);
    if (legacyPlanId) filters.push(['legacyPlanId', '==', legacyPlanId]);
    if (customerId) filters.push(['customerId', '==', customerId]);
    const { items, total } = await queryOrgCollection<Claim>(
      organizationId,
      'claims',
      filters,
      pagination,
    );
    return structuredJson({
      data: items,
      meta: {
        organizationId,
        status,
        legacyPlanId,
        customerId,
        pagination,
        total,
      },
    });
  },
});

export const POST = v1Route({
  method: 'POST',
  scope: 'claims:manage',
  requireOrg: true,
  bodySchema: ClaimCreateSchema,
  async handle({ auth, body, idempotencyKey, requestId }) {
    const organizationId = auth.organizationId!;
    const id = genId('claim');
    const now = new Date();
    const claimRaw: any = {
      id,
      organizationId,
      status: ClaimStatus.PENDING,
      transitions: [],
      guardianApprovals: {},
      approvalsCount: 0,
      disputeReason: null,
      ...body,
      createdAt: now,
      updatedAt: now,
    };
    const parsed = ClaimSchema.safeParse(claimRaw);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '));
    }
    const claim: Claim = parsed.data;
    if (adminDb) {
      const planSnap = await adminDb
        .collection('organizations').doc(organizationId)
        .collection('legacyPlans').where('id', '==', claim.legacyPlanId).limit(1)
        .get();
      if (planSnap.empty) throw new ApiError(404, 'LEGACY_PLAN_NOT_FOUND', `legacyPlanId ${claim.legacyPlanId} not found under this organization`);
      const custSnap = await adminDb
        .collection('organizations').doc(organizationId)
        .collection('customers').where('id', '==', claim.customerId).limit(1)
        .get();
      if (custSnap.empty) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', `customerId ${claim.customerId} not found under this organization`);
      // Canonical chain: Claim → Legacy Plan → Vault → Customer (all in one organization).
      const plan = { id: planSnap.docs[0].id, ...planSnap.docs[0].data() } as LegacyPlan;
      const customer = { id: custSnap.docs[0].id, ...custSnap.docs[0].data() } as Customer;
      if (plan.vaultId) {
        const vaultSnap = await adminDb
          .collection('organizations').doc(organizationId)
          .collection('vaults').doc(plan.vaultId).get();
        const vault = vaultSnap.exists ? ({ id: vaultSnap.id, ...vaultSnap.data() } as Vault) : null;
        assertPlanRelationship(plan, customer, vault);
      } else {
        assertPlanRelationship(plan, customer);
      }
    }
    await writeEntity({
      collectionSuffix: 'claims',
      entity: claim,
      organizationId,
      entityId: id,
    });
    await logV1Event(auth, SystemEvent.CLAIM_INITIATED, { claim }, {
      requestId,
      resource: { type: 'claim', id },
    });
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'claim.created',
      organizationId,
      { claim },
      { idempotencyKey: idempotencyKey ?? undefined, requestId, actor: (auth as any).actorId },
    );
    await processWebhookEnqueue(organizationId, evt);
    return structuredJson({
      claim,
      idempotencyKey,
      webhookEvent: 'claim.created',
      audit: 'CLAIM_INITIATED',
      requestId,
    }, 201);
  },
});
