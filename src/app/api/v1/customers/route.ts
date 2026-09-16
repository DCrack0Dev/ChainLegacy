import { v1Route, structuredJson } from '@/lib/v1-route';
import { CustomerCreateSchema, Customer } from '@/types/enterprise';
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
  scope: 'customers:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const partnerCustomerId = searchParams.get('partnerCustomerId');
    const filters: Array<[string, string, any]> = [];
    if (partnerCustomerId) filters.push(['partnerCustomerId', '==', partnerCustomerId]);
    const { items, total } = await queryOrgCollection<Customer>(
      organizationId,
      'customers',
      filters,
      pagination,
    );
    return structuredJson({
      data: items,
      meta: { organizationId, partnerCustomerId, pagination, total },
    });
  },
});

export const POST = v1Route({
  method: 'POST',
  scope: 'customers:write',
  requireOrg: true,
  bodySchema: CustomerCreateSchema,
  async handle({ auth, body, idempotencyKey, requestId }) {
    const organizationId = auth.organizationId!;
    const id = genId('cust');
    const now = new Date();
    const customer: Customer = {
      id,
      organizationId,
      ...body,
      createdAt: now,
      updatedAt: now,
    } as Customer;
    await writeEntity({
      collectionSuffix: 'customers',
      entity: customer,
      organizationId,
      entityId: id,
    });
    await logV1Event(auth, SystemEvent.CUSTOMER_CREATED, { customer }, {
      requestId,
      resource: { type: 'customer', id },
    });
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'customer.created',
      organizationId,
      { customer },
      { idempotencyKey: idempotencyKey ?? undefined, requestId, actor: (auth as any).actorId },
    );
    await processWebhookEnqueue(organizationId, evt);
    return structuredJson({
      customer,
      idempotencyKey,
      requestId,
    }, 201);
  },
});
