import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError } from '@/lib/api-errors';
import {
  createVaultForCustomer,
  linkVaultToCustomer,
  getCustomerInOrg,
  getVaultInOrg,
  getLegacyPlanInOrg,
  setCustomerVerificationStatus,
  startIdentityVerification,
  completeIdentityVerificationFromProvider,
  assertCustomerIdentityLink,
  assertFirebaseUidNotReusedAsCustomerId,
  assertCustomerHasNoValidatedIdentity,
  assertVaultBelongsToCustomer,
  assertVaultLink,
  assertPlanRelationship,
  assertPlanVaultConsistency,
  assertChildSameOrganization,
  assertChildSameCustomer,
  assertVerificationTransitionAllowedByActor,
  assertIdentityVerifiedForClaim,
  assertOrganizationOwner,
  isLegalIdentityVerificationTransition,
  isCustomerIdentityVerified,
  DOMAIN_ERROR_CODES,
} from '@/services/enterprise/domain-model';
import { ID_PREFIXES } from '@/services/enterprise/persistence';
import {
  CustomerSchema,
  VaultSchema,
  VaultStatus,
  IdentityVerificationStatus,
} from '@/types/enterprise';

/* Minimal Firestore double: exercises the real transaction code path. */
const { mockState } = vi.hoisted(() => ({ mockState: { db: null as any } }));

vi.mock('@/lib/firebase-admin', () => ({
  get adminDb() {
    return mockState.db;
  },
  get adminAuth() {
    return null;
  },
  FieldValue: { serverTimestamp: () => new Date(0) },
}));

class FakeFirestore {
  docs = new Map<string, any>();
  writes = 0;

  private key(path: string, id: string) {
    return `${path}/${id}`;
  }

  collection(path: string) {
    const self = this;
    return {
      doc(id: string) {
        const ref: any = {
          path,
          id,
          async get() {
            const data = self.docs.get(self.key(path, id));
            return { exists: data !== undefined, id, data: () => data };
          },
        };
        // Support sub-collections (organizations/{org}/customers/{id}) so the
        // loaders under test walk the real Firestore path shape.
        ref.collection = (sub: string) => self.collection(`${path}/${id}/${sub}`);
        return ref;
      },
    };
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const self = this;
    const tx = {
      async get(ref: { path: string; id: string }) {
        const data = self.docs.get(self.key(ref.path, ref.id));
        return { exists: data !== undefined, id: ref.id, data: () => data };
      },
      set(ref: { path: string; id: string }, data: any) {
        self.docs.set(self.key(ref.path, ref.id), { ...data });
        self.writes += 1;
      },
      update(ref: { path: string; id: string }, patch: any) {
        const current = self.docs.get(self.key(ref.path, ref.id)) ?? {};
        self.docs.set(self.key(ref.path, ref.id), { ...current, ...patch });
        self.writes += 1;
      },
    };
    return fn(tx);
  }
}

const ORG = 'org_relationship_test';
const CUSTOMER_PATH = `organizations/${ORG}/customers`;
const VAULT_PATH = `organizations/${ORG}/vaults`;

let db: FakeFirestore;

