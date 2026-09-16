import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BillingService } from '@/services/billing';
import { adminDb } from '@/lib/firebase-admin';
import { SystemEvent } from '@/services/events';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  token: z.string().min(1),
  amountInCents: z.number().int().min(0).optional(),
  tierId: z.string().min(1),
  userId: z.string().min(1),
});

async function authenticate(req: Request): Promise<{ uid: string; scope: Set<string> }> {
  const { adminAuth } = await import('@/lib/firebase-admin');
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) throw Object.assign(new Error('UNAUTHENTICATED'), { statusCode: 401 });
  const tok = header.slice(7);
  if (!adminAuth) {
    if (tok === process.env.DEV_SIMULATION_KEY && process.env.NODE_ENV !== 'production') {
      return { uid: 'dev-only-owner', scope: new Set(['billing:write']) };
    }
    throw Object.assign(new Error('AUTH_UNINITIALIZED'), { statusCode: 500 });
  }
  const d = await adminAuth.verifyIdToken(tok);
  return { uid: d.uid, scope: new Set(['billing:write']) };
}

export async function POST(req: Request) {
  const requestId = 'bch_' + Math.random().toString(36).slice(2, 14);
  try {
    const auth = await authenticate(req);
    if (!auth.scope.has('billing:write')) {
      return NextResponse.json({ code: 'MISSING_SCOPE', error: 'billing:write required', requestId }, { status: 403 });
    }
    const raw = await req.json();
    const parsed = PayloadSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'Invalid payload', requestId }, { status: 400 });
    const { token, amountInCents, tierId, userId } = parsed.data;
    const charge = await BillingService.createCharge(token, amountInCents || 0, 'ZAR', { userId, plan: tierId });
    if (charge.status === 'successful') {
      if (adminDb) {
        await adminDb.collection('users').doc(userId).update({
          plan: tierId,
          isPro: tierId !== 'free',
          planStatus: 'active',
          lastPaymentDate: new Date(),
          simulatedPaymentId: charge.id,
          updatedAt: new Date().toISOString(),
        });
      }
      try {
        const { EventService } = await import('@/services/events');
        await EventService.logEvent(userId, SystemEvent.BILLING_CHARGE_ATTEMPTED, { tierId, amountInCents, chargeId: charge.id, requestId, status: charge.status });
      } catch {
        /* swallow */
      }
      return NextResponse.json({ code: 'OK', success: true, chargeId: charge.id, requestId });
    }
    return NextResponse.json({ code: 'CHARGE_FAILED', error: 'Payment status: ' + charge.status, requestId }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { code: e?.message || 'INTERNAL', error: process.env.NODE_ENV === 'production' ? 'Server error' : e.message, requestId },
      { status: e?.statusCode ?? 500 },
    );
  }
}
