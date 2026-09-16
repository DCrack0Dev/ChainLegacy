import { v1Route, structuredJson } from '@/lib/v1-route';
import { ClaimTransitionSchema, ClaimStatus, Claim } from '@/types/enterprise';
import {
  verifyGuardianProof,
  GuardianNonceStore,
  GuardianStore,
  WalletAddressVerifier,
  SecurityEventCounter,
  GuardianNonceRow,
  GUARDIAN_PROOF_SCHEMES,
} from '@/services/enterprise/guardian-identity';
import {
  processWebhookEnqueue,
  makeWebhookDeliveryEvent,
  writeEntity,
  queryOrgCollection,
  logV1Event,
  genId,
} from '@/services/enterprise/v1-helpers';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { SystemEvent } from '@/services/events';
import { ApiError } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

class FsGuardianNonces implements GuardianNonceStore {
  async create(row: GuardianNonceRow): Promise<void> {
    if (!adminDb) return;
    await adminDb.collection('organizations').doc(row.organizationId).collection('guardianNonces').doc(row.nonce).set(row);
  }
  async load(guardianId: string, nonce: string, orgId: string): Promise<GuardianNonceRow | null> {
    if (!adminDb) return null;
    const snaps = await adminDb
      .collection('organizations').doc(orgId).collection('guardianNonces')
      .where('nonce', '==', nonce)
      .where('guardianId', '==', guardianId)
      .where('organizationId', '==', orgId)
      .limit(1)
      .get();
    return snaps.empty ? null : (snaps.docs[0].data() as GuardianNonceRow);
  }
  async markConsumed(_gid: string, nonce: string, orgId: string): Promise<void> {
    if (!adminDb) return;
    const snaps = await adminDb
      .collection('organizations').doc(orgId).collection('guardianNonces')
      .where('nonce', '==', nonce)
      .where('organizationId', '==', orgId)
      .limit(1).get();
    if (snaps.empty) return;
    await snaps.docs[0].ref.update({ consumed: true, consumedAt: Date.now() });
  }
}

class FsGuardians implements GuardianStore {
  async load(id: string, orgId: string) {
    if (!adminDb) return null;
    const snaps = await adminDb
      .collection('organizations').doc(orgId).collection('guardians')
      .where('id', '==', id)
      .where('organizationId', '==', orgId)
      .limit(1).get();
    return snaps.empty ? null : (snaps.docs[0].data() as any);
  }
}

class FsSecurityEvents implements SecurityEventCounter {
  async increment(orgId: string, reason: string, meta: any) {
    if (!adminDb) return;
    await adminDb.collection('organizations').doc(orgId).collection('securityEvents').add({
      id: `sec_${genId('').slice(0, 14)}`,
      organizationId: orgId,
      reason,
      meta: meta ?? {},
      createdAt: Date.now(),
    });
  }
}

class ViemWalletVerifier implements WalletAddressVerifier {
  async recoverAddress(messageHash: string, signature: string, _scheme: any): Promise<string> {
    try {
      const viem = await import('viem');
      const hash = (messageHash.length === 66 && /^0x[a-fA-F0-9]{64}$/.test(messageHash))
        ? (messageHash as `0x${string}`)
        : undefined;
      if (hash && typeof (viem as any).recoverPublicKey === 'function') {
        const pk = await (viem as any).recoverPublicKey({ hash, signature: signature as `0x${string}` });
        if (typeof (viem as any).publicKeyToAddress === 'function') {
          return (viem as any).publicKeyToAddress({ publicKey: pk });
        }
      }
      if (typeof (viem as any).recoverMessageAddress === 'function') {
        return (viem as any).recoverMessageAddress({ message: messageHash, signature: signature as `0x${string}` });
      }
    } catch { /* ignore */ }
    return '0x' + '00'.repeat(20);
  }
}

const guardianNonces = new FsGuardianNonces();
const guardians = new FsGuardians();
const walletVerifier = new ViemWalletVerifier();
const securityEvents = new FsSecurityEvents();

function callerFirebaseUid(auth: any): string | undefined {
  return auth.method === 'firebase' ? auth.uid : undefined;
}

function actorFromAuth(auth: any): string {
  return auth.actorId ?? (auth.method === 'firebase' ? auth.uid : auth.keyId ?? auth.method);
}

async function updateClaimWithGuardianApproval(
  orgId: string, claimId: string, guardianId: string, approved: boolean, proofScheme: any,
): Promise<{ claim: Claim | null; autoTransitioned: ClaimStatus | null; threshold: number; approvalsCount: number; }> {
  if (!adminDb) return { claim: null, autoTransitioned: null, threshold: 0, approvalsCount: 0 };
  const claimSnap = await adminDb
    .collection('organizations').doc(orgId).collection('claims')
    .where('id', '==', claimId).limit(1).get();
  if (claimSnap.empty) return { claim: null, autoTransitioned: null, threshold: 0, approvalsCount: 0 };
  const doc = claimSnap.docs[0];
  const claim = doc.data() as any as Claim;
  const planSnap = claim.legacyPlanId ? await adminDb
    .collection('organizations').doc(orgId).collection('legacyPlans').where('id', '==', claim.legacyPlanId).limit(1).get()
    : null;
  const threshold = planSnap && !planSnap.empty
    ? ((planSnap.docs[0].data() as any).guardianQuorum ?? 1)
    : 1;
  const existingApprovals = (claim as any).guardianApprovals ?? {};
  if (approved) existingApprovals[guardianId] = { approved: true, at: Date.now(), proofScheme };
  else delete existingApprovals[guardianId];
  const approvalsCount = Object.values(existingApprovals).filter((a: any) => a && a.approved).length;
  let autoTransitioned: ClaimStatus | null = null;
  let nextStatus = claim.status;
  if (claim.status === ('guardian_review' as any) || claim.status === ('GUARDIAN_REVIEW' as any)) {
    if (approvalsCount >= Math.max(1, threshold)) {
      nextStatus = (ClaimStatus.GRACE_PERIOD ?? 'grace_period') as any;
      autoTransitioned = nextStatus as any;
    }
  }
  await doc.ref.update({
    guardianApprovals: existingApprovals,
    approvalsCount,
    threshold,
    status: nextStatus,
    updatedAt: new Date(),
    lastApprovalAt: FieldValue ? FieldValue.serverTimestamp() : new Date(),
  });
  const updated: any = (await doc.ref.get()).data();
  return { claim: updated as Claim, autoTransitioned, threshold, approvalsCount };
}

