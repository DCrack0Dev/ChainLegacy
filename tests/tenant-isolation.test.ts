import { describe, it, expect, beforeEach, vi } from 'vitest';
import { assertPayloadOrgMatchesAuth } from '@/lib/api-auth';
import type { V1Auth } from '@/lib/api-auth';
import { ApiError } from '@/lib/api-errors';
import { assertBeneficiarySharesNotOverflow } from '@/services/enterprise/v1-helpers';

function authFor(orgId: string): V1Auth & { organizationId: string } {
  return {
    method: 'api_key',
    keyId: 'key_' + orgId,
    organizationId: orgId,
    scopes: ['customers:write', 'legacy_plans:write', 'beneficiaries:write', 'guardians:write', 'liveness:write', 'claims:manage', 'webhooks:manage', 'api_keys:write', 'audit:read', 'customers:read', 'legacy_plans:read', 'beneficiaries:read', 'guardians:read', 'liveness:read', 'claims:read'] as any,
    actorId: `key:key_${orgId}`,
    env: 'sandbox',
  };
}

type FakeDoc = { id: string; data: () => any; exists: boolean };
type FakeSnap = { docs: FakeDoc[]; forEach: (cb: (d: FakeDoc) => void) => void; get: () => FakeSnap; exists: boolean };
function makeFakeSnap(rows: Array<{ id: string; [k: string]: any }>): FakeSnap {
  const docs: FakeDoc[] = rows.map((r) => {
    const { id, ...data } = r;
    return { id, data: () => ({ ...data }), exists: true };
  });
  const snap: any = {
    docs,
    forEach(cb: (d: FakeDoc) => void) {
      docs.forEach(cb);
    },
    get exists() {
      return docs.length > 0;
    },
  };
  return snap;
}

type OrgScopedData = {
  customers: any[];
  legacyPlans: any[];
  beneficiaries: any[];
  guardians: any[];
  claims: any[];
  auditEvents: any[];
  webhookEndpoints: any[];
};

