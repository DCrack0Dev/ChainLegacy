import { v1Route, structuredJson } from '@/lib/v1-route';
import { ApiError } from '@/lib/api-errors';
import { Claim, ClaimStatus, LegacyPlan, Customer, Vault } from '@/types/enterprise';
import { authorizeClaim, validateClaimForAuthorization, requireIdentityVerifiedForClaim, getNextRequiredAction, transitionClaimToVerification } from '@/services/enterprise/claim-authorization';
import { assertPlanRelationship, getCustomerInOrg, getVaultInOrg, getLegacyPlanInOrg } from '@/services/enterprise/domain-model';
import { SystemEvent } from '@/services/events';
import { logV1Event, genId, processWebhookEnqueue, makeWebhookDeliveryEvent, writeEntity } from '@/services/enterprise/v1-helpers';
import { adminDb, FieldValue } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

async function loadClaimContext(organizationId: string, claimId: string): Promise<{ claim: Claim; plan: LegacyPlan; customer: Customer; vault: Vault }> {
  if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
  const db = adminDb;

  const claimSnap = await db
    .collection('organizations').doc(organizationId)
    .collection('claims').where('id', '==', claimId).limit(1).get();

  if (claimSnap.empty) {
    throw new ApiError(404, 'CLAIM_NOT_FOUND', `Claim ${claimId} not found`);
  }

  const claim = claimSnap.docs[0].data() as Claim;
  const plan = await getLegacyPlanInOrg(organizationId, claim.legacyPlanId);
  const customer = await getCustomerInOrg(organizationId, claim.customerId);
  const vault = await getVaultInOrg(organizationId, plan.vaultId!);

  assertPlanRelationship(plan, customer, vault);

  return { claim, plan, customer, vault };
}

export const POST = v1Route({
  method: 'POST',
  scope: 'claims:manage',
  requireOrg: true,
  async handle({ auth, body, requestId, idempotencyKey }) {
    const organizationId = auth.organizationId!;
    const claimId = (body as any)?.claimId as string | undefined;
    const action = (body as any)?.action as 'start_verification' | 'verify_otp' | 'check_guardian_quorum' | 'authorize' | 'get_status' | undefined;
    const otp = (body as any)?.otp as string | undefined;
    const guardianId = (body as any)?.guardianId as string | undefined;
    const guardianApproved = (body as any)?.guardianApproved as boolean | undefined;

    if (!claimId) throw new ApiError(400, 'CLAIM_ID_MISSING', 'claimId is required');
    if (!action) throw new ApiError(400, 'ACTION_MISSING', 'action is required');

    const context = await loadClaimContext(organizationId, claimId);
    const { claim, plan, customer, vault } = context;

    await validateClaimForAuthorization(claim, plan, customer);

    let result: any = {};
    let updatedClaim = claim;

    switch (action) {
      case 'start_verification': {
        await requireIdentityVerifiedForClaim(customer);
        updatedClaim = await transitionClaimToVerification(claim);
        result = { claim: updatedClaim, nextStep: 'otp_verification' };
        break;
      }

      case 'verify_otp': {
        if (!otp) throw new ApiError(400, 'OTP_MISSING', 'otp is required for verify_otp action');

        if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
        const userDoc = await adminDb.collection('organizations').doc(organizationId).collection('customers').doc(customer.id).get();
        const userData = userDoc.data() || {};
        const storedOtp = userData.otp;
        const otpCreatedAt = userData.otpCreatedAt;

        const otpResult = await authorizeClaim(
          context,
          otp === storedOtp && storedOtp && otpCreatedAt && (Date.now() - new Date(otpCreatedAt).getTime() < 15 * 60 * 1000),
          false
        );

        if (!otpResult.authorized && otpResult.error === 'OTP verification required') {
          throw new ApiError(401, 'OTP_INVALID', 'Invalid or expired OTP');
        }

        updatedClaim = otpResult.claim;
        result = { claim: updatedClaim, nextStep: plan.guardianQuorum > 0 ? 'guardian_approval' : 'grace_period' };
        break;
      }

      case 'check_guardian_quorum': {
        if (!guardianId || typeof guardianApproved !== 'boolean') {
          throw new ApiError(400, 'GUARDIAN_DATA_MISSING', 'guardianId and guardianApproved are required');
        }

        if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
        const claimSnap = await adminDb
          .collection('organizations').doc(organizationId)
          .collection('claims').where('id', '==', claimId).limit(1).get();

        const existingApprovals = (claim as any).guardianApprovals || {};
        if (guardianApproved) {
          existingApprovals[guardianId] = { approved: true, at: Date.now() };
        } else {
          delete existingApprovals[guardianId];
        }

        const approvalsCount = Object.values(existingApprovals).filter(Boolean).length;
        const quorum = Math.max(1, plan.guardianQuorum || 0);
        const quorumMet = approvalsCount >= quorum;

        await adminDb
          .collection('organizations').doc(organizationId)
          .collection('claims').doc(claimSnap.docs[0].id)
          .update({ guardianApprovals: existingApprovals, approvalsCount, updatedAt: new Date() });

        updatedClaim = { ...claim, guardianApprovals: existingApprovals, approvalsCount, updatedAt: new Date() } as Claim;

        if (quorumMet && claim.status === ClaimStatus.GUARDIAN_REVIEW) {
          updatedClaim = await transitionClaimToVerification(updatedClaim);
          const authResult = await authorizeClaim({ ...context, claim: updatedClaim }, true, true);
          updatedClaim = authResult.claim;
        }

        result = { claim: updatedClaim, quorumMet, approvalsCount, threshold: quorum, nextStep: quorumMet ? 'grace_period' : 'guardian_approval' };
        break;
      }

      case 'authorize': {
        const nextAction = await getNextRequiredAction(claim, plan, customer);
        if (nextAction.action !== 'release') {
          throw new ApiError(400, 'CLAIM_NOT_READY', `Claim not ready for authorization: ${nextAction.reason}`);
        }

        const authResult = await authorizeClaim(context, true, true);
        updatedClaim = authResult.claim;

        if (authResult.legacyMaterial) {
          result = { authorized: true, legacyMaterial: authResult.legacyMaterial };
        } else {
          result = { authorized: false, claim: updatedClaim, nextStep: 'release' };
        }
        break;
      }

      case 'get_status': {
        const nextAction = await getNextRequiredAction(claim, plan, customer);
        result = { claim, nextAction, customerVerificationStatus: customer.verificationStatus };
        break;
      }

      default:
        throw new ApiError(400, 'INVALID_ACTION', `Unknown action: ${action}`);
    }

    await logV1Event(auth, SystemEvent.CLAIM_TRANSITION, { claimId, action, result }, { requestId, resource: { type: 'claim', id: claimId } });

    const evt = makeWebhookDeliveryEvent(`evt_${genId('').slice(0, 16)}`, `claim.${action}`, organizationId, { claimId, action, result }, { requestId, idempotencyKey: idempotencyKey ?? undefined, actor: auth.actorId });
    await processWebhookEnqueue(organizationId, evt);

    return structuredJson({ claimId, action, ...result, requestId });
  },
});