function seedCustomer(overrides: Record<string, unknown> = {}) {
  db.docs.set(`${CUSTOMER_PATH}/cust_1`, {
    id: 'cust_1',
    organizationId: ORG,
    partnerCustomerId: 'partner-1',
    email: 'owner@example.com',
    fullName: 'Legacy Owner',
    firebaseUid: 'firebase_uid_1',
    vaultId: null,
    verificationStatus: IdentityVerificationStatus.NOT_STARTED,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

beforeEach(() => {
  db = new FakeFirestore();
  mockState.db = db;
});

/* Schema and canonical model shape */

describe('canonical domain model types', () => {
  it('Customer carries firebaseUid + vaultId + optional server-owned verificationStatus', () => {
    const parsed = CustomerSchema.parse({
      id: 'cust_1',
      organizationId: ORG,
      partnerCustomerId: 'partner-1',
      email: 'owner@example.com',
      fullName: 'Legacy Owner',
      firebaseUid: 'firebase_uid_1',
      vaultId: 'vlt_1',
      createdAt: 0,
      updatedAt: 0,
    });
    expect(parsed.firebaseUid).toBe('firebase_uid_1');
    expect(parsed.vaultId).toBe('vlt_1');
    // Never client-authored: the field is written by the server, so it stays undefined
    // until an explicit server write (or persists as `not_started` from the API).
    expect(parsed.verificationStatus).toBeUndefined();
    expect(
      CustomerSchema.parse({
        id: 'cust_1',
        organizationId: ORG,
        partnerCustomerId: 'partner-1',
        email: 'owner@example.com',
        fullName: 'Legacy Owner',
        verificationStatus: IdentityVerificationStatus.NOT_STARTED,
        createdAt: 0,
        updatedAt: 0,
      }).verificationStatus,
    ).toBe(IdentityVerificationStatus.NOT_STARTED);
  });

  it('Vault defaults to active status and a 30-day liveness interval', () => {
    const parsed = VaultSchema.parse({
      id: 'vlt_1',
      organizationId: ORG,
      customerId: 'cust_1',
      ownerUid: 'firebase_uid_1',
      createdAt: 0,
      updatedAt: 0,
    });
    expect(parsed.status).toBe(VaultStatus.ACTIVE);
    expect(parsed.intervalDays).toBe(30);
  });

  it('vault id prefix is registered for canonical ids', () => {
    expect(ID_PREFIXES.vault).toBe('vlt_');
  });
});

/* Firebase UID to Customer */

describe('Firebase UID -> Customer link', () => {
  it('rejects a customer without a Firebase UID link', () => {
    let caught: any;
    try {
      assertCustomerIdentityLink({ id: 'cust_1', organizationId: ORG, firebaseUid: null });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.statusCode).toBe(400);
    expect(caught.code).toBe(DOMAIN_ERROR_CODES.RELATIONSHIP_REQUIRED);
  });

  it('rejects a firebaseUid that is reused as the customer domain id', () => {
    expect(() =>
      assertCustomerIdentityLink({ id: 'uid_123', organizationId: ORG, firebaseUid: 'uid_123' }),
    ).toThrowError(/Customer is the domain identity/);
  });

  it('rejects a firebaseUid already linked to another customer in the organization', () => {
    let caught: any;
    try {
      assertCustomerHasNoValidatedIdentity(
        { id: 'cust_2', firebaseUid: 'firebase_uid_1' },
        [{ id: 'cust_1', firebaseUid: 'firebase_uid_1' }],
      );
    } catch (err) {
      caught = err;
    }
    expect(caught.code).toBe(DOMAIN_ERROR_CODES.DUPLICATE_VALIDATED_IDENTITY);
    expect(caught.statusCode).toBe(409);
  });

  it('never allows a Firebase UID as the Customer document id', () => {
    expect(() => assertFirebaseUidNotReusedAsCustomerId('uid_123', [{ id: 'uid_123' }])).toThrowError(
      /must never be used as a Customer id/,
    );
    expect(() => assertFirebaseUidNotReusedAsCustomerId('uid_123', [{ id: 'cust_1' }])).not.toThrow();
  });
});
/* Customer <-> Vault 1:1 */

describe('Customer <-> Vault linkage', () => {
  it('createVaultForCustomer writes the vault and back-links customer.vaultId transactionally', async () => {
    seedCustomer();
    const result = await createVaultForCustomer(ORG, 'cust_1', { name: 'Primary legacy' });

    expect(result.created).toBe(true);
    expect(result.vault.id.startsWith(ID_PREFIXES.vault)).toBe(true);
    expect(result.vault.customerId).toBe('cust_1');
    expect(result.vault.organizationId).toBe(ORG);
    expect(result.vault.ownerUid).toBe('firebase_uid_1');
    expect(result.vault.status).toBe(VaultStatus.ACTIVE);

    const storedCustomer = db.docs.get(`${CUSTOMER_PATH}/cust_1`);
    const storedVault = db.docs.get(`${VAULT_PATH}/${result.vault.id}`);
    expect(storedCustomer.vaultId).toBe(result.vault.id);
    expect(storedVault.customerId).toBe('cust_1');
    expect(db.writes).toBe(2);
  });

  it('is idempotent: a second call returns the existing vault without a new write', async () => {
    seedCustomer();
    const first = await createVaultForCustomer(ORG, 'cust_1');
    const writesAfterFirst = db.writes;
    const second = await createVaultForCustomer(ORG, 'cust_1');

    expect(second.created).toBe(false);
    expect(second.vault.id).toBe(first.vault.id);
    expect(db.writes).toBe(writesAfterFirst);
  });

  it('throws 404 when the customer does not exist in the organization', async () => {
    let caught: any;
    try {
      await createVaultForCustomer(ORG, 'cust_missing');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.statusCode).toBe(404);
    expect(caught.code).toBe('RELATED_RESOURCE_NOT_FOUND');
  });

  it('detects a dangling customer.vaultId instead of silently creating a second vault', async () => {
    seedCustomer({ vaultId: 'vlt_ghost' });
    let caught: any;
    try {
      await createVaultForCustomer(ORG, 'cust_1');
    } catch (err) {
      caught = err;
    }
    expect(caught.statusCode).toBe(409);
    expect(caught.code).toBe(DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT);
  });

  it('linkVaultToCustomer wires an existing vault and refuses to repoint a linked customer', async () => {
    seedCustomer();
    db.docs.set(`${VAULT_PATH}/vlt_manual`, {
      id: 'vlt_manual',
      organizationId: ORG,
      customerId: 'cust_1',
      ownerUid: 'firebase_uid_1',
      status: VaultStatus.ACTIVE,
    });

    const linked = await linkVaultToCustomer(ORG, 'cust_1', 'vlt_manual');
    expect(linked.customer.vaultId).toBe('vlt_manual');
    expect(db.docs.get(`${CUSTOMER_PATH}/cust_1`).vaultId).toBe('vlt_manual');

    db.docs.set(`${VAULT_PATH}/vlt_other`, {
      id: 'vlt_other',
      organizationId: ORG,
      customerId: 'cust_1',
      ownerUid: 'firebase_uid_1',
      status: VaultStatus.ACTIVE,
    });
    await expect(linkVaultToCustomer(ORG, 'cust_1', 'vlt_other')).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.DUPLICATE_VAULT,
      statusCode: 409,
    });
  });

  it('refuses a vault that belongs to a different tenant or customer', () => {
    seedCustomer();
    expect(() =>
      assertVaultBelongsToCustomer(
        { id: 'vlt_x', organizationId: 'org_other', customerId: 'cust_1' },
        { id: 'cust_1', organizationId: ORG },
      ),
    ).toThrowError(/different organizations/);

    expect(() =>
      assertVaultBelongsToCustomer(
        { id: 'vlt_x', organizationId: ORG, customerId: 'cust_other' },
        { id: 'cust_1', organizationId: ORG },
      ),
    ).toThrowError(/not linked to the supplied customer/);
  });

  it('assertVaultLink requires both directions of the link', () => {
    const vault = { id: 'vlt_1', organizationId: ORG, customerId: 'cust_1' };
    expect(() =>
      assertVaultLink({ id: 'cust_1', organizationId: ORG, vaultId: 'vlt_1' }, vault),
    ).not.toThrow();
    expect(() =>
      assertVaultLink({ id: 'cust_1', organizationId: ORG, vaultId: null }, vault),
    ).toThrowError(/vaultId mismatch/);
  });
});
/* Vault -> Legacy Plan */

describe('Vault -> Legacy Plan relationship', () => {
  const customer = { id: 'cust_1', organizationId: ORG };
  const vault = { id: 'vlt_1', organizationId: ORG, customerId: 'cust_1' };

  it('accepts a plan that references its own customer vault', () => {
    expect(() =>
      assertPlanRelationship(
        { id: 'plan_1', organizationId: ORG, customerId: 'cust_1', vaultId: 'vlt_1' },
        customer,
        vault,
      ),
    ).not.toThrow();
  });

  it('rejects a plan pointing at another customer vault', () => {
    expect(() =>
      assertPlanRelationship(
        { id: 'plan_1', organizationId: ORG, customerId: 'cust_1', vaultId: 'vlt_other' },
        customer,
        { id: 'vlt_other', organizationId: ORG, customerId: 'cust_other' },
      ),
    ).toThrowError(/vault belongs to a different customer/);
  });

  it('rejects cross-tenant plans before any vault lookup', () => {
    let caught: any;
    try {
      assertPlanRelationship(
        { id: 'plan_1', organizationId: 'org_other', customerId: 'cust_1', vaultId: 'vlt_1' },
        customer,
        vault,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught.code).toBe(DOMAIN_ERROR_CODES.RELATED_RESOURCE_WRONG_TENANT);
    expect(caught.statusCode).toBe(403);
  });

  it('rejects a plan for a different customer even when the vault matches', () => {
    expect(() =>
      assertPlanRelationship(
        { id: 'plan_1', organizationId: ORG, customerId: 'cust_2', vaultId: 'vlt_1' },
        customer,
        vault,
      ),
    ).toThrowError(/not linked to the supplied customer/);
  });

  it('requires vaultId on the plan so the canonical chain is never broken', () => {
    expect(() =>
      assertPlanVaultConsistency({ id: 'plan_1', customerId: 'cust_1', vaultId: null }),
    ).toThrowError(/must reference a vault/);
    expect(() =>
      assertPlanVaultConsistency({ id: 'plan_1', customerId: 'cust_1', vaultId: 'vlt_1' }),
    ).not.toThrow();
  });

  it('loaders scope every read to the organization', async () => {
    seedCustomer();
    db.docs.set(`${VAULT_PATH}/vlt_1`, { id: 'vlt_1', organizationId: ORG, customerId: 'cust_1' });
    db.docs.set(`organizations/${ORG}/legacyPlans/plan_1`, {
      id: 'plan_1',
      organizationId: ORG,
      customerId: 'cust_1',
      vaultId: 'vlt_1',
    });

    await expect(getCustomerInOrg(ORG, 'cust_1')).resolves.toMatchObject({ id: 'cust_1' });
    await expect(getVaultInOrg(ORG, 'vlt_1')).resolves.toMatchObject({ customerId: 'cust_1' });
    await expect(getLegacyPlanInOrg(ORG, 'plan_1')).resolves.toMatchObject({ vaultId: 'vlt_1' });

    await expect(getCustomerInOrg('org_other', 'cust_1')).rejects.toMatchObject({ statusCode: 404 });
    await expect(getVaultInOrg('org_other', 'vlt_1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* Beneficiaries and guardians */

describe('children of the canonical chain', () => {
  it('rejects cross-tenant beneficiaries and guardians', () => {
    expect(() =>
      assertChildSameOrganization(
        { id: 'ben_1', organizationId: 'org_other' },
        { id: 'cust_1', organizationId: ORG },
        'Beneficiary',
      ),
    ).toThrowError(/Beneficiary belongs to another organization/);
    expect(() =>
      assertChildSameOrganization(
        { id: 'guard_1', organizationId: ORG },
        { id: 'cust_1', organizationId: ORG },
        'Guardian',
      ),
    ).not.toThrow();
  });

  it('requires beneficiaries to reference the same customer', () => {
    expect(() =>
      assertChildSameCustomer({ id: 'ben_1', customerId: 'cust_9' }, { id: 'cust_1' }, 'Beneficiary'),
    ).toThrowError(/must reference the same customer/);
    expect(() =>
      assertChildSameCustomer({ id: 'ben_1', customerId: 'cust_1' }, { id: 'cust_1' }, 'Beneficiary'),
    ).not.toThrow();
  });
});
/* Server-owned verification status */

describe('server-owned identity verification', () => {
  it('allows provider outcomes only through legal transitions', () => {
    expect(
      isLegalIdentityVerificationTransition(
        IdentityVerificationStatus.NOT_STARTED,
        IdentityVerificationStatus.PENDING,
      ),
    ).toBe(true);
    expect(
      isLegalIdentityVerificationTransition(
        IdentityVerificationStatus.NOT_STARTED,
        IdentityVerificationStatus.VERIFIED,
      ),
    ).toBe(false);
    expect(
      isLegalIdentityVerificationTransition(
        IdentityVerificationStatus.PENDING,
        IdentityVerificationStatus.VERIFIED,
      ),
    ).toBe(true);
  });

  it('blocks the browser from marking an identity verified', () => {
    let caught: any;
    try {
      assertVerificationTransitionAllowedByActor(
        IdentityVerificationStatus.PENDING,
        IdentityVerificationStatus.VERIFIED,
        'client',
      );
    } catch (err) {
      caught = err;
    }
    expect(caught.statusCode).toBe(403);
    expect(caught.code).toBe(DOMAIN_ERROR_CODES.VERIFICATION_TRANSITION_ILLEGAL);

    expect(() =>
      assertVerificationTransitionAllowedByActor(
        IdentityVerificationStatus.NOT_STARTED,
        IdentityVerificationStatus.PENDING,
        'client',
      ),
    ).not.toThrow();
  });

  it('rejects illegal provider jumps even for the server', () => {
    expect(() =>
      assertVerificationTransitionAllowedByActor(
        IdentityVerificationStatus.NOT_STARTED,
        IdentityVerificationStatus.VERIFIED,
        'server',
      ),
    ).toThrowError(/Illegal identity verification transition/);
  });

  it('setCustomerVerificationStatus persists server-owned outcomes', async () => {
    seedCustomer();
    const pending = await setCustomerVerificationStatus(
      ORG,
      'cust_1',
      IdentityVerificationStatus.PENDING,
      { actor: 'client' },
    );
    expect(pending.verificationStatus).toBe(IdentityVerificationStatus.PENDING);
    expect(db.docs.get(`${CUSTOMER_PATH}/cust_1`).verificationStatus).toBe(IdentityVerificationStatus.PENDING);

    const verified = await setCustomerVerificationStatus(
      ORG,
      'cust_1',
      IdentityVerificationStatus.VERIFIED,
      { actor: 'server', reason: 'mock-provider:approved' },
    );
    expect(isCustomerIdentityVerified(verified)).toBe(true);
    expect(db.docs.get(`${CUSTOMER_PATH}/cust_1`).verificationStatus).toBe(IdentityVerificationStatus.VERIFIED);
  });

  it('refuses to let a client session force a verified status in Firestore', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.PENDING });
    await expect(
      setCustomerVerificationStatus(ORG, 'cust_1', IdentityVerificationStatus.VERIFIED, { actor: 'client' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.docs.get(`${CUSTOMER_PATH}/cust_1`).verificationStatus).toBe(IdentityVerificationStatus.PENDING);
  });

  it('gates claim authorization on a server-verified identity', () => {
    expect(() =>
      assertIdentityVerifiedForClaim({ id: 'cust_1', verificationStatus: IdentityVerificationStatus.NOT_STARTED }),
    ).toThrowError(/requires a server-verified customer identity/);
    expect(() =>
      assertIdentityVerifiedForClaim({ id: 'cust_1', verificationStatus: IdentityVerificationStatus.VERIFIED }),
    ).not.toThrow();
  });

  it('only the organization owner Firebase UID may act as the domain root', () => {
    expect(() => assertOrganizationOwner({ id: ORG, ownerUid: 'firebase_uid_1' }, 'firebase_uid_1')).not.toThrow();
    expect(() => assertOrganizationOwner({ id: ORG, ownerUid: 'firebase_uid_1' }, 'someone_else')).toThrowError(
      /does not own this organization/,
    );
  });
});

/* Identity Verification Provider Integration (Phase 2) */

describe('identity verification provider integration', () => {
  beforeEach(async () => {
    const { resetMockIdentityProvider } = await import('@/services/enterprise/identity-verification');
    resetMockIdentityProvider();
  });

  it('startIdentityVerification moves customer to PENDING and returns verificationId', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.NOT_STARTED });
    const result = await startIdentityVerification(ORG, 'cust_1');

    expect(result.status).toBe(IdentityVerificationStatus.PENDING);
    expect(result.verificationId).toMatch(/^ver_mock_/);
    expect(result.provider).toBe('mock');

    const customer = db.docs.get(`${CUSTOMER_PATH}/cust_1`);
    expect(customer.verificationStatus).toBe(IdentityVerificationStatus.PENDING);
  });

  it('startIdentityVerification rejects if customer has no firebaseUid', async () => {
    seedCustomer({ firebaseUid: null, verificationStatus: IdentityVerificationStatus.NOT_STARTED });
    await expect(startIdentityVerification(ORG, 'cust_1')).rejects.toMatchObject({
      statusCode: 400,
      code: DOMAIN_ERROR_CODES.RELATIONSHIP_REQUIRED,
    });
  });

  it('startIdentityVerification rejects if already VERIFIED', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.VERIFIED });
    await expect(startIdentityVerification(ORG, 'cust_1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALREADY_VERIFIED',
    });
  });

  it('startIdentityVerification rejects if already PENDING', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.PENDING });
    await expect(startIdentityVerification(ORG, 'cust_1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'VERIFICATION_IN_PROGRESS',
    });
  });

  it('completeIdentityVerificationFromProvider moves customer to VERIFIED on provider approval', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.NOT_STARTED });
    const startResult = await startIdentityVerification(ORG, 'cust_1');

    const customer = await completeIdentityVerificationFromProvider(ORG, 'cust_1', startResult.verificationId);

    expect(customer.verificationStatus).toBe(IdentityVerificationStatus.VERIFIED);
    expect(isCustomerIdentityVerified(customer)).toBe(true);
  });

  it('completeIdentityVerificationFromProvider moves customer to REJECTED on provider rejection', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.NOT_STARTED });
    const startResult = await startIdentityVerification(ORG, 'cust_1');

    const provider = (await import('@/services/enterprise/identity-verification')).getMockIdentityProvider();
    await provider.simulateProviderOutcome(startResult.verificationId, IdentityVerificationStatus.REJECTED, 'invalid docs');

    const customer = await completeIdentityVerificationFromProvider(ORG, 'cust_1', startResult.verificationId);

    expect(customer.verificationStatus).toBe(IdentityVerificationStatus.REJECTED);
  });

  it('completeIdentityVerificationFromProvider rejects incomplete provider status', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.NOT_STARTED });
    const startResult = await startIdentityVerification(ORG, 'cust_1');

    await expect(
      completeIdentityVerificationFromProvider(ORG, 'cust_1', 'ver_mock_unknown')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('fails closed with DB_UNAVAILABLE when Firestore admin is not initialized', async () => {
    mockState.db = null;
    await expect(startIdentityVerification(ORG, 'cust_1')).rejects.toMatchObject({
      code: 'DB_UNAVAILABLE',
      statusCode: 500,
    });
    await expect(completeIdentityVerificationFromProvider(ORG, 'cust_1', 'ver_1')).rejects.toMatchObject({
      code: 'DB_UNAVAILABLE',
      statusCode: 500,
    });
  });
});

/* Persistence availability */

describe('persistence availability guards', () => {
  beforeEach(() => {
    mockState.db = null;
  });

  it('fails closed with DB_UNAVAILABLE when Firestore admin is not initialized', async () => {
    await expect(getCustomerInOrg(ORG, 'cust_1')).rejects.toMatchObject({
      code: 'DB_UNAVAILABLE',
      statusCode: 500,
    });
    await expect(createVaultForCustomer(ORG, 'cust_1')).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
  });
});