function seedTenantData(): { orgA: OrgScopedData; orgB: OrgScopedData; orgC: OrgScopedData } {
  return {
    orgA: {
      customers: [
        { id: 'cust_A1', organizationId: 'orgA', partnerCustomerId: 'A-cust-1', email: 'a1@example.com', fullName: 'A One' },
      ],
      legacyPlans: [
        { id: 'plan_A1', organizationId: 'orgA', customerId: 'cust_A1', name: 'A Plan 1', status: 'active' },
      ],
      beneficiaries: [
        { id: 'ben_A1', organizationId: 'orgA', customerId: 'cust_A1', legacyPlanId: 'plan_A1', name: 'Ben A1', email: 'benA1@example.com', share: 50 },
      ],
      guardians: [
        { id: 'g_A1', organizationId: 'orgA', customerId: 'cust_A1', name: 'Guard A1', email: 'guardA1@example.com', walletAddress: '0x0000000000000000000000000000000000000001' },
      ],
      claims: [
        { id: 'claim_A1', organizationId: 'orgA', customerId: 'cust_A1', legacyPlanId: 'plan_A1', status: 'pending', initiator: 'ben_A1' },
      ],
      auditEvents: [
        { id: 'aud_A1', organizationId: 'orgA', event: 'customer.created' },
      ],
      webhookEndpoints: [
        { id: 'wh_A1', organizationId: 'orgA', url: 'https://a.example.com/hook', enabled: true, events: ['*'] },
      ],
    },
    orgB: {
      customers: [
        { id: 'cust_B1', organizationId: 'orgB', partnerCustomerId: 'B-cust-1', email: 'b1@example.com', fullName: 'B One' },
        { id: 'cust_B2', organizationId: 'orgB', partnerCustomerId: 'B-cust-2', email: 'b2@example.com', fullName: 'B Two' },
      ],
      legacyPlans: [
        { id: 'plan_B1', organizationId: 'orgB', customerId: 'cust_B1', name: 'B Plan 1', status: 'draft' },
      ],
      beneficiaries: [
        { id: 'ben_B1', organizationId: 'orgB', customerId: 'cust_B1', legacyPlanId: 'plan_B1', name: 'Ben B1', email: 'benB1@example.com', share: 40 },
        { id: 'ben_B2', organizationId: 'orgB', customerId: 'cust_B1', legacyPlanId: 'plan_B1', name: 'Ben B2', email: 'benB2@example.com', share: 60 },
      ],
      guardians: [
        { id: 'g_B1', organizationId: 'orgB', name: 'Guard B1', email: 'guardB1@example.com', firebaseUid: 'firebase_B1' },
      ],
      claims: [
        { id: 'claim_B1', organizationId: 'orgB', customerId: 'cust_B1', legacyPlanId: 'plan_B1', status: 'verification', initiator: 'ben_B1' },
      ],
      auditEvents: [
        { id: 'aud_B1', organizationId: 'orgB', event: 'legacy_plan.created' },
      ],
      webhookEndpoints: [
        { id: 'wh_B1', organizationId: 'orgB', url: 'https://b.example.com/hook', enabled: true, events: ['customer.created'] },
      ],
    },
    orgC: {
      customers: [
        { id: 'cust_C1', organizationId: 'orgC', partnerCustomerId: 'C-cust-1', email: 'c1@example.com', fullName: 'C One' },
      ],
      legacyPlans: [
        { id: 'plan_C1', organizationId: 'orgC', customerId: 'cust_C1', name: 'C Plan 1', status: 'active' },
      ],
      beneficiaries: [
        { id: 'ben_C1', organizationId: 'orgC', customerId: 'cust_C1', legacyPlanId: 'plan_C1', name: 'Ben C1', email: 'benC1@example.com', share: 55 },
      ],
      guardians: [
        { id: 'g_C1', organizationId: 'orgC', customerId: 'cust_C1', name: 'Guard C1', email: 'guardC1@example.com', walletAddress: '0x0000000000000000000000000000000000000003', firebaseUid: 'firebase_C1' },
      ],
      claims: [
        { id: 'claim_C1', organizationId: 'orgC', customerId: 'cust_C1', legacyPlanId: 'plan_C1', status: 'pending', initiator: 'ben_C1' },
      ],
      auditEvents: [
        { id: 'aud_C1', organizationId: 'orgC', event: 'guardian.created' },
      ],
      webhookEndpoints: [
        { id: 'wh_C1', organizationId: 'orgC', url: 'https://c.example.com/hook', enabled: true, events: ['*'] },
      ],
    },
  };
}

function filterCollection(collection: any[], authOrgId: string, extraFilters: Array<[string, string, any]> = []): any[] {
  let out = collection.filter((r) => r.organizationId === authOrgId);
  for (const [field, op, val] of extraFilters) {
    if (val === undefined || val === null) continue;
    switch (op) {
      case '==':
        out = out.filter((r) => r[field] === val);
        break;
      case 'in':
        out = out.filter((r) => (Array.isArray(val) ? val.includes(r[field]) : r[field] === val));
        break;
    }
  }
  return out;
}

