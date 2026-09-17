import { v1Route, structuredJson } from '@/lib/v1-route';
import { ApiError } from '@/lib/api-errors';
import { completeIdentityVerificationFromProvider } from '@/services/enterprise/domain-model';
import { SystemEvent } from '@/services/events';
import { logV1Event, genId, processWebhookEnqueue, makeWebhookDeliveryEvent } from '@/services/enterprise/v1-helpers';
import { getMockIdentityProvider } from '@/services/enterprise/identity-verification';

export const dynamic = 'force-dynamic';

export const POST = v1Route({
  method: 'POST',
  scope: 'customers:write',
  requireOrg: true,
  async handle({ auth, params, body, requestId, idempotencyKey }) {
    const organizationId = auth.organizationId!;
    const customerId = params.customerId;
    if (!customerId) throw new ApiError(400, 'CUSTOMER_ID_MISSING', 'customerId path parameter required');

    const verificationId = (body as any)?.verificationId as string | undefined;
    if (!verificationId) throw new ApiError(400, 'VERIFICATION_ID_MISSING', 'verificationId is required in body');

    const provider = getMockIdentityProvider();
    const customer = await completeIdentityVerificationFromProvider(organizationId, customerId, verificationId, provider);

    await logV1Event(auth, SystemEvent.CUSTOMER_CREATED, {
      customerId,
      verificationId,
      newStatus: customer.verificationStatus,
    }, {
      requestId,
      resource: { type: 'customer', id: customerId },
    });

    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      `customer.verification_${customer.verificationStatus}`,
      organizationId,
      { customerId, verificationId, status: customer.verificationStatus },
      { idempotencyKey: idempotencyKey ?? undefined, requestId, actor: (auth as any).actorId },
    );
    await processWebhookEnqueue(organizationId, evt);

    return structuredJson({
      customerId,
      verificationId,
      status: customer.verificationStatus,
      requestId,
    });
  },
});