import { ClaimStatus, Claim, LegacyPlan, Customer, Vault } from '@/types/enterprise';
import { isLegalClaimTransition, ClaimEngine, CLAIM_LEGAL_TRANSITIONS } from '@/services/enterprise/claim-engine';
import { assertIdentityVerifiedForClaim, isCustomerIdentityVerified } from '@/services/enterprise/domain-model';
import { ApiError } from '@/lib/api-errors';
import { DOMAIN_ERROR_CODES } from '@/services/enterprise/domain-model';

export const CLAIM_AUTH_ERROR_CODES = {
  CLAIM_NOT_IN_VERIFICATION: 'CLAIM_NOT_IN_VERIFICATION',
  IDENTITY_NOT_VERIFIED: 'IDENTITY_NOT_VERIFIED',
  OTP_REQUIRED: 'OTP_REQUIRED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  GUARDIAN_QUORUM_NOT_MET: 'GUARDIAN_QUORUM_NOT_MET',
  CLAIM_ALREADY_AUTHORIZED: 'CLAIM_ALREADY_AUTHORIZED',
  INVALID_CLAIM_STATE: 'INVALID_CLAIM_STATE',
  LEGACY_MATERIAL_NOT_FOUND: 'LEGACY_MATERIAL_NOT_FOUND',
} as const;

export interface ClaimAuthorizationContext {
  claim: Claim;
  plan: LegacyPlan;
  customer: Customer;
  vault: Vault;
}

export interface OtpVerificationResult {
  verified: boolean;
  error?: string;
}

export interface GuardianQuorumResult {
  met: boolean;
  approvalsCount: number;
  threshold: number;
  requiredGuardians: string[];
}

export interface ClaimAuthorizationResult {
  authorized: boolean;
  claim: Claim;
  legacyMaterial?: {
    encryptedSecret: string;
    encryptedMessage: string;
    videoUrl?: string;
    personalPhrase?: string;
    serverShare?: string;
  };
  nextRequiredStep?: 'identity_verification' | 'otp_verification' | 'guardian_approval' | 'grace_period' | 'release';
  error?: string;
}

export async function validateClaimForAuthorization(
  claim: Claim,
  plan: LegacyPlan,
  customer: Customer
): Promise<void> {
  if (!claim.legacyPlanId || claim.legacyPlanId !== plan.id) {
    throw new ApiError(400, CLAIM_AUTH_ERROR_CODES.INVALID_CLAIM_STATE, 'Claim does not belong to this legacy plan');
  }
  if (claim.customerId !== customer.id) {
    throw new ApiError(400, CLAIM_AUTH_ERROR_CODES.INVALID_CLAIM_STATE, 'Claim does not belong to this customer');
  }
  if (claim.status === ClaimStatus.COMPLETED || claim.status === ClaimStatus.CANCELLED) {
    throw new ApiError(409, CLAIM_AUTH_ERROR_CODES.CLAIM_ALREADY_AUTHORIZED, `Claim already in terminal state: ${claim.status}`);
  }
}

export async function requireIdentityVerifiedForClaim(customer: Customer): Promise<void> {
  if (!isCustomerIdentityVerified(customer)) {
    throw new ApiError(
      403,
      CLAIM_AUTH_ERROR_CODES.IDENTITY_NOT_VERIFIED,
      'Claim authorization requires a server-verified customer identity',
      { customerId: customer.id, verificationStatus: customer.verificationStatus }
    );
  }
}

export async function verifyOtpForClaim(
  claim: Claim,
  providedOtp: string,
  storedOtp: string,
  otpCreatedAt: Date | string | number
): Promise<OtpVerificationResult> {
  const OTP_TTL_MS = 15 * 60 * 1000;
  const now = Date.now();
  const createdAt = new Date(otpCreatedAt).getTime();

  if (!storedOtp) {
    return { verified: false, error: 'No OTP has been issued' };
  }

  if (now - createdAt > OTP_TTL_MS) {
    return { verified: false, error: 'OTP expired. Issue a new OTP and try again.' };
  }

  if (providedOtp !== storedOtp) {
    return { verified: false, error: 'Invalid verification code' };
  }

  return { verified: true };
}

export async function checkGuardianQuorum(
  claim: Claim,
  plan: LegacyPlan,
  guardians: Array<{ id: string; firebaseUid?: string; walletAddress?: string }>
): Promise<GuardianQuorumResult> {
  const quorum = Math.max(1, plan.guardianQuorum || 0);
  const approvals = claim.guardianApprovals || {};
  const approvalsCount = Object.values(approvals).filter(Boolean).length;
  const met = approvalsCount >= quorum;

  return {
    met,
    approvalsCount,
    threshold: quorum,
    requiredGuardians: guardians.map(g => g.id),
  };
}

