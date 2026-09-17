import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { cache } from '@/lib/cache';
import { z } from 'zod';
import { authorizeClaim, validateClaimForAuthorization, requireIdentityVerifiedForClaim, verifyOtpForClaim, checkGuardianQuorum, getNextRequiredAction, transitionClaimToVerification } from '@/services/enterprise/claim-authorization';
import { getCustomerInOrg, getVaultInOrg, getLegacyPlanInOrg, assertPlanRelationship } from '@/services/enterprise/domain-model';
import { ApiError } from '@/lib/api-errors';
import { IdentityVerificationStatus } from '@/types/enterprise';

export const dynamic = 'force-dynamic';

const ActionSchema = z.enum(['verify-identity', 'verify-otp', 'guardian-approval', 'authorize', 'get-status']);

const RequestSchema = z.object({
  customerId: z.string().min(1),
  action: ActionSchema,
  data: z.any().optional(),
});

const IdentityDataSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  beneficiaryId: z.string().optional(),
});

const OtpDataSchema = z.object({
  otp: z.string().length(6),
});

const GuardianApprovalSchema = z.object({
  guardianId: z.string(),
  approved: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const validation = RequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Invalid request format', 
        details: validation.error.format() 
      }, { status: 400 });
    }

    const { customerId, action, data } = validation.data;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const orgId = 'org_legacy_migration';

    let customer, plan, vault, claim;

    try {
      customer = await getCustomerInOrg(orgId, customerId);
    } catch (e) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (!customer.vaultId) {
      return NextResponse.json({ error: 'Customer has no vault' }, { status: 404 });
    }

    try {
      vault = await getVaultInOrg(orgId, customer.vaultId);
    } catch (e) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    const planSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('legacyPlans')
      .where('customerId', '==', customerId)
      .limit(1)
      .get();

    if (planSnap.empty) {
      return NextResponse.json({ error: 'No legacy plan found' }, { status: 404 });
    }

    const planId = planSnap.docs[0].id;
    plan = { id: planId, ...planSnap.docs[0].data() } as any;
    assertPlanRelationship(plan, customer, vault);

    const claimSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('claims')
      .where('customerId', '==', customerId)
      .where('legacyPlanId', '==', planId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (claimSnap.empty) {
      const claimId = `claim_${Date.now()}`;
      const now = new Date();
      claim = {
        id: claimId,
        organizationId: orgId,
        customerId,
        legacyPlanId: planId,
        status: 'pending',
        initiator: 'beneficiary',
        guardianApprovals: {},
        transitions: [{ from: '', to: 'pending', at: now, actor: 'beneficiary' }],
        createdAt: now,
        updatedAt: now,
      };
      
      await adminDb
        .collection('organizations').doc(orgId)
        .collection('claims').doc(claimId).set(claim);
    } else {
      claim = { id: claimSnap.docs[0].id, ...claimSnap.docs[0].data() } as any;
    }

    const context = { claim, plan, customer, vault };

    switch (action) {
      case 'verify-identity': {
        const dataValidation = IdentityDataSchema.safeParse(data);
        if (!dataValidation.success) {
          return NextResponse.json({ error: 'Invalid identity data' }, { status: 400 });
        }

        const { name, email, beneficiaryId } = dataValidation.data;

        const benSnap = await adminDb
          .collection('organizations').doc(orgId)
          .collection('beneficiaries')
          .where('customerId', '==', customerId)
          .where('email', '==', email)
          .limit(1)
          .get();

        if (benSnap.empty) {
          return NextResponse.json({ error: 'No matching beneficiary found' }, { status: 404 });
        }

        const beneficiary = benSnap.docs[0].data();
        const nameMatch = beneficiary.name?.trim().toLowerCase() === name?.trim().toLowerCase();

        if (!nameMatch) {
          return NextResponse.json({ error: 'Identity verification failed' }, { status: 401 });
        }

        const nextAction = await getNextRequiredAction(claim, plan, customer);
        
        if (nextAction.action === 'identity_verification') {
          try {
            await requireIdentityVerifiedForClaim(customer);
            const updatedClaim = await transitionClaimToVerification(claim);
            
            await adminDb
              .collection('organizations').doc(orgId)
              .collection('claims').doc(claim.id)
              .update({ 
                status: updatedClaim.status, 
                transitions: updatedClaim.transitions,
                updatedAt: new Date(),
              });

            return NextResponse.json({ 
              success: true, 
              message: 'Identity verified. Proceed to OTP verification.',
              nextStep: 'verify-otp',
              needsWallet: !!beneficiary.walletAddress,
            });
          } catch (e: any) {
            if (e.code === 'IDENTITY_NOT_VERIFIED') {
              return NextResponse.json({ 
                error: 'Identity verification requires server verification',
                nextStep: 'start-verification',
                verificationStatus: customer.verificationStatus,
              }, { status: 403 });
            }
            throw e;
          }
        }

        return NextResponse.json({ 
          success: true, 
          message: 'Identity verified',
          nextStep: nextAction.action,
        });
      }

      case 'verify-otp': {
        const dataValidation = OtpDataSchema.safeParse(data);
        if (!dataValidation.success) {
          return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'Invalid OTP format' }, { status: 400 });
        }

        const { otp } = dataValidation.data;

        const userDoc = await adminDb
          .collection('organizations').doc(orgId)
          .collection('customers').doc(customerId).get();
        
        const userData = userDoc.data() || {};
        const storedOtp = userData.otp;
        const otpCreatedAt = userData.otpCreatedAt;

        const otpResult = await verifyOtpForClaim(claim, otp, storedOtp, otpCreatedAt);

        if (!otpResult.verified) {
          await userDoc.ref.update({
            claimAttempts: (userData.claimAttempts || 0) + 1,
            lastClaimAttemptAt: new Date().toISOString(),
          });
          return NextResponse.json({ code: 'OTP_INVALID', error: otpResult.error }, { status: 401 });
        }

        await userDoc.ref.update({
          claimAttempts: 0,
          lastClaimAttemptAt: FieldValue.delete(),
        });

        const authResult = await authorizeClaim(context, true, false);
        
        await adminDb
          .collection('organizations').doc(orgId)
          .collection('claims').doc(claim.id)
          .update({ 
            status: authResult.claim.status, 
            transitions: authResult.claim.transitions,
            updatedAt: new Date(),
          });

        const nextAction = await getNextRequiredAction(authResult.claim, plan, customer);
        
        return NextResponse.json({ 
          success: true, 
          message: 'OTP verified',
          nextStep: nextAction.action,
          claimStatus: authResult.claim.status,
        });
      }

      case 'guardian-approval': {
        const dataValidation = GuardianApprovalSchema.safeParse(data);
        if (!dataValidation.success) {
          return NextResponse.json({ error: 'Invalid guardian approval data' }, { status: 400 });
        }

        const { guardianId, approved } = dataValidation.data;

        const existingApprovals = claim.guardianApprovals || {};
        if (approved) {
          existingApprovals[guardianId] = { approved: true, at: Date.now() };
        } else {
          delete existingApprovals[guardianId];
        }

        const approvalsCount = Object.values(existingApprovals).filter(Boolean).length;
        const quorum = Math.max(1, plan.guardianQuorum || 0);
        const quorumMet = approvalsCount >= quorum;

        await adminDb
          .collection('organizations').doc(orgId)
          .collection('claims').doc(claim.id)
          .update({ 
            guardianApprovals: existingApprovals, 
            approvalsCount, 
            updatedAt: new Date() });

        let updatedClaim = { ...claim, guardianApprovals: existingApprovals, approvalsCount, updatedAt: new Date() };

        if (quorumMet && claim.status === 'guardian_review') {
          updatedClaim = await transitionClaimToVerification(updatedClaim);
          const authResult = await authorizeClaim({ ...context, claim: updatedClaim }, true, true);
          updatedClaim = authResult.claim;
          
          await adminDb
            .collection('organizations').doc(orgId)
            .collection('claims').doc(claim.id)
            .update({ 
              status: updatedClaim.status, 
              transitions: updatedClaim.transitions,
              updatedAt: new Date(),
            });
        }

        return NextResponse.json({ 
          success: true, 
          quorumMet, 
          approvalsCount, 
          threshold: quorum,
          nextStep: quorumMet ? 'grace_period' : 'guardian_approval',
          claimStatus: updatedClaim.status,
        });
      }

      case 'authorize': {
        const nextAction = await getNextRequiredAction(claim, plan, customer);
        
        if (nextAction.action !== 'release') {
          return NextResponse.json({ 
            error: 'Claim not ready for authorization', 
            reason: nextAction.reason,
            nextStep: nextAction.action,
          }, { status: 400 });
        }

        const authResult = await authorizeClaim(context, true, true);
        
        await adminDb
          .collection('organizations').doc(orgId)
          .collection('claims').doc(claim.id)
          .update({ 
            status: authResult.claim.status, 
            transitions: authResult.claim.transitions,
            completedAt: authResult.claim.completedAt,
            updatedAt: new Date(),
          });

        if (authResult.legacyMaterial) {
          return NextResponse.json({
            code: 'AUTHORIZED',
            success: true,
            legacyMaterial: authResult.legacyMaterial,
          });
        }

        return NextResponse.json({ 
          success: false, 
          claimStatus: authResult.claim.status,
          nextStep: 'release',
        });
      }

      case 'get-status': {
        const nextAction = await getNextRequiredAction(claim, plan, customer);
        return NextResponse.json({
          claim: {
            id: claim.id,
            status: claim.status,
            guardianApprovals: claim.guardianApprovals,
            approvalsCount: Object.values(claim.guardianApprovals || {}).filter(Boolean).length,
            guardianQuorum: plan.guardianQuorum || 0,
          },
          customerVerificationStatus: customer.verificationStatus,
          nextAction,
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('[Enterprise Claim API] Error:', error);
    
    if (error instanceof ApiError) {
      return NextResponse.json({ 
        code: error.code, 
        error: error.message,
        details: error.details 
      }, { status: error.statusCode });
    }
    
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}