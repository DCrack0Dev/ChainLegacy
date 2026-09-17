import { v1Route, structuredJson } from '@/lib/v1-route';
import { GuardianCreateSchema, Guardian } from '@/types/enterprise';
import { getCustomerInOrg } from '@/services/enterprise/domain-model';
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
  scope: 'guardians:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const customerId = searchParams.get('customerId');
    const filters: Array<[string, string, any]> = [];
    if (customerId) filters.push(['customerId', '==', customerId]);
    const { items, total } = await queryOrgCollection<Guardian>(
      organizationId,
      'guardians',
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
  scope: 'guardians:write',
  requireOrg: true,
  bodySchema: GuardianCreateSchema,
  async handle({ auth, body, requestId, idempotencyKey }) {
    const organizationId = auth.organizationId!;
    const id = genId('g');
    const gb = body as any;
    // Canonical chain: Guardian → (optional) Customer inside the same organization.
    // Guardians are keyed by their own id (guard_*) and may additionally carry a
    // firebaseUid/walletAddress identity used later for claim approval proofs.
    if (gb.customerId) {
      await getCustomerInOrg(organizationId, gb.customerId);
    }
    const now = new Date();
    const guardian: Guardian = {
      id,
      organizationId,
      ...body,
      createdAt: now,
      updatedAt: now,
    } as Guardian;
    await writeEntity({
      collectionSuffix: 'guardians',
      entity: guardian,
      organizationId,
      entityId: id,
    });
    await logV1Event(auth, SystemEvent.GUARDIAN_UPDATED, { guardian }, {
      requestId,
      resource: { type: 'guardian', id },
    });
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'guardian.updated',
      organizationId,
      { guardian },
      { idempotencyKey: idempotencyKey ?? undefined, requestId, actor: (auth as any).actorId },
    );
    await processWebhookEnqueue(organizationId, evt);
    return structuredJson({
      guardian,
      audit: 'GUARDIAN_UPDATED',
      requestId,
    }, 201);
  },
});
