import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListLivenessSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ListLivenessSchema.safeParse(Object.fromEntries(searchParams));
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.format() }, { status: 400 });
    }

    const { limit, offset, status } = parsed.data;
    const orgId = 'org_legacy_migration';

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    let query = db
      .collection('organizations').doc(orgId)
      .collection('legacyPlans')
      .where('organizationId', '==', orgId)
      .orderBy('updatedAt', 'desc');

    if (status) query = query.where('status', '==', status);

    const snap = await query.limit(limit + 1).offset(offset).get();
    const plans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const hasMore = plans.length > limit;
    const items = hasMore ? plans.slice(0, limit) : plans;

    return NextResponse.json({
      data: items,
      meta: { limit, offset, hasMore, total: items.length + offset },
    });

  } catch (error: any) {
    console.error('[Enterprise Liveness List] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const ResetLivenessSchema = z.object({
  legacyPlanId: z.string().min(1),
  reason: z.string().optional(),
  actor: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ResetLivenessSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const orgId = 'org_legacy_migration';
    const { legacyPlanId, reason, actor } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    const planSnap = await db
      .collection('organizations').doc(orgId)
      .collection('legacyPlans').doc(legacyPlanId).get();

    if (!planSnap.exists) {
      return NextResponse.json({ error: 'Legacy plan not found' }, { status: 404 });
    }

    const plan = planSnap.data()!;
    const now = new Date();

    // Reset liveness - update lastCheckInAt to now, reset status to active
    await db
      .collection('organizations').doc(orgId)
      .collection('legacyPlans').doc(legacyPlanId).update({
        lastCheckInAt: now,
        nextEscalationAt: new Date(now.getTime() + (plan.intervalDays || 30) * 24 * 60 * 60 * 1000),
        status: 'active',
        suspicionScore: 0,
        updatedAt: now,
      });

    // Create liveness reset record
    const resetId = `lvr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db
      .collection('organizations').doc(orgId)
      .collection('livenessResets').doc(resetId).set({
        id: resetId,
        organizationId: orgId,
        legacyPlanId,
        reason: reason || 'Manual reset',
        actor: actor || 'admin',
        createdAt: now,
      });

    return NextResponse.json({ success: true, message: 'Liveness reset successful' });

  } catch (error: any) {
    console.error('[Enterprise Liveness Reset] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}