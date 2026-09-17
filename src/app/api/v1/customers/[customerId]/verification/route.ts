import { v1Route, structuredJson } from '@/lib/v1-route';
import { ApiError } from '@/lib/api-errors';
import { startIdentityVerification, completeIdentityVerificationFromProvider } from '@/services/enterprise/domain-model';
import { SystemEvent } from '@/services/events';
import { logV1Event, genId, processWebhookEnqueue, makeWebhookDeliveryEvent } from '@/services/enterprise/v1-helpers';
import { getMockIdentityProvider } from '@/services/enterprise/identity-verification';

export const dynamic = 'force-dynamic';

export const POST = v1Route({
  method: 'POST',
  scope: 'customers:write',
  requireOrg: true,
  async handle({ auth, params, requestId, idempotencyKey }) {
    const organizationId = auth.organizationId!;
    const customerId = params.customerId;
    if (!customerId) throw new ApiError(400, 'CUSTOMER_ID_MISSING', 'customerId path parameter required');

    const provider = getMockIdentityProvider();
    const result = await startIdentityVerification(organizationId, customerId, provider);

    await logV1Event(auth, SystemEvent.CUSTOMER_CREATED, {
      customerId,
      verificationId: result.verificationId,
      provider: result.provider,
    }, {
      requestId,
      resource: { type: 'customer', id: customerId },
    });

    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'customer.verification_started',
      organizationId,
      { customerId, verificationId: result.verificationId, provider: result.provider },
      { idempotencyKey: idempotencyKey ?? undefined, requestId, actor: (auth as any).actorId },
    );
    await processWebhookEnqueue(organizationId, evt);

    return structuredJson({
      customerId,
      verificationId: result.verificationId,
      status: result.status,
      provider: result.provider,
      requestId,
    }, 202);
  },
});