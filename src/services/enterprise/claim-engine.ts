import {
  ClaimStatus,
  Claim,
  ClaimCreate,
  ClaimTransition,
  LegacyPlan,
} from '@/types/enterprise';

export const CLAIM_LEGAL_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  [ClaimStatus.PENDING]: [ClaimStatus.VERIFICATION, ClaimStatus.CANCELLED],
  [ClaimStatus.VERIFICATION]: [ClaimStatus.GUARDIAN_REVIEW, ClaimStatus.GRACE_PERIOD, ClaimStatus.REJECTED, ClaimStatus.CANCELLED],
  [ClaimStatus.GUARDIAN_REVIEW]: [ClaimStatus.GRACE_PERIOD, ClaimStatus.REJECTED, ClaimStatus.DISPUTED, ClaimStatus.CANCELLED],
  [ClaimStatus.GRACE_PERIOD]: [ClaimStatus.APPROVED, ClaimStatus.REJECTED, ClaimStatus.DISPUTED, ClaimStatus.CANCELLED],
  [ClaimStatus.APPROVED]: [ClaimStatus.COMPLETED, ClaimStatus.DISPUTED, ClaimStatus.CANCELLED],
  [ClaimStatus.REJECTED]: [ClaimStatus.PENDING, ClaimStatus.CANCELLED],
  [ClaimStatus.DISPUTED]: [ClaimStatus.GUARDIAN_REVIEW, ClaimStatus.CANCELLED],
  [ClaimStatus.COMPLETED]: [],
  [ClaimStatus.CANCELLED]: [ClaimStatus.PENDING],
};

export function isLegalClaimTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export { ClaimStatus };

export type ClaimEngineCreateResult = {
  claim: Claim;
  created: boolean;
};

function isoNow() {
  return new Date();
}

export const ClaimEngine = {
  create(input: ClaimCreate & { id?: string; plan: LegacyPlan; organizationId: string; initiator: string; idempotencyKey?: string; existingDedupeIdempotency?: Set<string>; existingDedupePlanCustomer?: Set<string> }): ClaimEngineCreateResult {
    const { plan, organizationId, initiator, idempotencyKey, existingDedupeIdempotency, existingDedupePlanCustomer } = input;
    if (idempotencyKey && existingDedupeIdempotency?.has(idempotencyKey)) {
      throw Object.assign(new Error('DUPLICATE_IDEMPOTENCY_KEY'), { code: 'DUPLICATE_IDEMPOTENCY_KEY', statusCode: 409 });
    }
    const key = `${plan.customerId}:${plan.id}`;
    if (existingDedupePlanCustomer?.has(key)) {
      throw Object.assign(new Error('ACTIVE_CLAIM_EXISTS'), { code: 'ACTIVE_CLAIM_EXISTS', statusCode: 409 });
    }
    const triggerable = ['escalating', 'claim_in_progress', 'completed', 'cancelled'];
    const allowAnyStatus = !!input.reason && input.reason === 'preview';
    if (!allowAnyStatus && !triggerable.includes(plan.status) && plan.status !== 'warning') {
      throw Object.assign(new Error('PLAN_NOT_TRIGGERED'), { code: 'PLAN_NOT_TRIGGERED', statusCode: 400 });
    }
    const now = isoNow();
    const claim: Claim = {
      id: input.id ?? `claim_${crypto.randomUUID().replace(/-/g, '')}`,
      organizationId,
      customerId: plan.customerId,
      legacyPlanId: plan.id,
      status: ClaimStatus.PENDING,
      initiator,
      reason: input.reason,
      guardianApprovals: {},
      transitions: [{ from: '', to: ClaimStatus.PENDING, at: now, actor: initiator }],
      createdAt: now,
      updatedAt: now,
    };
    return { claim, created: true };
  },

  transition(claim: Claim, to: ClaimStatus, actor: string, reason?: string): Claim {
    if (!isLegalClaimTransition(claim.status, to)) {
      throw Object.assign(new Error('ILLEGAL_TRANSITION'), { code: 'ILLEGAL_TRANSITION', statusCode: 400, details: { from: claim.status, to } });
    }
    const now = isoNow();
    const next = { ...claim };
    next.transitions = [...claim.transitions, { from: claim.status, to, at: now, actor }];
    next.status = to;
    next.updatedAt = now;
    if (to === ClaimStatus.COMPLETED) next.completedAt = now;
    if (to === ClaimStatus.CANCELLED) next.cancelledAt = now;
    if (to === ClaimStatus.DISPUTED) next.disputeReason = reason ?? claim.disputeReason;
    return next;
  },
};

export function registerGuardianApproval(
  claim: Claim,
  plan: LegacyPlan,
  guardianId: string,
  approved: boolean,
  actor: string,
): { claim: Claim; quorumMet: boolean } {
  const now = isoNow();
  const approvals = { ...claim.guardianApprovals, [guardianId]: approved };
  const tally = Object.values(approvals).filter(Boolean).length;
  const quorum = Math.max(1, plan.guardianQuorum || 0);
  const quorumMet = tally >= quorum;
  return {
    claim: {
      ...claim,
      guardianApprovals: approvals,
      updatedAt: now,
    },
    quorumMet,
  };
}