async function setClaimStatus(orgId: string, claimId: string, to: ClaimStatus): Promise<Claim | null> {
  if (!adminDb) return null;
  const snaps = await adminDb.collection('organizations').doc(orgId).collection('claims').where('id', '==', claimId).limit(1).get();
  if (snaps.empty) return null;
  await snaps.docs[0].ref.update({ status: to, updatedAt: new Date() });
  return (await snaps.docs[0].ref.get()).data() as any as Claim;
}

export const POST = v1Route({
  method: 'POST',
  scope: 'claims:manage',
  requireOrg: true,
  bodySchema: ClaimTransitionSchema,
  async handle({ auth, body, requestId, idempotencyKey }) {
    const organizationId = auth.organizationId!;
    const claimId = (body as any).claimId;
    const to = (body as any).to as ClaimStatus;
    const guardianId: string | undefined = (body as any).guardianId;
    const guardianApproved: boolean | undefined = (body as any).guardianApproved;
    const guardianProof = (body as any).guardianProof;
    let guardianApprovalRegistered = false;
    let autoTransitioned: ClaimStatus | null = null;
    let approvalsCount = 0;
    let threshold = 0;
    let updatedClaim: Claim | null = null;

    if (guardianId && typeof guardianApproved === 'boolean') {
      if (!guardianProof) {
        await securityEvents.increment(organizationId, 'guardian_identity_proof_missing', { claimId, guardianId });
        throw new ApiError(403, 'GUARDIAN_IDENTITY_PROOF_REQUIRED', 'Guardian identity proof required before approval');
      }
      const proofResult = await verifyGuardianProof({
        orgId: organizationId,
        guardianId,
        proof: guardianProof,
        callerFirebaseUid: callerFirebaseUid(auth),
        guardians,
        nonces: guardianNonces,
        walletVerifier,
        securityEvents,
        now: Date.now(),
      });
      if (!proofResult.ok) {
        throw new ApiError(403, (proofResult as any).code ?? 'GUARDIAN_IDENTITY_PROOF_REQUIRED', (proofResult as any).reason ?? 'Guardian proof invalid');
      }
      const quorum = await updateClaimWithGuardianApproval(
        organizationId, claimId, guardianId, !!guardianApproved, guardianProof.scheme,
      );
      updatedClaim = quorum.claim;
      autoTransitioned = quorum.autoTransitioned;
      approvalsCount = quorum.approvalsCount;
      threshold = quorum.threshold;
      guardianApprovalRegistered = true;
    } else {
      updatedClaim = await setClaimStatus(organizationId, claimId, to);
      if (!updatedClaim) throw new ApiError(404, 'CLAIM_NOT_FOUND', `Claim ${claimId} not found`);
    }

    await logV1Event(auth, guardianApprovalRegistered ? SystemEvent.CLAIM_GUARDIAN_APPROVAL : SystemEvent.CLAIM_TRANSITION, {
      claimId,
      to,
      guardianId,
      autoTransitioned,
    }, {
      requestId,
      resource: { type: 'claim', id: claimId },
    });

    const webhookEventType = autoTransitioned
      ? `claim.${String(autoTransitioned).toLowerCase()}`
      : guardianApprovalRegistered
        ? 'claim.guardian_approval'
        : 'claim.transition';
    const evt = makeWebhookDeliveryEvent(`evt_${genId('').slice(0, 16)}`, webhookEventType, organizationId, {
      claimId,
      to,
      from: (updatedClaim as any)?.status,
      guardianId,
      guardianApprovalRegistered,
      autoTransitioned,
      approvalsCount,
      threshold,
      claim: updatedClaim,
    }, { requestId, idempotencyKey: idempotencyKey ?? undefined, actor: actorFromAuth(auth) });
    await processWebhookEnqueue(organizationId, evt);

    return structuredJson({
      organizationId,
      claimId,
      transition: to,
      guardianId: guardianId ?? null,
      guardianApprovalRegistered,
      autoTransitioned: autoTransitioned ?? null,
      approvalsCount,
      threshold,
      idempotencyKey,
      audit: guardianApprovalRegistered ? 'GUARDIAN_APPROVAL_REGISTERED' : 'CLAIM_TRANSITION',
      webhookEvents: [
        webhookEventType,
        ...(autoTransitioned ? [`claim.${String(autoTransitioned).toLowerCase()}`] : []),
      ],
      claim: updatedClaim,
      requestId,
    });
  },
});
