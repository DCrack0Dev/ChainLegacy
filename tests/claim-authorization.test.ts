import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  authorizeClaim,
  validateClaimForAuthorization,
  requireIdentityVerifiedForClaim,
  verifyOtpForClaim,
  checkGuardianQuorum,
  transitionClaimToVerification,
  getNextRequiredAction,
} from '@/services/enterprise/claim-authorization';
import { Claim, ClaimStatus, LegacyPlan, Customer, Vault } from '@/types/enterprise';
import { ApiError } from '@/lib/api-errors';
import { CLAIM_AUTH_ERROR_CODES } from '@/services/enterprise/claim-authorization';
import { IdentityVerificationStatus } from '@/types/enterprise';

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim_1',
    organizationId: 'org_1',
    customerId: 'cust_1',
    legacyPlanId: 'plan_1',
    status: ClaimStatus.PENDING,
    initiator: 'beneficiary_1',
    guardianApprovals: {},
    transitions: [{ from: '', to: ClaimStatus.PENDING, at: new Date(), actor: 'beneficiary_1' }],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePlan(overrides: Partial<LegacyPlan> = {}): LegacyPlan {
  return {
    id: 'plan_1',
    organizationId: 'org_1',
    customerId: 'cust_1',
    vaultId: 'vault_1',
    name: 'Test Plan',
    intervalDays: 30,
    guardianQuorum: 0,
    encryptionConfig: { algorithm: 'AES-256-GCM', kdf: 'argon2id', shamirThreshold: 0, shamirShares: 0 },
    walletSignatureRequired: false,
    status: 'active',
    suspicionScore: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust_1',
    organizationId: 'org_1',
    partnerCustomerId: 'partner_1',
    email: 'test@example.com',
    fullName: 'Test User',
    firebaseUid: 'firebase_uid_1',
    vaultId: 'vault_1',
    verificationStatus: IdentityVerificationStatus.VERIFIED,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    id: 'vault_1',
    organizationId: 'org_1',
    customerId: 'cust_1',
    ownerUid: 'firebase_uid_1',
    status: 'active',
    intervalDays: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('claim-authorization service', () => {
  let claim: Claim;
  let plan: LegacyPlan;
  let customer: Customer;
  let vault: Vault;
  let context: { claim: Claim; plan: LegacyPlan; customer: Customer; vault: Vault };

  beforeEach(() => {
    claim = makeClaim();
    plan = makePlan();
    customer = makeCustomer();
    vault = makeVault();
    context = { claim, plan, customer, vault };
  });

  describe('validateClaimForAuthorization', () => {
    it('passes for valid claim/plan/customer', async () => {
      await expect(validateClaimForAuthorization(claim, plan, customer)).resolves.toBeUndefined();
    });

    it('throws if claim legacyPlanId does not match', async () => {
      claim.legacyPlanId = 'plan_2';
      await expect(validateClaimForAuthorization(claim, plan, customer)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.INVALID_CLAIM_STATE,
      });
    });

    it('throws if claim customerId does not match', async () => {
      claim.customerId = 'cust_2';
      await expect(validateClaimForAuthorization(claim, plan, customer)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.INVALID_CLAIM_STATE,
      });
    });

    it('throws if claim is COMPLETED', async () => {
      claim.status = ClaimStatus.COMPLETED;
      await expect(validateClaimForAuthorization(claim, plan, customer)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.CLAIM_ALREADY_AUTHORIZED,
      });
    });

    it('throws if claim is CANCELLED', async () => {
      claim.status = ClaimStatus.CANCELLED;
      await expect(validateClaimForAuthorization(claim, plan, customer)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.CLAIM_ALREADY_AUTHORIZED,
      });
    });
  });

  describe('requireIdentityVerifiedForClaim', () => {
    it('passes for verified customer', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      await expect(requireIdentityVerifiedForClaim(customer)).resolves.toBeUndefined();
    });

    it('throws for not_started customer', async () => {
      customer.verificationStatus = IdentityVerificationStatus.NOT_STARTED;
      await expect(requireIdentityVerifiedForClaim(customer)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.IDENTITY_NOT_VERIFIED,
        statusCode: 403,
      });
    });

    it('throws for pending customer', async () => {
      customer.verificationStatus = IdentityVerificationStatus.PENDING;
      await expect(requireIdentityVerifiedForClaim(customer)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.IDENTITY_NOT_VERIFIED,
      });
    });

    it('throws for rejected customer', async () => {
      customer.verificationStatus = IdentityVerificationStatus.REJECTED;
      await expect(requireIdentityVerifiedForClaim(customer)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.IDENTITY_NOT_VERIFIED,
      });
    });

    it('throws for manual_review customer', async () => {
      customer.verificationStatus = IdentityVerificationStatus.MANUAL_REVIEW;
      await expect(requireIdentityVerifiedForClaim(customer)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.IDENTITY_NOT_VERIFIED,
      });
    });
  });

  describe('verifyOtpForClaim', () => {
    it('returns verified for matching OTP within TTL', async () => {
      const result = await verifyOtpForClaim(claim, '123456', '123456', new Date());
      expect(result.verified).toBe(true);
    });

    it('returns false for non-matching OTP', async () => {
      const result = await verifyOtpForClaim(claim, '123456', '654321', new Date());
      expect(result.verified).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('returns false for missing stored OTP', async () => {
      const result = await verifyOtpForClaim(claim, '123456', '', new Date());
      expect(result.verified).toBe(false);
      expect(result.error).toContain('No OTP');
    });

    it('returns false for expired OTP', async () => {
      const oldDate = new Date(Date.now() - 20 * 60 * 1000);
      const result = await verifyOtpForClaim(claim, '123456', '123456', oldDate);
      expect(result.verified).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('checkGuardianQuorum', () => {
    it('returns met=false for quorum=0 (threshold becomes 1)', async () => {
      plan.guardianQuorum = 0;
      const result = await checkGuardianQuorum(claim, plan, []);
      expect(result.met).toBe(false);
      expect(result.threshold).toBe(1);
    });

    it('returns met=true when approvals >= quorum', async () => {
      plan.guardianQuorum = 2;
      claim.guardianApprovals = { g1: true, g2: true };
      const result = await checkGuardianQuorum(claim, plan, [{ id: 'g1' }, { id: 'g2' }]);
      expect(result.met).toBe(true);
      expect(result.approvalsCount).toBe(2);
      expect(result.threshold).toBe(2);
    });

    it('returns met=false when approvals < quorum', async () => {
      plan.guardianQuorum = 2;
      claim.guardianApprovals = { g1: true };
      const result = await checkGuardianQuorum(claim, plan, [{ id: 'g1' }, { id: 'g2' }]);
      expect(result.met).toBe(false);
      expect(result.approvalsCount).toBe(1);
    });

    it('returns requiredGuardians list', async () => {
      plan.guardianQuorum = 2;
      const result = await checkGuardianQuorum(claim, plan, [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }]);
      expect(result.requiredGuardians).toEqual(['g1', 'g2', 'g3']);
    });
  });

  describe('transitionClaimToVerification', () => {
    it('transitions PENDING to VERIFICATION', async () => {
      claim.status = ClaimStatus.PENDING;
      const result = await transitionClaimToVerification(claim);
      expect(result.status).toBe(ClaimStatus.VERIFICATION);
      expect(result.transitions.length).toBe(2);
      expect(result.transitions[0].from).toBe('');
      expect(result.transitions[0].to).toBe(ClaimStatus.PENDING);
      expect(result.transitions[1].from).toBe(ClaimStatus.PENDING);
      expect(result.transitions[1].to).toBe(ClaimStatus.VERIFICATION);
    });

    it('throws for non-PENDING status', async () => {
      claim.status = ClaimStatus.VERIFICATION;
      await expect(transitionClaimToVerification(claim)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.CLAIM_NOT_IN_VERIFICATION,
      });
    });
  });

  describe('getNextRequiredAction', () => {
    it('returns identity_verification for unverified customer', async () => {
      customer.verificationStatus = IdentityVerificationStatus.NOT_STARTED;
      const result = await getNextRequiredAction(claim, plan, customer);
      expect(result.action).toBe('identity_verification');
    });

    it('returns identity_verification for PENDING claim', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.PENDING;
      const result = await getNextRequiredAction(claim, plan, customer);
      expect(result.action).toBe('identity_verification');
    });

    it('returns otp_verification for VERIFICATION claim', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.VERIFICATION;
      const result = await getNextRequiredAction(claim, plan, customer);
      expect(result.action).toBe('otp_verification');
    });

    it('returns guardian_approval when quorum not met', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.GUARDIAN_REVIEW;
      plan.guardianQuorum = 2;
      claim.guardianApprovals = { g1: true };
      const result = await getNextRequiredAction(claim, plan, customer);
      expect(result.action).toBe('guardian_approval');
      expect(result.reason).toContain('1/2');
    });

    it('returns grace_period when quorum met', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.GUARDIAN_REVIEW;
      plan.guardianQuorum = 2;
      claim.guardianApprovals = { g1: true, g2: true };
      const result = await getNextRequiredAction(claim, plan, customer);
      expect(result.action).toBe('grace_period');
    });

    it('returns release for GRACE_PERIOD', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.GRACE_PERIOD;
      const result = await getNextRequiredAction(claim, plan, customer);
      expect(result.action).toBe('release');
    });

    it('returns release for APPROVED', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.APPROVED;
      const result = await getNextRequiredAction(claim, plan, customer);
      expect(result.action).toBe('release');
    });
  });

  describe('authorizeClaim', () => {
    it('requires OTP verification first', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.VERIFICATION;
      const result = await authorizeClaim(context, false, true);
      expect(result.authorized).toBe(false);
      expect(result.nextRequiredStep).toBe('otp_verification');
    });

    it('requires guardian quorum when configured', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.GUARDIAN_REVIEW;
      plan.guardianQuorum = 2;
      claim.guardianApprovals = { g1: true };
      const result = await authorizeClaim(context, true, false);
      expect(result.authorized).toBe(false);
      expect(result.nextRequiredStep).toBe('guardian_approval');
    });

    it('advances through statuses when requirements met', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.VERIFICATION;
      plan.guardianQuorum = 0;

      let result = await authorizeClaim(context, true, true);
      expect(result.claim.status).toBe(ClaimStatus.GRACE_PERIOD);
      expect(result.nextRequiredStep).toBe('grace_period');

      context.claim = result.claim;
      result = await authorizeClaim(context, true, true);
      expect(result.claim.status).toBe(ClaimStatus.APPROVED);
      expect(result.nextRequiredStep).toBe('release');

      context.claim = result.claim;
      result = await authorizeClaim(context, true, true);
      expect(result.claim.status).toBe(ClaimStatus.COMPLETED);
      expect(result.authorized).toBe(true);
      expect(result.legacyMaterial).toBeDefined();
    });

    it('advances from GUARDIAN_REVIEW when quorum met', async () => {
      customer.verificationStatus = IdentityVerificationStatus.VERIFIED;
      claim.status = ClaimStatus.GUARDIAN_REVIEW;
      plan.guardianQuorum = 2;
      claim.guardianApprovals = { g1: true, g2: true };

      const result = await authorizeClaim(context, true, true);
      expect(result.claim.status).toBe(ClaimStatus.GRACE_PERIOD);
    });

    it('throws for invalid claim state', async () => {
      claim.status = 'invalid' as any;
      await expect(authorizeClaim(context, true, true)).rejects.toMatchObject({
        code: CLAIM_AUTH_ERROR_CODES.INVALID_CLAIM_STATE,
      });
    });
  });
});