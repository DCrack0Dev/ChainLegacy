import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { cache } from '@/lib/cache';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

import { GovernanceService } from '@/services/governance';

// Input Validation Schemas
const ActionSchema = z.enum(['verify-identity', 'approve-claim', 'verify-otp']);

const RequestSchema = z.object({
  id: z.string().min(20), // Firestore IDs are typically 20 chars
  action: ActionSchema,
  data: z.any().optional()
});

const IdentityDataSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  beneficiaryId: z.string().optional()
});

const ApprovalDataSchema = z.object({
  beneficiaryId: z.string(),
  signature: z.string().optional()
});

const OtpDataSchema = z.object({
  otp: z.string().length(6)
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate request structure
    const validation = RequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Invalid request format', 
        details: validation.error.format() 
      }, { status: 400 });
    }

    const { id, action, data } = validation.data;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Try cache first
    let userData = cache.get<any>(`user_${id}`);
    let vaultData = cache.get<any>(`vault_${id}`);

    let userDocRef: any = null;

    if (!userData || !vaultData) {
      // Parallelize DB reads for better performance
      const [userDoc, vaultDoc] = await Promise.all([
        adminDb.collection('users').doc(id).get(),
        adminDb.collection('vaults').doc(id).get()
      ]);
      
      if (!userDoc.exists || !vaultDoc.exists) {
        return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
      }

      userData = userDoc.data()!;
      vaultData = vaultDoc.data()!;
      userDocRef = userDoc.ref;

      // Cache for 30 seconds
      cache.set(`user_${id}`, userData, 30000);
      cache.set(`vault_${id}`, vaultData, 30000);
    } else {
      userDocRef = adminDb.collection('users').doc(id);
    }

    const mergedData = { ...userData, ...vaultData };

    if (mergedData.status !== 'triggered') {
      return NextResponse.json({ error: 'Vault not released yet' }, { status: 403 });
    }

    // --- STEP 1: IDENTITY VERIFICATION ---
    if (action === 'verify-identity') {
      const dataValidation = IdentityDataSchema.safeParse(data);
      if (!dataValidation.success) {
        return NextResponse.json({ error: 'Invalid identity data' }, { status: 400 });
      }

      const { name, email } = dataValidation.data;
      
      // Get the primary beneficiary
      const beneficiary = mergedData.beneficiary || 
                         mergedData.contacts?.find((c: any) => c.role === 'beneficiary') ||
                         (mergedData.beneficiaries && mergedData.beneficiaries[0]);

      if (!beneficiary) {
        return NextResponse.json({ error: 'No beneficiary assigned to this vault' }, { status: 404 });
      }

      const nameMatch = beneficiary.name?.trim().toLowerCase() === name?.trim().toLowerCase();
      const emailMatch = beneficiary.email?.trim().toLowerCase() === email?.trim().toLowerCase();

      if (!nameMatch || !emailMatch) {
        return NextResponse.json({ error: 'Identity verification failed' }, { status: 401 });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Identity verified',
        needsWallet: !!beneficiary.walletAddress
      });
    }

    // --- STEP 2: APPROVAL (Simplified for single beneficiary) ---
    if (action === 'approve-claim') {
      await userDocRef.update({
        claimApproved: true,
        claimApprovedAt: new Date()
      });
      // Invalidate cache
      cache.delete(`user_${id}`);

      return NextResponse.json({ 
        success: true, 
        consensusMet: true,
        message: 'Claim approved!'
      });
    }

    // --- STEP 3: OTP & RELEASE ---
    if (action === 'verify-otp') {
      const dataValidation = OtpDataSchema.safeParse(data);
      if (!dataValidation.success) {
        return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'Invalid OTP format' }, { status: 400 });
      }

      const { otp } = dataValidation.data;
      
      // Abuse Prevention
      if (userData.claimAttempts >= 5) {
        return NextResponse.json({ code: 'OTP_LOCKED', error: 'Vault locked due to too many failed OTP attempts' }, { status: 429 });
      }

      const OTP_TTL_MS = 15 * 60 * 1000;
      const otpCreatedAt = userData.otpCreatedAt ? Date.parse(userData.otpCreatedAt as string) : null;
      const nowTs = Date.now();
      if (!otpCreatedAt || Number.isNaN(otpCreatedAt)) {
        return NextResponse.json({ code: 'OTP_NOT_ISSUED', error: 'No OTP has been issued. Request OTP first at /api/claim/generate-otp' }, { status: 400 });
      }
      if (nowTs - otpCreatedAt > OTP_TTL_MS) {
        await userDocRef.update({
          lastClaimAttemptAt: new Date().toISOString(),
        });
        cache.delete(`user_${id}`);
        return NextResponse.json({ code: 'OTP_EXPIRED', error: 'OTP expired. Issue a new OTP and try again.' }, { status: 401 });
      }

      if (otp !== userData.otp) {
        await userDocRef.update({
          claimAttempts: (userData.claimAttempts || 0) + 1,
          lastClaimAttemptAt: new Date().toISOString()
        });
        cache.delete(`user_${id}`);
        return NextResponse.json({ code: 'OTP_INVALID', error: 'Invalid verification code' }, { status: 401 });
      }

      // Final release
      return NextResponse.json({
        code: 'OTP_VERIFIED',
        success: true,
        encryptedSecret: userData.encryptedSecret,
        encryptedMessage: userData.encryptedMessage,
        videoUrl: userData.videoUrl,
        personalPhrase: userData.personalPhrase,
        serverShare: userData.serverShare
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('[Claim API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
