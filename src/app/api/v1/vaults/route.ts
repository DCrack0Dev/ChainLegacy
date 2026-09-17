import { v1Route, structuredJson } from '@/lib/v1-route';
import { Vault } from '@/types/enterprise';
import { queryOrgCollection } from '@/services/enterprise/v1-helpers';

export const dynamic = 'force-dynamic';

/**
 * Canonical vault listing. Vaults are always scoped to the authenticated organization
 * and optionally to a single customer or Firebase-owned identity.
 */
export const GET = v1Route({
  method: 'GET',
  scope: 'vaults:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const customerId = searchParams.get('customerId');
    const ownerUid = searchParams.get('ownerUid');
    const status = searchParams.get('status');
    const filters: Array<[string, string, any]> = [];
    if (customerId) filters.push(['customerId', '==', customerId]);
    if (ownerUid) filters.push(['ownerUid', '==', ownerUid]);
    if (status) filters.push(['status', '==', status]);
    const { items, total } = await queryOrgCollection<Vault>(
      organizationId,
      'vaults',
      filters,
      pagination,
    );
    return structuredJson({
      data: items,
      meta: { organizationId, customerId, ownerUid, status, pagination, total },
    });
  },
});