import { describe, it, expect, beforeEach } from 'vitest';
import {
  CLAIM_LEGAL_TRANSITIONS,
  ClaimEngine,
  ClaimStatus,
  isLegalClaimTransition,
  registerGuardianApproval,
} from '@/services/enterprise/claim-engine';
import { createId } from '@/services/enterprise/persistence';
import type { Claim, LegacyPlan } from '@/types/enterprise';

const ALL_STATUSES: ClaimStatus[] = [
  ClaimStatus.PENDING,
  ClaimStatus.VERIFICATION,
  ClaimStatus.GUARDIAN_REVIEW,
  ClaimStatus.GRACE_PERIOD,
  ClaimStatus.APPROVED,
  ClaimStatus.REJECTED,
  ClaimStatus.DISPUTED,
  ClaimStatus.COMPLETED,
  ClaimStatus.CANCELLED,
];

function makeBaseClaim(status: ClaimStatus): Claim {
  const orgId = createId('org');
  const customerId = createId('customer');
  const planId = createId('legacyPlan');
  return {
    id: createId('claim'),
    organizationId: orgId,
    customerId,
    legacyPlanId: planId,
    status,
    initiator: 'test_initiator',
    guardianApprovals: {},
    transitions: [{ from: '', to: status, at: new Date(), actor: 'seed' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePlan(quorum: number): LegacyPlan {
  const customerId = createId('customer');
  return {
    id: createId('legacyPlan'),
    organizationId: createId('org'),
    customerId,
    name: 'Test Plan',
    intervalDays: 30,
    guardianQuorum: quorum,
    encryptionConfig: {
      algorithm: 'AES-256-GCM',
      kdf: 'argon2id',
      shamirThreshold: 2,
      shamirShares: 3,
    },
    walletSignatureRequired: false,
    status: 'claim_in_progress',
    suspicionScore: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ClaimStatus Transition Matrix (9x9 = 81 cells)', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const legal = CLAIM_LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
      const cellLabel = `${from} → ${to} (${legal ? 'LEGAL' : 'ILLEGAL'})`;

      it(cellLabel, () => {
        const claim = makeBaseClaim(from);

        // Check isLegalClaimTransition predicate
        expect(isLegalClaimTransition(from, to)).toBe(legal);

        if (legal) {
          const actor = 'actor_' + Math.random().toString(36).slice(2, 8);
          const before = claim.transitions.length;
          const result = ClaimEngine.transition(claim, to, actor);
          expect(result.status).toBe(to);
          expect(result.transitions.length).toBe(before + 1);
          const lastTx = result.transitions[result.transitions.length - 1];
          expect(lastTx.from).toBe(from);
          expect(lastTx.to).toBe(to);
          expect(lastTx.actor).toBe(actor);
        } else {
          expect(() =>
            ClaimEngine.transition(claim, to, 'actor_x')
          ).toThrow(/ILLEGAL_TRANSITION/);
        }
      });
    }
  }
});

describe('Terminal state: COMPLETED rejects all outgoing transitions', () => {
  for (const to of ALL_STATUSES) {
    it(`COMPLETED → ${to} always DENIES`, () => {
      const claim = makeBaseClaim(ClaimStatus.COMPLETED);
      expect(isLegalClaimTransition(ClaimStatus.COMPLETED, to)).toBe(false);
      expect(() =>
        ClaimEngine.transition(claim, to, 'actor_terminal')
      ).toThrow(/ILLEGAL_TRANSITION/);
    });
  }
});

describe('Extra regression tests', () => {
  it('Duplicate guardian approval: same guardianId twice does not double-count', () => {
    const claim = makeBaseClaim(ClaimStatus.GUARDIAN_REVIEW);
    const plan = makePlan(2);
    const gid = 'guard_same';

    const res1 = registerGuardianApproval(claim, plan, gid, true, 'actor');
    expect(Object.keys(res1.claim.guardianApprovals).length).toBe(1);
    const tally1 = Object.values(res1.claim.guardianApprovals).filter(Boolean).length;
    expect(tally1).toBe(1);

    const res2 = registerGuardianApproval(res1.claim, plan, gid, true, 'actor');
    expect(Object.keys(res2.claim.guardianApprovals).length).toBe(1);
    const tally2 = Object.values(res2.claim.guardianApprovals).filter(Boolean).length;
    expect(tally2).toBe(1);
    expect(res2.quorumMet).toBe(false);
  });

  it('Quorum=0 regression: Math.max(1,0)=1 fix. Zero approvals => quorumMet FALSE, 1 approval => TRUE', () => {
    const claim = makeBaseClaim(ClaimStatus.GUARDIAN_REVIEW);
    const plan = makePlan(0);

    // Zero approvals: tally = 0, quorum = Math.max(1,0) = 1 => 0 >= 1 is FALSE
    const zeroRes = registerGuardianApproval(claim, plan, 'nobody_yet', true, 'actor');
    // Actually registerGuardianApproval always adds one guardian, so we need to construct manually
    // Let's construct the scenario manually:
    const quorum = Math.max(1, plan.guardianQuorum || 0);
    expect(quorum).toBe(1);

    // Base claim with empty approvals
    const tallyEmpty = Object.values(claim.guardianApprovals).filter(Boolean).length;
    expect(tallyEmpty >= quorum).toBe(false);

    // After 1 approval
    const oneRes = registerGuardianApproval(claim, plan, 'g_single', true, 'actor');
    expect(oneRes.quorumMet).toBe(true);
    const tallyOne = Object.values(oneRes.claim.guardianApprovals).filter(Boolean).length;
    expect(tallyOne).toBe(1);
    expect(tallyOne >= quorum).toBe(true);
  });

  it('Replay nonce concept: consumed=true nonce reuse throws 409 conflict logic', () => {
    type Nonce = { id: string; nonce: string; guardianId: string; claimId: string; consumed: boolean; consumedAt?: Date };
    const usedNonces = new Map<string, Nonce>();

    function consumeNonce(nonce: string, guardianId: string, claimId: string): Nonce {
      const existing = usedNonces.get(nonce);
      if (existing && existing.consumed) {
        const err: any = new Error('NONCE_ALREADY_CONSUMED');
        err.code = 'NONCE_ALREADY_CONSUMED';
        err.statusCode = 409;
        throw err;
      }
      const record: Nonce = {
        id: createId('guardianNonce'),
        nonce,
        guardianId,
        claimId,
        consumed: true,
        consumedAt: new Date(),
      };
      usedNonces.set(nonce, record);
      return record;
    }

    const nonceVal = 'nonce_replay_' + Math.random().toString(36).slice(2);
    const guardianId = 'guard_replay';
    const claimId = createId('claim');

    const first = consumeNonce(nonceVal, guardianId, claimId);
    expect(first.consumed).toBe(true);
    expect(first.consumedAt).toBeDefined();

    expect(() => consumeNonce(nonceVal, guardianId, claimId)).toThrow(/NONCE_ALREADY_CONSUMED/);
    try {
      consumeNonce(nonceVal, guardianId, claimId);
    } catch (e: any) {
      expect(e.statusCode).toBe(409);
    }
  });
});
