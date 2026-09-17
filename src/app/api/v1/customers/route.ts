import { v1Route, structuredJson } from '@/lib/v1-route';
import { CustomerCreateSchema, Customer, IdentityVerificationStatus } from '@/types/enterprise';
import {
  assertCustomerHasNoValidatedIdentity,
  assertCustomerIdentityLink,
  assertFirebaseUidNotReusedAsCustomerId,
  findCustomersByFirebaseUid,
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
  scope: 'customers:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const partnerCustomerId = searchParams.get('partnerCustomerId');
    const firebaseUid = searchParams.get('firebaseUid');
    const email = searchParams.get('email');
    const filters: Array<[string, string, any]> = [];
    if (partnerCustomerId) filters.push(['partnerCustomerId', '==', partnerCustomerId]);
    if (firebaseUid) filters.push(['firebaseUid', '==', firebaseUid]);
    if (email) filters.push(['email', '==', email]);
    const { items, total } = await queryOrgCollection<Customer>(
      organizationId,
      'customers',
      filters,
      pagination,
    );
    return structuredJson({
      data: items,
      meta: { organizationId, partnerCustomerId, firebaseUid, email, pagination, total },
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
    const firebaseUid = (body as { firebaseUid?: string | null }).firebaseUid ?? null;
    if (firebaseUid) {
      // Canonical rule: the Firebase UID identifies the authenticated person, the
      // customer id identifies the enterprise-domain customer. They must never collide.
      assertFirebaseUidNotReusedAsCustomerId(firebaseUid, [{ id }]);
      const existing = await findCustomersByFirebaseUid(organizationId, firebaseUid);
      assertCustomerHasNoValidatedIdentity({ id, firebaseUid }, existing);
    }
    const now = new Date();
    const customer: Customer = {
      id,
      organizationId,
      ...body,
      // Server-owned: a client may only ever create a customer in `not_started` state.
      // Reaching `verified`/`rejected`/`manual_review` is a server action.
      verificationStatus: IdentityVerificationStatus.NOT_STARTED,
      createdAt: now,
      updatedAt: now,
    } as Customer;
    if (firebaseUid) assertCustomerIdentityLink(customer);
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
