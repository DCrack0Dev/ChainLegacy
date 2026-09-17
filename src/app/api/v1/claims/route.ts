import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListClaimsSchema = z.object({
  customerId: z.string().optional(),
  legacyPlanId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ListClaimsSchema.safeParse(Object.fromEntries(searchParams));
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.format() }, { status: 400 });
    }

    const { customerId, legacyPlanId, status, limit, offset } = parsed.data;
    const orgId = 'org_legacy_migration';

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    let query = db
      .collection('organizations').doc(orgId)
      .collection('claims')
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc');

    if (customerId) query = query.where('customerId', '==', customerId);
    if (legacyPlanId) query = query.where('legacyPlanId', '==', legacyPlanId);
    if (status) query = query.where('status', '==', status);

    const snap = await query.limit(limit + 1).offset(offset).get();
    const claims = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const hasMore = claims.length > limit;
    const items = hasMore ? claims.slice(0, limit) : claims;

    return NextResponse.json({
      data: items,
      meta: { limit, offset, hasMore, total: items.length + offset },
    });

  } catch (error: any) {
    console.error('[Enterprise Claims List] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const CreateClaimSchema = z.object({
  customerId: z.string().min(1),
  legacyPlanId: z.string().min(1),
  initiator: z.string().min(1),
  reason: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateClaimSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const orgId = 'org_legacy_migration';
    const { customerId, legacyPlanId, initiator, reason } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    // Verify customer exists
    const customerSnap = await db
      .collection('organizations').doc(orgId)
      .collection('customers').doc(customerId).get();

    if (!customerSnap.exists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Verify legacy plan exists and belongs to customer
    const planSnap = await db
      .collection('organizations').doc(orgId)
      .collection('legacyPlans').doc(legacyPlanId).get();

    if (!planSnap.exists || planSnap.data()!.customerId !== customerId) {
      return NextResponse.json({ error: 'Legacy plan not found or does not belong to customer' }, { status: 404 });
    }

    const claimId = `claim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const claim = {
      id: claimId,
      organizationId: orgId,
      customerId,
      legacyPlanId,
      status: 'pending',
      initiator,
      reason,
      guardianApprovals: {},
      transitions: [{ from: '', to: 'pending', at: now, actor: initiator }],
      createdAt: now,
      updatedAt: now,
    };

    await db
      .collection('organizations').doc(orgId)
      .collection('claims').doc(claimId).set(claim);

    return NextResponse.json({ claim }, { status: 201 });

  } catch (error: any) {
    console.error('[Enterprise Claim Create] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}