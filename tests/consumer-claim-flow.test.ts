import { describe, it, expect, beforeEach, vi } from 'vitest';
import { adminDb } from '@/lib/firebase-admin';
import { IdentityVerificationStatus } from '@/types/enterprise';
import { startIdentityVerification, completeIdentityVerificationFromProvider } from '@/services/enterprise/domain-model';
import { authorizeClaim, getNextRequiredAction, verifyOtpForClaim, transitionClaimToVerification } from '@/services/enterprise/claim-authorization';
import { getCustomerInOrg, getVaultInOrg } from '@/services/enterprise/domain-model';
import { ApiError } from '@/lib/api-errors';
import { getMockIdentityProvider, resetMockIdentityProvider } from '@/services/enterprise/identity-verification';

/* Minimal Firestore double: exercises the real transaction code path. */
const { mockState } = vi.hoisted(() => ({ mockState: { db: null as any } }));

vi.mock('@/lib/firebase-admin', () => ({
  get adminDb() {
    return mockState.db;
  },
  get adminAuth() {
    return null;
  },
  FieldValue: { serverTimestamp: () => new Date(0), delete: () => 'DELETE_SENTINEL' },
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

const ORG = 'org_legacy_migration';
const CUSTOMER_PATH = `organizations/${ORG}/customers`;
const VAULT_PATH = `organizations/${ORG}/vaults`;
const PLAN_PATH = `organizations/${ORG}/legacyPlans`;
const CLAIM_PATH = `organizations/${ORG}/claims`;
const BENEFICIARY_PATH = `organizations/${ORG}/beneficiaries`;

let db: FakeFirestore;

function seedCustomer(overrides: Record<string, unknown> = {}) {
  db.docs.set(`${CUSTOMER_PATH}/cust_1`, {
    id: 'cust_1',
    organizationId: ORG,
    partnerCustomerId: 'partner-1',
    email: 'owner@example.com',
    fullName: 'Legacy Owner',
    firebaseUid: 'firebase_uid_1',
    vaultId: 'vlt_1',
    verificationStatus: IdentityVerificationStatus.NOT_STARTED,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

function seedVault(overrides: Record<string, unknown> = {}) {
  db.docs.set(`${VAULT_PATH}/vlt_1`, {
    id: 'vlt_1',
    organizationId: ORG,
    customerId: 'cust_1',
    ownerUid: 'firebase_uid_1',
    name: 'Primary legacy',
    status: 'triggered',
    intervalDays: 30,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

function seedPlan(overrides: Record<string, unknown> = {}) {
  db.docs.set(`${PLAN_PATH}/plan_1`, {
    id: 'plan_1',
    organizationId: ORG,
    customerId: 'cust_1',
    vaultId: 'vlt_1',
    name: 'Legacy Plan',
    intervalDays: 30,
    guardianQuorum: 0,
    encryptionConfig: { algorithm: 'AES-256-GCM', kdf: 'argon2id', shamirThreshold: 0, shamirShares: 0 },
    walletSignatureRequired: false,
    status: 'active',
    suspicionScore: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

function seedClaim(overrides: Record<string, unknown> = {}) {
  db.docs.set(`${CLAIM_PATH}/claim_1`, {
    id: 'claim_1',
    organizationId: ORG,
    customerId: 'cust_1',
    legacyPlanId: 'plan_1',
    status: 'pending',
    initiator: 'beneficiary_1',
    guardianApprovals: {},
    transitions: [{ from: '', to: 'pending', at: new Date(), actor: 'beneficiary_1' }],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

function seedBeneficiary(overrides: Record<string, unknown> = {}) {
  db.docs.set(`${BENEFICIARY_PATH}/ben_1`, {
    id: 'ben_1',
    organizationId: ORG,
    customerId: 'cust_1',
    legacyPlanId: 'plan_1',
    name: 'Beneficiary One',
    email: 'beneficiary@example.com',
    phone: '+15551234567',
    walletAddress: '0x' + '11'.repeat(20),
    share: 100,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

beforeEach(() => {
  db = new FakeFirestore();
  mockState.db = db;
  resetMockIdentityProvider();
});

describe('Consumer Claim Flow Integration', () => {
  it('full flow: start verification -> OTP -> authorize -> release legacy material', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.NOT_STARTED });
    seedVault({ status: 'triggered' });
    seedPlan({ guardianQuorum: 0 });
    seedClaim();
    seedBeneficiary();

    // Step 1: Start identity verification
    const verResult = await startIdentityVerification(ORG, 'cust_1');
    expect(verResult.status).toBe(IdentityVerificationStatus.PENDING);

    // Step 2: Complete verification (mock provider auto-approves)
    const customer = await completeIdentityVerificationFromProvider(ORG, 'cust_1', verResult.verificationId);
    expect(customer.verificationStatus).toBe(IdentityVerificationStatus.VERIFIED);

    // Step 3: Get next action (should be identity_verification first to transition claim)
    const customerObj = await getCustomerInOrg(ORG, 'cust_1');
    const vault = await getVaultInOrg(ORG, 'vlt_1');
    const planSnap = db.docs.get(PLAN_PATH + '/plan_1');
    const claimSnap = db.docs.get(CLAIM_PATH + '/claim_1');
    
    const plan = { id: 'plan_1', ...planSnap };
    const claim = { id: 'claim_1', ...claimSnap };
    const context = { claim, plan, customer: customerObj, vault };

    let nextAction = await getNextRequiredAction(claim, plan, customerObj);
    expect(nextAction.action).toBe('identity_verification');

    // Transition claim to VERIFICATION
    const verifiedClaim = await transitionClaimToVerification(claim);
    const context2 = { ...context, claim: verifiedClaim };

    nextAction = await getNextRequiredAction(verifiedClaim, plan, customerObj);
    expect(nextAction.action).toBe('otp_verification');

    // Step 4: Issue and verify OTP
    db.docs.set(`${CUSTOMER_PATH}/cust_1`, {
      ...db.docs.get(`${CUSTOMER_PATH}/cust_1`),
      otp: '123456',
      otpCreatedAt: new Date().toISOString(),
    });

    const otpResult = await verifyOtpForClaim(verifiedClaim, '123456', '123456', new Date());
    expect(otpResult.verified).toBe(true);

    // Step 5: Authorize claim - advances one step at a time
    // First call: VERIFICATION -> GRACE_PERIOD (since quorum=0)
    let authResult = await authorizeClaim(context2, true, true);
    expect(authResult.claim.status).toBe('grace_period');
    expect(authResult.nextRequiredStep).toBe('grace_period');

    // Second call: GRACE_PERIOD -> APPROVED
    const updatedClaim = { ...authResult.claim };
    const context3 = { ...context2, claim: updatedClaim };
    authResult = await authorizeClaim(context3, true, true);
    expect(authResult.claim.status).toBe('approved');
    expect(authResult.nextRequiredStep).toBe('release');

    // Third call: APPROVED -> COMPLETED
    const updatedClaim2 = { ...authResult.claim };
    const context4 = { ...context2, claim: updatedClaim2 };
    authResult = await authorizeClaim(context4, true, true);
    expect(authResult.claim.status).toBe('completed');
    expect(authResult.authorized).toBe(true);
    expect(authResult.legacyMaterial).toBeDefined();
  });

  it('full flow with guardian quorum: start verification -> OTP -> guardian approval -> grace period -> authorize', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.NOT_STARTED });
    seedVault({ status: 'triggered' });
    seedPlan({ guardianQuorum: 2 });
    seedClaim();
    seedBeneficiary({ name: 'Guardian One', email: 'guardian1@example.com' });
    
    // Add second guardian
    db.docs.set(`${BENEFICIARY_PATH}/ben_2`, {
      id: 'ben_2',
      organizationId: ORG,
      customerId: 'cust_1',
      legacyPlanId: 'plan_1',
      name: 'Guardian Two',
      email: 'guardian2@example.com',
      phone: '+15551234568',
      walletAddress: '0x' + '22'.repeat(20),
      share: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    // Step 1: Start and complete identity verification
    const verResult = await startIdentityVerification(ORG, 'cust_1');
    const customer = await completeIdentityVerificationFromProvider(ORG, 'cust_1', verResult.verificationId);
    expect(customer.verificationStatus).toBe(IdentityVerificationStatus.VERIFIED);

    // Step 2: Get next action (should be identity_verification first to transition claim)
    const customerObj = await getCustomerInOrg(ORG, 'cust_1');
    const vault = await getVaultInOrg(ORG, 'vlt_1');
    const planSnap = db.docs.get(PLAN_PATH + '/plan_1');
    const claimSnap = db.docs.get(CLAIM_PATH + '/claim_1');
    
    const plan = { id: 'plan_1', ...planSnap };
    const claim = { id: 'claim_1', ...claimSnap };
    const context = { claim, plan, customer: customerObj, vault };

    let nextAction = await getNextRequiredAction(claim, plan, customerObj);
    expect(nextAction.action).toBe('identity_verification');

    // Transition claim to VERIFICATION
    const verifiedClaim = await transitionClaimToVerification(claim);
    const context2 = { ...context, claim: verifiedClaim };

    nextAction = await getNextRequiredAction(verifiedClaim, plan, customerObj);
    expect(nextAction.action).toBe('otp_verification');

    // Step 3: OTP verification
    db.docs.set(`${CUSTOMER_PATH}/cust_1`, {
      ...db.docs.get(`${CUSTOMER_PATH}/cust_1`),
      otp: '123456',
      otpCreatedAt: new Date().toISOString(),
    });

    const otpResult = await verifyOtpForClaim(verifiedClaim, '123456', '123456', new Date());
    expect(otpResult.verified).toBe(true);

    // Step 4: First guardian approval (not enough for quorum)
    // First call: VERIFICATION -> GUARDIAN_REVIEW (quorum not met, returns early)
    let authResult = await authorizeClaim(context2, true, false);
    expect(authResult.claim.status).toBe('verification'); // stays in VERIFICATION, needs guardian approval
    expect(authResult.nextRequiredStep).toBe('guardian_approval');

    // Add first guardian approval
    const updatedClaim = { ...authResult.claim, guardianApprovals: { 'ben_1': true } };
    const context3 = { ...context2, claim: updatedClaim };
    
    // Second call: still not enough for quorum
    authResult = await authorizeClaim(context3, true, false);
    expect(authResult.claim.status).toBe('verification');
    expect(authResult.nextRequiredStep).toBe('guardian_approval');

    // Step 5: Second guardian approval (meets quorum)
    const updatedClaim2 = { ...authResult.claim, guardianApprovals: { 'ben_1': true, 'ben_2': true } };
    const context4 = { ...context2, claim: updatedClaim2 };
    
    // Now quorum met: VERIFICATION -> GUARDIAN_REVIEW
    authResult = await authorizeClaim(context4, true, true);
    expect(authResult.claim.status).toBe('guardian_review');
    expect(authResult.nextRequiredStep).toBe('guardian_approval'); // quorum met, auto-advances next call

    // GUARDIAN_REVIEW -> GRACE_PERIOD (auto-advances since quorum met)
    const updatedClaim3 = { ...authResult.claim };
    const context5 = { ...context2, claim: updatedClaim3 };
    authResult = await authorizeClaim(context5, true, true);
    expect(authResult.claim.status).toBe('grace_period');
    expect(authResult.nextRequiredStep).toBe('grace_period');

    // Step 6: GRACE_PERIOD -> APPROVED
    const updatedClaim4 = { ...authResult.claim };
    const context6 = { ...context2, claim: updatedClaim4 };
    
    authResult = await authorizeClaim(context6, true, true);
    expect(authResult.claim.status).toBe('approved');
    expect(authResult.nextRequiredStep).toBe('release');

    // Step 7: APPROVED -> COMPLETED
    const updatedClaim5 = { ...authResult.claim };
    const context7 = { ...context2, claim: updatedClaim5 };
    
    authResult = await authorizeClaim(context7, true, true);
    expect(authResult.claim.status).toBe('completed');
    expect(authResult.authorized).toBe(true);
    expect(authResult.legacyMaterial).toBeDefined();
  });

  it('rejects claim if customer identity not verified', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.NOT_STARTED });
    seedVault({ status: 'triggered' });
    seedPlan();
    seedClaim();
    seedBeneficiary();

    const customerObj = await getCustomerInOrg(ORG, 'cust_1');
    const vault = await getVaultInOrg(ORG, 'vlt_1');
    const planSnap = db.docs.get(PLAN_PATH + '/plan_1');
    const claimSnap = db.docs.get(CLAIM_PATH + '/claim_1');
    
    const plan = { id: 'plan_1', ...planSnap };
    const claim = { id: 'claim_1', ...claimSnap };
    const context = { claim, plan, customer: customerObj, vault };

    const nextAction = await getNextRequiredAction(claim, plan, customerObj);
    expect(nextAction.action).toBe('identity_verification');
    
    // authorizeClaim should throw
    await expect(authorizeClaim(context, true, true)).rejects.toThrow();
  });

  it('rejects invalid OTP', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.VERIFIED });
    seedVault({ status: 'triggered' });
    seedPlan();
    seedClaim();
    seedBeneficiary();

    db.docs.set(`${CUSTOMER_PATH}/cust_1`, {
      ...db.docs.get(`${CUSTOMER_PATH}/cust_1`),
      otp: '123456',
      otpCreatedAt: new Date().toISOString(),
    });

    const claimSnap = db.docs.get(CLAIM_PATH + '/claim_1');
    const claim = { id: 'claim_1', ...claimSnap };
    
    const otpResult = await verifyOtpForClaim(claim, '654321', '123456', new Date());
    expect(otpResult.verified).toBe(false);
    expect(otpResult.error).toContain('Invalid');
  });

  it('rejects expired OTP', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.VERIFIED });
    seedVault({ status: 'triggered' });
    seedPlan();
    seedClaim();
    seedBeneficiary();

    const oldDate = new Date(Date.now() - 20 * 60 * 1000);
    db.docs.set(`${CUSTOMER_PATH}/cust_1`, {
      ...db.docs.get(`${CUSTOMER_PATH}/cust_1`),
      otp: '123456',
      otpCreatedAt: oldDate.toISOString(),
    });

    const claimSnap = db.docs.get(CLAIM_PATH + '/claim_1');
    const claim = { id: 'claim_1', ...claimSnap };
    
    const otpResult = await verifyOtpForClaim(claim, '123456', '123456', oldDate);
    expect(otpResult.verified).toBe(false);
    expect(otpResult.error).toContain('expired');
  });

  it('prevents legacy material release before authorization', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.VERIFIED });
    seedVault({ status: 'triggered' });
    seedPlan();
    seedClaim();
    seedBeneficiary();

    const customerObj = await getCustomerInOrg(ORG, 'cust_1');
    const vault = await getVaultInOrg(ORG, 'vlt_1');
    const planSnap = db.docs.get(PLAN_PATH + '/plan_1');
    const claimSnap = db.docs.get(CLAIM_PATH + '/claim_1');
    
    const plan = { id: 'plan_1', ...planSnap };
    const claim = { id: 'claim_1', ...claimSnap };
    const context = { claim, plan, customer: customerObj, vault };

    // Try to authorize without OTP
    const authResult = await authorizeClaim(context, false, true);
    expect(authResult.authorized).toBe(false);
    expect(authResult.legacyMaterial).toBeUndefined();
    expect(authResult.nextRequiredStep).toBe('otp_verification');
  });

  it('enforces server-owned verification status', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.NOT_STARTED });
    seedVault({ status: 'triggered' });
    seedPlan();
    seedClaim();
    seedBeneficiary();

    // Start identity verification (server action)
    const verResult = await startIdentityVerification(ORG, 'cust_1');
    
    // Customer should be in PENDING now
    const pendingCustomer = await getCustomerInOrg(ORG, 'cust_1');
    expect(pendingCustomer.verificationStatus).toBe(IdentityVerificationStatus.PENDING);
    
    // Complete from provider (server)
    const verifiedCustomer = await completeIdentityVerificationFromProvider(ORG, 'cust_1', verResult.verificationId);
    expect(verifiedCustomer.verificationStatus).toBe(IdentityVerificationStatus.VERIFIED);
  });

  it('rejects claim authorization for completed claims', async () => {
    seedCustomer({ verificationStatus: IdentityVerificationStatus.VERIFIED });
    seedVault({ status: 'triggered' });
    seedPlan();
    seedClaim({ status: 'completed' });
    seedBeneficiary();

    const customerObj = await getCustomerInOrg(ORG, 'cust_1');
    const vault = await getVaultInOrg(ORG, 'vlt_1');
    const planSnap = db.docs.get(PLAN_PATH + '/plan_1');
    const claimSnap = db.docs.get(CLAIM_PATH + '/claim_1');
    
    const plan = { id: 'plan_1', ...planSnap };
    const claim = { id: 'claim_1', ...claimSnap };
    const context = { claim, plan, customer: customerObj, vault };

    await expect(authorizeClaim(context, true, true)).rejects.toThrow();
  });
});