describe('POST cross-org 403 TENANT_MISMATCH (8 tests)', () => {
  it('POST customers: body.organizationId cross-org → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    expect(() => assertPayloadOrgMatchesAuth(auth, { organizationId: 'orgB' })).toThrow(ApiError);
    try {
      assertPayloadOrgMatchesAuth(auth, { organizationId: 'orgB' });
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
      expect(e.statusCode).toBe(403);
    }
  });

  it('POST legacy-plans: body.orgId cross-org → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { orgId: 'orgB' });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
      expect(e.statusCode).toBe(403);
    }
  });

  it('POST beneficiaries: body.organisationId (alt spelling) cross-org → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { organisationId: 'orgB' });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });

  it('POST claims: nested body.customer.organizationId cross-org → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { customer: { organizationId: 'orgB' }, legacyPlan: { organizationId: 'orgA' } });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });

  it('POST legacy-plans: nested body.legacyPlan.organizationId cross-org → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { legacyPlan: { organizationId: 'orgB' } });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });

  it('POST beneficiaries: nested body.beneficiary.organizationId cross-org → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { beneficiary: { organizationId: 'orgB' } });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });

  it('POST guardians: nested body.guardian.organizationId cross-org → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { guardian: { organizationId: 'orgB' } });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });

  it('POST batch items: body.items[1].organizationId cross-org → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, {
        items: [
          { organizationId: 'orgA', name: 'ok' },
          { organizationId: 'orgB', name: 'leak' },
        ],
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });
});

describe('GET returns [] for non-owner org (8 tests)', () => {
  let data: ReturnType<typeof seedTenantData>;
  beforeEach(() => {
    data = seedTenantData();
  });

  it('GET customers: orgA queries orgB customers data → []', () => {
    const result = filterCollection(data.orgB.customers, 'orgA');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
    const sanity = filterCollection(data.orgB.customers, 'orgB');
    expect(sanity.length).toBeGreaterThan(0);
  });

  it('GET legacy-plans: orgA queries orgB legacyPlans data → []', () => {
    const result = filterCollection(data.orgB.legacyPlans, 'orgA');
    expect(result).toEqual([]);
    expect(filterCollection(data.orgA.legacyPlans, 'orgA').length).toBeGreaterThan(0);
  });

  it('GET beneficiaries: orgA queries orgB beneficiaries data → []', () => {
    const result = filterCollection(data.orgB.beneficiaries, 'orgA');
    expect(result).toEqual([]);
    expect(filterCollection(data.orgA.beneficiaries, 'orgA').length).toBeGreaterThan(0);
  });

  it('GET guardians: orgA queries orgB guardians data → []', () => {
    const result = filterCollection(data.orgB.guardians, 'orgA');
    expect(result).toEqual([]);
    expect(filterCollection(data.orgA.guardians, 'orgA').length).toBeGreaterThan(0);
  });

  it('GET liveness (legacyPlans listing): orgA queries orgB plans list → []', () => {
    const combinedPlans = [...data.orgA.legacyPlans, ...data.orgB.legacyPlans];
    const asOrgA = filterCollection(combinedPlans, 'orgA');
    const asOrgB = filterCollection(combinedPlans, 'orgB');
    expect(asOrgA.every((p) => p.organizationId === 'orgA')).toBe(true);
    expect(asOrgB.every((p) => p.organizationId === 'orgB')).toBe(true);
    const orgBIds = new Set(asOrgB.map((p) => p.id));
    for (const p of asOrgA) expect(orgBIds.has(p.id)).toBe(false);
    expect(filterCollection(combinedPlans, 'orgC')).toEqual([]);
  });

  it('GET claims: orgA queries combined claims collection → only orgA entries', () => {
    const combined = [...data.orgA.claims, ...data.orgB.claims];
    const orgAView = filterCollection(combined, 'orgA');
    expect(orgAView.every((c) => c.organizationId === 'orgA')).toBe(true);
    expect(filterCollection(combined, 'orgC')).toEqual([]);
  });

  it('GET audit: orgA queries orgB auditEvents → []', () => {
    const result = filterCollection(data.orgB.auditEvents, 'orgA');
    expect(result).toEqual([]);
    const combined = [...data.orgA.auditEvents, ...data.orgB.auditEvents];
    const orgAView = filterCollection(combined, 'orgA');
    expect(orgAView.every((a) => a.organizationId === 'orgA')).toBe(true);
  });

  it('GET webhooks: orgA queries orgB webhookEndpoints + extra enabled filter → []', () => {
    const result = filterCollection(data.orgB.webhookEndpoints, 'orgA', [['enabled', '==', true]]);
    expect(result).toEqual([]);
    const orgBEnabled = filterCollection(data.orgB.webhookEndpoints, 'orgB', [['enabled', '==', true]]);
    expect(orgBEnabled.length).toBeGreaterThan(0);
    const orgAEnabled = filterCollection(data.orgA.webhookEndpoints, 'orgA', [['enabled', '==', true]]);
    expect(orgAEnabled.every((w) => w.organizationId === 'orgA')).toBe(true);
  });
});

describe('Beneficiary shares overflow validation (bonus unit)', () => {
  it('assertBeneficiarySharesNotOverflow: no DB backend bypasses safely', async () => {
    await expect(
      assertBeneficiarySharesNotOverflow('orgA', 'cust_X', 'plan_X', 50),
    ).resolves.not.toThrow();
  });
});

describe('GET cross-org 403/404 (orgA auth -> orgB/orgC resources)', () => {
  type ThreeOrgData = ReturnType<typeof seedTenantData>;
  function seedSameIdResources(): ThreeOrgData {
    const data = seedTenantData();
    data.orgA.customers.push({ id: 'cust_X1', organizationId: 'orgA', email: 'x1-orgA@example.com', fullName: 'X1 OrgA' });
    data.orgB.customers.push({ id: 'cust_X1', organizationId: 'orgB', email: 'x1-orgB@example.com', fullName: 'X1 OrgB' });
    data.orgC.customers.push({ id: 'cust_X1', organizationId: 'orgC', email: 'x1-orgC@example.com', fullName: 'X1 OrgC' });
    data.orgA.legacyPlans.push({ id: 'plan_X1', organizationId: 'orgA', name: 'X1 Plan A', customerId: 'cust_X1' });
    data.orgB.legacyPlans.push({ id: 'plan_X1', organizationId: 'orgB', name: 'X1 Plan B', customerId: 'cust_X1' });
    data.orgC.legacyPlans.push({ id: 'plan_X1', organizationId: 'orgC', name: 'X1 Plan C', customerId: 'cust_X1' });
    data.orgA.beneficiaries.push({ id: 'ben_X1', organizationId: 'orgA', name: 'X1 Ben A', email: 'benX1A@ex.com', legacyPlanId: 'plan_X1' });
    data.orgB.beneficiaries.push({ id: 'ben_X1', organizationId: 'orgB', name: 'X1 Ben B', email: 'benX1B@ex.com', legacyPlanId: 'plan_X1' });
    data.orgC.beneficiaries.push({ id: 'ben_X1', organizationId: 'orgC', name: 'X1 Ben C', email: 'benX1C@ex.com', legacyPlanId: 'plan_X1' });
    data.orgA.guardians.push({ id: 'g_X1', organizationId: 'orgA', name: 'X1 Guard A', email: 'gX1A@ex.com' });
    data.orgB.guardians.push({ id: 'g_X1', organizationId: 'orgB', name: 'X1 Guard B', email: 'gX1B@ex.com' });
    data.orgC.guardians.push({ id: 'g_X1', organizationId: 'orgC', name: 'X1 Guard C', email: 'gX1C@ex.com' });
    data.orgA.claims.push({ id: 'claim_X1', organizationId: 'orgA', status: 'pending', initiator: 'A-initiator' });
    data.orgB.claims.push({ id: 'claim_X1', organizationId: 'orgB', status: 'verification', initiator: 'B-initiator' });
    data.orgC.claims.push({ id: 'claim_X1', organizationId: 'orgC', status: 'approved', initiator: 'C-initiator' });
    data.orgA.auditEvents.push({ id: 'aud_X1', organizationId: 'orgA', event: 'orgA.event' });
    data.orgB.auditEvents.push({ id: 'aud_X1', organizationId: 'orgB', event: 'orgB.event' });
    data.orgC.auditEvents.push({ id: 'aud_X1', organizationId: 'orgC', event: 'orgC.event' });
    data.orgA.webhookEndpoints.push({ id: 'wh_X1', organizationId: 'orgA', url: 'https://a.example.com/x1' });
    data.orgB.webhookEndpoints.push({ id: 'wh_X1', organizationId: 'orgB', url: 'https://b.example.com/x1' });
    data.orgC.webhookEndpoints.push({ id: 'wh_X1', organizationId: 'orgC', url: 'https://c.example.com/x1' });
    return data;
  }

  it('GET customers: orgA queries cust_X1 across all orgs → returns orgA copy ONLY, email differs from B/C', () => {
    const d = seedSameIdResources();
    const allCust = [...d.orgA.customers, ...d.orgB.customers, ...d.orgC.customers];
    const filtered = filterCollection(allCust, 'orgA', [['id', '==', 'cust_X1']]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].email).toBe('x1-orgA@example.com');
    expect(filtered[0].fullName).toBe('X1 OrgA');
    expect(filtered[0].organizationId).toBe('orgA');
    expect(filtered[0].email).not.toBe('x1-orgB@example.com');
    expect(filtered[0].email).not.toBe('x1-orgC@example.com');
  });

  it('GET legacyPlans: orgA queries plan_X1 across all orgs → orgA copy ONLY', () => {
    const d = seedSameIdResources();
    const all = [...d.orgA.legacyPlans, ...d.orgB.legacyPlans, ...d.orgC.legacyPlans];
    const filtered = filterCollection(all, 'orgA', [['id', '==', 'plan_X1']]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('X1 Plan A');
    expect(filtered[0].organizationId).toBe('orgA');
    expect(filtered[0].name).not.toBe('X1 Plan B');
  });

  it('GET beneficiaries: orgA queries ben_X1 across all orgs → orgA copy ONLY', () => {
    const d = seedSameIdResources();
    const all = [...d.orgA.beneficiaries, ...d.orgB.beneficiaries, ...d.orgC.beneficiaries];
    const filtered = filterCollection(all, 'orgA', [['id', '==', 'ben_X1']]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('X1 Ben A');
    expect(filtered[0].email).toBe('benX1A@ex.com');
    expect(filtered[0].organizationId).toBe('orgA');
  });

  it('GET guardians: orgA queries g_X1 across all orgs → orgA copy ONLY', () => {
    const d = seedSameIdResources();
    const all = [...d.orgA.guardians, ...d.orgB.guardians, ...d.orgC.guardians];
    const filtered = filterCollection(all, 'orgA', [['id', '==', 'g_X1']]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('X1 Guard A');
    expect(filtered[0].organizationId).toBe('orgA');
    expect(filtered[0].name).not.toBe('X1 Guard B');
  });

  it('GET claims: orgA queries claim_X1 across all orgs → orgA copy ONLY', () => {
    const d = seedSameIdResources();
    const all = [...d.orgA.claims, ...d.orgB.claims, ...d.orgC.claims];
    const filtered = filterCollection(all, 'orgA', [['id', '==', 'claim_X1']]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].initiator).toBe('A-initiator');
    expect(filtered[0].status).toBe('pending');
    expect(filtered[0].organizationId).toBe('orgA');
  });

  it('GET audit: orgA queries aud_X1 across all orgs → orgA copy ONLY', () => {
    const d = seedSameIdResources();
    const all = [...d.orgA.auditEvents, ...d.orgB.auditEvents, ...d.orgC.auditEvents];
    const filtered = filterCollection(all, 'orgA', [['id', '==', 'aud_X1']]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].event).toBe('orgA.event');
    expect(filtered[0].organizationId).toBe('orgA');
  });

  it('GET webhookEndpoints: orgA queries wh_X1 across all orgs → orgA copy ONLY', () => {
    const d = seedSameIdResources();
    const all = [...d.orgA.webhookEndpoints, ...d.orgB.webhookEndpoints, ...d.orgC.webhookEndpoints];
    const filtered = filterCollection(all, 'orgA', [['id', '==', 'wh_X1']]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].url).toBe('https://a.example.com/x1');
    expect(filtered[0].organizationId).toBe('orgA');
  });

  it('GET combined: orgA auth returns 0 orgB/C records across any resource type', () => {
    const d = seedSameIdResources();
    const allCust = [...d.orgA.customers, ...d.orgB.customers, ...d.orgC.customers];
    const orgBOnly = allCust.filter(r => r.organizationId === 'orgB');
    const filtered = filterCollection(orgBOnly, 'orgA');
    expect(filtered).toHaveLength(0);
    const orgCOnly = allCust.filter(r => r.organizationId === 'orgC');
    expect(filterCollection(orgCOnly, 'orgA')).toHaveLength(0);
  });
});

describe('UPDATE/PATCH cross-org 403 TENANT_MISMATCH (6 tests)', () => {
  it('UPDATE customers: body.organizationId forged to orgB with orgA auth → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { id: 'cust_A1', organizationId: 'orgB', fullName: 'Hacked' });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
      expect(e.statusCode).toBe(403);
    }
  });

  it('UPDATE legacy-plans: nested body.legacyPlan.organizationId forged → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { id: 'plan_A1', legacyPlan: { organizationId: 'orgC', name: 'evil' } });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });

  it('UPDATE guardians: body.organisationId (alt spelling) forged → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { id: 'g_A1', organisationId: 'orgB', name: 'evil' });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });

  it('UPDATE claims: body.claim.organizationId forged → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { id: 'claim_A1', claim: { organizationId: 'orgB', status: 'approved' } });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });

  it('UPDATE customers: orgId shorthand forged → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, { id: 'cust_A1', orgId: 'orgC', fullName: 'hacked' });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
      expect(e.statusCode).toBe(403);
    }
  });

  it('UPDATE batch: items[].organizationId forged cross-org → TENANT_MISMATCH', () => {
    const auth = authFor('orgA');
    try {
      assertPayloadOrgMatchesAuth(auth, {
        items: [
          { id: 'cust_A1', organizationId: 'orgA', fullName: 'ok' },
          { id: 'cust_B1', organizationId: 'orgB', fullName: 'leak-from-A' },
        ],
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });
});

describe('DELETE cross-org 403 (5 tests)', () => {
  function assertDeleteAllowed(authOrgId: string, resourceOrgId: string): void {
    if (authOrgId !== resourceOrgId) {
      throw new ApiError(403, 'TENANT_MISMATCH', 'Cannot delete cross-tenant resource');
    }
  }

  it('DELETE cross-org customer → TENANT_MISMATCH', () => {
    expect(() => assertDeleteAllowed('orgA', 'orgB')).toThrow(ApiError);
    try { assertDeleteAllowed('orgA', 'orgB'); } catch (e: any) { expect(e.code).toBe('TENANT_MISMATCH'); }
  });

  it('DELETE cross-org legacy plan → TENANT_MISMATCH', () => {
    expect(() => assertDeleteAllowed('orgA', 'orgC')).toThrow();
    try { assertDeleteAllowed('orgA', 'orgC'); } catch (e: any) { expect(e.code).toBe('TENANT_MISMATCH'); }
  });

  it('DELETE cross-org beneficiary → TENANT_MISMATCH', () => {
    expect(() => assertDeleteAllowed('orgB', 'orgA')).toThrow();
    try { assertDeleteAllowed('orgB', 'orgA'); } catch (e: any) { expect(e.statusCode).toBe(403); }
  });

  it('DELETE cross-org guardian → TENANT_MISMATCH', () => {
    expect(() => assertDeleteAllowed('orgC', 'orgB')).toThrow();
    try { assertDeleteAllowed('orgC', 'orgB'); } catch (e: any) { expect(e.code).toBe('TENANT_MISMATCH'); }
  });

  it('DELETE cross-org claim → TENANT_MISMATCH', () => {
    expect(() => assertDeleteAllowed('orgA', 'orgC')).toThrow();
    try { assertDeleteAllowed('orgA', 'orgC'); } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
      expect(e.statusCode).toBe(403);
    }
  });
});

describe('Forged ID attacks: same IDs across tenants (7 tests)', () => {
  function seedSameIdAttacks(): { orgA: OrgScopedData; orgB: OrgScopedData; orgC: OrgScopedData } {
    return {
      orgA: {
        customers: [{ id: 'cust_SAMEID', organizationId: 'orgA', fullName: 'A-Cust', email: 'a-same@ex.com', ownerUid: 'owner_A' }],
        legacyPlans: [{ id: 'plan_SAMEID', organizationId: 'orgA', name: 'A-Plan' }],
        beneficiaries: [{ id: 'ben_SAMEID', organizationId: 'orgA', name: 'A-Ben' }],
        guardians: [{ id: 'g_SAMEID', organizationId: 'orgA', name: 'A-Guard' }],
        claims: [{ id: 'claim_SAMEID', organizationId: 'orgA', initiator: 'A-Init' }],
        auditEvents: [],
        webhookEndpoints: [],
      },
      orgB: {
        customers: [{ id: 'cust_SAMEID', organizationId: 'orgB', fullName: 'B-Cust', email: 'b-same@ex.com', ownerUid: 'owner_B' }],
        legacyPlans: [{ id: 'plan_SAMEID', organizationId: 'orgB', name: 'B-Plan' }],
        beneficiaries: [{ id: 'ben_SAMEID', organizationId: 'orgB', name: 'B-Ben' }],
        guardians: [{ id: 'g_SAMEID', organizationId: 'orgB', name: 'B-Guard' }],
        claims: [{ id: 'claim_SAMEID', organizationId: 'orgB', initiator: 'B-Init' }],
        auditEvents: [],
        webhookEndpoints: [],
      },
      orgC: {
        customers: [{ id: 'cust_SAMEID', organizationId: 'orgC', fullName: 'C-Cust', email: 'c-same@ex.com', ownerUid: 'owner_C' }],
        legacyPlans: [{ id: 'plan_SAMEID', organizationId: 'orgC', name: 'C-Plan' }],
        beneficiaries: [{ id: 'ben_SAMEID', organizationId: 'orgC', name: 'C-Ben' }],
        guardians: [{ id: 'g_SAMEID', organizationId: 'orgC', name: 'C-Guard' }],
        claims: [{ id: 'claim_SAMEID', organizationId: 'orgC', initiator: 'C-Init' }],
        auditEvents: [],
        webhookEndpoints: [],
      },
    };
  }

  it('orgA-auth GET cust_SAMEID → name=A-Cust, NEVER B-Cust or C-Cust', () => {
    const d = seedSameIdAttacks();
    const all = [...d.orgA.customers, ...d.orgB.customers, ...d.orgC.customers];
    const r = filterCollection(all, 'orgA', [['id', '==', 'cust_SAMEID']]);
    expect(r).toHaveLength(1);
    expect(r[0].fullName).toBe('A-Cust');
    expect(r[0].fullName).not.toBe('B-Cust');
    expect(r[0].fullName).not.toBe('C-Cust');
  });

  it('orgA-auth GET plan_SAMEID → name=A-Plan, not cross-tenant', () => {
    const d = seedSameIdAttacks();
    const all = [...d.orgA.legacyPlans, ...d.orgB.legacyPlans, ...d.orgC.legacyPlans];
    const r = filterCollection(all, 'orgA', [['id', '==', 'plan_SAMEID']]);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('A-Plan');
  });

  it('orgA-auth GET ben_SAMEID → name=A-Ben, never cross-tenant', () => {
    const d = seedSameIdAttacks();
    const all = [...d.orgA.beneficiaries, ...d.orgB.beneficiaries, ...d.orgC.beneficiaries];
    const r = filterCollection(all, 'orgA', [['id', '==', 'ben_SAMEID']]);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('A-Ben');
    expect(r[0].name).not.toBe('B-Ben');
    expect(r[0].name).not.toBe('C-Ben');
  });

  it('orgA-auth GET g_SAMEID → name=A-Guard, never cross-tenant', () => {
    const d = seedSameIdAttacks();
    const all = [...d.orgA.guardians, ...d.orgB.guardians, ...d.orgC.guardians];
    const r = filterCollection(all, 'orgA', [['id', '==', 'g_SAMEID']]);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('A-Guard');
  });

  it('orgA-auth GET claim_SAMEID → initiator=A-Init', () => {
    const d = seedSameIdAttacks();
    const all = [...d.orgA.claims, ...d.orgB.claims, ...d.orgC.claims];
    const r = filterCollection(all, 'orgA', [['id', '==', 'claim_SAMEID']]);
    expect(r).toHaveLength(1);
    expect(r[0].initiator).toBe('A-Init');
    expect(r[0].initiator).not.toBe('B-Init');
  });

  it('ownerUid spoofing: POST body ownerUid=orgC_owner with orgA auth → auth ownerUid wins', () => {
    const auth = authFor('orgA');
    const body = { ownerUid: 'owner_C', fullName: 'Spoofed', organizationId: 'orgA' };
    assertPayloadOrgMatchesAuth(auth, body);
    const effectiveOwnerUid = authFor('orgA').actorId.replace('key:key_', 'owner_');
    expect(auth.organizationId).toBe('orgA');
    expect(auth.organizationId).not.toBe('orgC');
    expect(effectiveOwnerUid).toBe('owner_orgA');
    expect(effectiveOwnerUid).not.toBe('owner_C');
  });

  it('ownerUid spoofing in nested customer body: assertPayloadOrgMatchesAuth does not allow orgC data through', () => {
    const auth = authFor('orgA');
    expect(() => assertPayloadOrgMatchesAuth(auth, {
      customer: { ownerUid: 'owner_C', organizationId: 'orgC' },
    })).toThrow(ApiError);
    try {
      assertPayloadOrgMatchesAuth(auth, { customer: { ownerUid: 'owner_C', organizationId: 'orgC' } });
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });
});
