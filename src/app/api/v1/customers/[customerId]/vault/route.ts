import { v1Route, structuredJson } from '@/lib/v1-route';
import { ApiError } from '@/lib/api-errors';
import { Vault, VaultCreateSchema } from '@/types/enterprise';
import {
  createVaultForCustomer,
  getCustomerInOrg,
  getVaultInOrg,
  linkVaultToCustomer,
} from '@/services/enterprise/domain-model';
import { logV1Event, genId, processWebhookEnqueue, makeWebhookDeliveryEvent } from '@/services/enterprise/v1-helpers';
import { SystemEvent } from '@/services/events';

export const dynamic = 'force-dynamic';

/**
 * Canonical 1:1 Customer ↔ Vault endpoint.
 *
 *   POST /api/v1/customers/{customerId}/vault  → create (or return) the customer vault
 *   GET  /api/v1/customers/{customerId}/vault  → inspect the vault link
 *
 * The vault is the container for the protected legacy; every legacy plan for this
 * customer must reference it. Server admin only (Firestore rules deny client writes).
 */

async function loadCustomerVault(auth: any, customerId: string) {
  const organizationId = auth.organizationId as string;
  const customer = await getCustomerInOrg(organizationId, customerId);
  if (!customer.vaultId) {
    // Same 404 contract as other v1 lookups: an unlinked vault does not exist yet.
    throw new ApiError(404, 'RELATED_RESOURCE_NOT_FOUND', 'Customer has no vault yet', { customerId });
  }
  const vault = await getVaultInOrg(organizationId, customer.vaultId);
  return { customer, vault };
}

export const GET = v1Route({
  method: 'GET',
  scope: 'vaults:read',
  requireOrg: true,
  async handle({ auth, params, requestId }) {
    const customerId = params.customerId;
    if (!customerId) throw new ApiError(400, 'CUSTOMER_ID_MISSING', 'customerId path parameter required');
    const { customer, vault } = await loadCustomerVault(auth, customerId);
    return structuredJson({
      vault,
      customerId: customer.id,
      customerVaultId: customer.vaultId,
      verificationStatus: customer.verificationStatus,
      requestId,
    });
  },
});

export const POST = v1Route({
  method: 'POST',
  scope: 'vaults:write',
  requireOrg: true,
  bodySchema: VaultCreateSchema.partial(),
  async handle({ auth, params, body, requestId, idempotencyKey }) {
    const customerId = params.customerId;
    if (!customerId) throw new ApiError(400, 'CUSTOMER_ID_MISSING', 'customerId path parameter required');
    const organizationId = auth.organizationId!;
    const input = (body ?? {}) as { vaultId?: string; name?: string; intervalDays?: number };
    let vault: Vault;
    let customerVaultId: string;
    let created = false;
    let linked = false;

    if (input.vaultId) {
      // Explicit relink of an already-provisioned vault document.
      const result = await linkVaultToCustomer(organizationId, customerId, input.vaultId);
      vault = result.vault;
      customerVaultId = result.customer.vaultId!;
      linked = true;
    } else {
      const result = await createVaultForCustomer(organizationId, customerId, {
        name: input.name,
        intervalDays: input.intervalDays,
      });
      vault = result.vault;
      customerVaultId = result.customer.vaultId!;
      created = result.created;
      linked = result.created;
    }

    await logV1Event(auth, created || linked ? SystemEvent.VAULT_CREATED : SystemEvent.VAULT_UPDATED, {
      vaultId: vault.id,
      customerId,
      created,
      linked,
    }, {
      requestId,
      resource: { type: 'vault', id: vault.id },
    });

    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      created ? 'vault.created' : 'vault.linked',
      organizationId,
      { vault, customerId },
      { idempotencyKey: idempotencyKey ?? undefined, requestId, actor: (auth as any).actorId },
    );
    await processWebhookEnqueue(organizationId, evt);

    return structuredJson({
      vault,
      customerId,
      customerVaultId,
      created,
      linked,
      requestId,
    }, created ? 201 : 200);
  },
});