import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const GenerateOtpSchema = z.object({
  customerId: z.string().min(1),
  reason: z.enum(['triggered', 'preview', 'admin-reset']).default('triggered'),
});

const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_DIGITS = 6;

export async function POST(request: Request) {
  const requestId =
    (globalThis as any).crypto?.randomUUID?.() ??
    'req_' + Math.random().toString(36).slice(2, 14);
  
  try {
    const body = await request.json();
    const parsed = GenerateOtpSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', error: 'Invalid payload', details: parsed.error.format(), requestId },
        { status: 400 },
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { code: 'DB_DOWN', error: 'Database not initialized', requestId },
        { status: 500 },
      );
    }

    const { customerId, reason } = parsed.data;
    const orgId = 'org_legacy_migration';

    const customerSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('customers').doc(customerId).get();

    if (!customerSnap.exists) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'Customer not found', requestId }, { status: 404 });
    }

    const customer = customerSnap.data()!;
    
    if (!customer.vaultId) {
      return NextResponse.json({ code: 'NO_VAULT', error: 'Customer has no vault', requestId }, { status: 404 });
    }

    const vaultSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('vaults').doc(customer.vaultId).get();

    if (!vaultSnap.exists) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'Vault not found', requestId }, { status: 404 });
    }

    const vault = vaultSnap.data()!;
    
    const planSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('legacyPlans')
      .where('customerId', '==', customerId)
      .limit(1)
      .get();

    if (planSnap.empty) {
      return NextResponse.json({ code: 'NO_PLAN', error: 'No legacy plan found', requestId }, { status: 404 });
    }

    const plan = planSnap.docs[0].data()!;
    const statusOk = reason === 'preview' || reason === 'admin-reset' || vault.status === 'triggered';
    
    if (!statusOk) {
      return NextResponse.json(
        { code: 'NOT_TRIGGERED', error: 'Vault status must be "triggered" to issue an OTP', requestId },
        { status: 409 },
      );
    }

    const otpRaw = (crypto as any).getRandomValues
      ? (crypto as any).getRandomValues(new Uint32Array(1))[0] % 1_000_000
      : Math.floor(Math.random() * 1_000_000);
    
    const otp = String(otpRaw).padStart(OTP_DIGITS, '0');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    const customerRef = adminDb.collection('organizations').doc(orgId).collection('customers').doc(customerId);
    await customerRef.set(
      {
        otp,
        otpCreatedAt: now.toISOString(),
        otpExpiresAt: expiresAt.toISOString(),
        claimAttempts: 0,
        lastClaimAttemptAt: FieldValue.delete(),
        updatedAt: now.toISOString(),
      },
      { merge: true },
    );

    console.log(
      `[API][${requestId}] OTP issued customer=${customerId} reason=${reason} expiresAt=${expiresAt.toISOString()}`,
    );

    const deliveryMode = (() => {
      if (process.env.SENDGRID_API_KEY) return 'EMAIL_DISPATCHED';
      if (reason === 'preview' || reason === 'admin-reset') return 'PREVIEW_MODE';
      return 'NO_EMAIL_PROVIDER';
    })();

    const includeOtpInResponse = (reason === 'preview' || reason === 'admin-reset') && process.env.NODE_ENV !== 'production';

    return NextResponse.json({
      code: 'OTP_ISSUED',
      message: deliveryMode === 'EMAIL_DISPATCHED'
        ? 'OTP issued. 15-minute TTL. Delivered to email on file.'
        : deliveryMode === 'PREVIEW_MODE'
          ? (includeOtpInResponse ? 'Preview mode: OTP returned below for local testing. Do NOT rely on this in production.' : 'Preview mode. OTP delivered through configured channel or preview interface.')
          : 'OTP issued. Email delivery not configured; use preview or configure SENDGRID_API_KEY.',
      ...(includeOtpInResponse ? { otp } : {}),
      expiresAt: expiresAt.toISOString(),
      digits: OTP_DIGITS,
      deliveryStatus: deliveryMode,
      requestId,
    });

  } catch (e: any) {
    return NextResponse.json(
      { code: 'INTERNAL', error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : e.message, requestId },
      { status: 500 },
    );
  }
}