export async function authorizeClaim(
  context: ClaimAuthorizationContext,
  otpVerified: boolean,
  guardianQuorumMet: boolean
): Promise<ClaimAuthorizationResult> {
  const { claim, plan, customer, vault } = context;

  await validateClaimForAuthorization(claim, plan, customer);
  await requireIdentityVerifiedForClaim(customer);

  if (!otpVerified) {
    return {
      authorized: false,
      claim,
      nextRequiredStep: 'otp_verification',
      error: 'OTP verification required',
    };
  }

  if (plan.guardianQuorum && plan.guardianQuorum > 0 && !guardianQuorumMet) {
    return {
      authorized: false,
      claim,
      nextRequiredStep: 'guardian_approval',
      error: 'Guardian quorum not met',
    };
  }

  const currentStatus = claim.status;
  let nextStatus: ClaimStatus;

  if (currentStatus === ClaimStatus.PENDING) {
    nextStatus = ClaimStatus.VERIFICATION;
  } else if (currentStatus === ClaimStatus.VERIFICATION) {
    nextStatus = plan.guardianQuorum > 0 ? ClaimStatus.GUARDIAN_REVIEW : ClaimStatus.GRACE_PERIOD;
  } else if (currentStatus === ClaimStatus.GUARDIAN_REVIEW) {
    nextStatus = ClaimStatus.GRACE_PERIOD;
  } else if (currentStatus === ClaimStatus.GRACE_PERIOD) {
    nextStatus = ClaimStatus.APPROVED;
  } else if (currentStatus === ClaimStatus.APPROVED) {
    nextStatus = ClaimStatus.COMPLETED;
  } else {
    throw new ApiError(400, CLAIM_AUTH_ERROR_CODES.INVALID_CLAIM_STATE, `Cannot authorize claim in state: ${currentStatus}`);
  }

  const authorizedClaim = ClaimEngine.transition(claim, nextStatus, 'claim-authorization-service');

  if (nextStatus === ClaimStatus.COMPLETED) {
    return {
      authorized: true,
      claim: authorizedClaim,
      legacyMaterial: {
        encryptedSecret: (vault as any).encryptedSecret,
        encryptedMessage: (vault as any).encryptedMessage,
        videoUrl: (vault as any).videoUrl,
        personalPhrase: (vault as any).personalPhrase,
        serverShare: (vault as any).serverShare,
      },
      nextRequiredStep: 'release',
    };
  }

  const nextStepMap: Record<ClaimStatus, ClaimAuthorizationResult['nextRequiredStep']> = {
    [ClaimStatus.VERIFICATION]: 'identity_verification',
    [ClaimStatus.GUARDIAN_REVIEW]: 'guardian_approval',
    [ClaimStatus.GRACE_PERIOD]: 'grace_period',
    [ClaimStatus.APPROVED]: 'release',
    [ClaimStatus.COMPLETED]: 'release',
  } as any;

  return {
    authorized: false,
    claim: authorizedClaim,
    nextRequiredStep: nextStepMap[nextStatus] || 'release',
    error: `Claim transitioned to ${nextStatus}. Next step required.`,
  };
}

export async function transitionClaimToVerification(claim: Claim): Promise<Claim> {
  if (claim.status !== ClaimStatus.PENDING) {
    throw new ApiError(400, CLAIM_AUTH_ERROR_CODES.CLAIM_NOT_IN_VERIFICATION, `Claim must be in PENDING to start verification, current: ${claim.status}`);
  }
  return ClaimEngine.transition(claim, ClaimStatus.VERIFICATION, 'claim-authorization-service');
}

export async function getNextRequiredAction(claim: Claim, plan: LegacyPlan, customer: Customer): Promise<{
  action: ClaimAuthorizationResult['nextRequiredStep'];
  reason: string;
}> {
  if (!isCustomerIdentityVerified(customer)) {
    return { action: 'identity_verification', reason: 'Customer identity must be verified by server' };
  }

  if (claim.status === ClaimStatus.PENDING) {
    return { action: 'identity_verification', reason: 'Claim must transition to VERIFICATION' };
  }

  if (claim.status === ClaimStatus.VERIFICATION) {
    return { action: 'otp_verification', reason: 'OTP verification required' };
  }

  if (claim.status === ClaimStatus.GUARDIAN_REVIEW) {
    const quorum = Math.max(1, plan.guardianQuorum || 0);
    const approvals = Object.values(claim.guardianApprovals || {}).filter(Boolean).length;
    if (approvals < quorum) {
      return { action: 'guardian_approval', reason: `Guardian quorum not met (${approvals}/${quorum})` };
    }
    return { action: 'grace_period', reason: 'Quorum met, waiting for grace period' };
  }

  if (claim.status === ClaimStatus.GRACE_PERIOD) {
    return { action: 'release', reason: 'Grace period passed, ready for approval' };
  }

  if (claim.status === ClaimStatus.APPROVED) {
    return { action: 'release', reason: 'Approved, ready for final release' };
  }

  return { action: 'release', reason: `Claim in terminal state: ${claim.status}` };
}