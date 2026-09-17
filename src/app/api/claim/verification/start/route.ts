import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { startIdentityVerification } from '@/services/enterprise/domain-model';
import { getMockIdentityProvider } from '@/services/enterprise/identity-verification';
import { ApiError } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

const StartVerificationSchema = z.object({
  customerId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = StartVerificationSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ 
        code: 'VALIDATION_ERROR', 
        error: 'Invalid payload', 
        details: parsed.error.format() 
      }, { status: 400 });
    }

    const { customerId } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ code: 'DB_DOWN', error: 'Database not initialized' }, { status: 500 });
    }

    const orgId = 'org_legacy_migration';
    const provider = getMockIdentityProvider();
    const result = await startIdentityVerification(orgId, customerId, provider);

    return NextResponse.json({
      code: 'VERIFICATION_STARTED',
      customerId,
      verificationId: result.verificationId,
      status: result.status,
      provider: result.provider,
      message: 'Identity verification started. Check status with provider.',
    });

  } catch (error: any) {
    console.error('[Start Verification] Error:', error);
    
    if (error instanceof ApiError) {
      return NextResponse.json({ 
        code: error.code, 
        error: error.message,
        details: error.details 
      }, { status: error.statusCode });
    }
    
    return NextResponse.json({ code: 'INTERNAL', error: 'Internal Server Error' }, { status: 500 });
  }
}