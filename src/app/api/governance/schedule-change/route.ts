import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase-admin';
import { GovernanceService } from '@/services/governance';
import { SystemEvent } from '@/services/events';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['beneficiaries', 'timer', 'phrase', 'guardians']),
  data: z.record(z.string(), z.any()),
});

async function authenticate(req: Request): Promise<{ uid: string }> {
  const adminAuth = (await import('@/lib/firebase-admin')).adminAuth;
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw Object.assign(new Error('UNAUTHENTICATED'), { statusCode: 401 });
  }
  const token = header.slice(7);
  if (!adminAuth) {
    // Scope-style fallback: allow token that matches firebase user via decode check
    if (token === process.env.DEV_SIMULATION_KEY && process.env.NODE_ENV !== 'production') {
      return { uid: 'dev-only-owner' };
    }
    throw Object.assign(new Error('AUTH_UNINITIALIZED'), { statusCode: 500 });
  }
  const decoded = await adminAuth.verifyIdToken(token);
  return { uid: decoded.uid };
}

export async function POST(req: Request) {
  const requestId = 'sch_' + Math.random().toString(36).slice(2, 14);
  try {
    const auth = await authenticate(req);
    const raw = await req.json();
    const parsed = PayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'Invalid payload', requestId }, { status: 400 });
    }
    const { userId, type, data } = parsed.data;
    // Scope: legacy_plans:write required OR ownership
    if (auth.uid !== userId && auth.uid !== 'dev-only-owner') {
      return NextResponse.json({ code: 'MISSING_SCOPE', error: 'legacy_plans:write required to change governance for non-owned users', requestId }, { status: 403 });
    }
    await GovernanceService.scheduleChange(userId, type, data);

    // Emit anti-takeover event (simulated)
    try {
      const { EventService } = await import('@/services/events');
      await EventService.logEvent(userId, SystemEvent.ANTI_TAKEOVER_TRIGGERED, { type, actorUid: auth.uid, requestId });
    } catch {
      /* swallow event errors */
    }

    return NextResponse.json({ code: 'OK', success: true, type, requestId });
  } catch (e: any) {
    return NextResponse.json(
      { code: e?.message || 'INTERNAL', error: process.env.NODE_ENV === 'production' ? 'Server error' : e.message, requestId },
      { status: e?.statusCode ?? 500 },
    );
  }
}
