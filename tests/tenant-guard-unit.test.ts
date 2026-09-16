import { describe, it, expect } from 'vitest';
import { assertPayloadOrgMatchesAuth } from '@/lib/api-auth';
import type { V1Auth } from '@/lib/api-auth';
import { ApiError } from '@/lib/api-errors';

function authFor(orgId: string): V1Auth & { organizationId: string } {
  return {
    method: 'api_key',
    keyId: 'key_foo',
    organizationId: orgId,
    scopes: ['customers:write'] as any,
    actorId: 'key:key_foo',
    env: 'sandbox',
  };
}

describe('G-05 payload org guard (AC-2 / TR-6.1)', () => {
  it('passes when payload organizationId matches auth org', () => {
    expect(() => assertPayloadOrgMatchesAuth(authFor('orgA'), { organizationId: 'orgA' })).not.toThrow();
  });
  it('throws TENANT_MISMATCH when payload organizationId mismatches auth org', () => {
    try {
      assertPayloadOrgMatchesAuth(authFor('orgA'), { organizationId: 'orgB' });
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('TENANT_MISMATCH');
    }
  });
  it('handles nested entities and ignores undefined', () => {
    expect(() =>
      assertPayloadOrgMatchesAuth(authFor('orgA'), {
        customer: { organizationId: 'orgA' },
        legacyPlan: { organizationId: 'orgA' },
      }),
    ).not.toThrow();
    try {
      assertPayloadOrgMatchesAuth(authFor('orgA'), { beneficiary: { organizationId: 'orgC' } });
      expect(true).toBe(false);
    } catch (e) {
      expect((e as ApiError).code).toBe('TENANT_MISMATCH');
    }
  });
});
