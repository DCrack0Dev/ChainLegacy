import { v1Route, structuredJson } from '@/lib/v1-route';
import { queryOrgCollection } from '@/services/enterprise/v1-helpers';
import { VerificationSchema } from '@/types/enterprise';
import { IdentityVerificationStatus } from '@/types/enterprise';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Verification = z.infer<typeof VerificationSchema>;

export const GET = v1Route({
  method: 'GET',
  scope: 'customers:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    
    const filters: Array<[string, string, any]> = [];
    if (customerId) filters.push(['customerId', '==', customerId]);
    if (status && status !== 'all') filters.push(['verificationStatus', '==', status]);
    
    const { items, total } = await queryOrgCollection<Verification>(
      organizationId,
      'verifications',
      filters,
      pagination,
    );
    
    // Apply search filter in-memory for name/email search
    let filteredItems = items;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredItems = items.filter(v => 
        v.customerName?.toLowerCase().includes(searchLower) ||
        v.customerEmail?.toLowerCase().includes(searchLower)
      );
    }
    
    return structuredJson({
      data: filteredItems,
      meta: { organizationId, customerId, status, search, pagination, total: filteredItems.length },
    });
  },
});