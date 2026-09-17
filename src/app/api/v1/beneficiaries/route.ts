import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListBeneficiariesSchema = z.object({
  customerId: z.string().optional(),
  legacyPlanId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ListBeneficiariesSchema.safeParse(Object.fromEntries(searchParams));
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.format() }, { status: 400 });
    }

    const { customerId, legacyPlanId, limit, offset } = parsed.data;
    const orgId = 'org_legacy_migration';

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    let query = db
      .collection('organizations').doc(orgId)
      .collection('beneficiaries')
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc');

    if (customerId) query = query.where('customerId', '==', customerId);
    if (legacyPlanId) query = query.where('legacyPlanId', '==', legacyPlanId);

    const snap = await query.limit(limit + 1).offset(offset).get();
    const beneficiaries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const hasMore = beneficiaries.length > limit;
    const items = hasMore ? beneficiaries.slice(0, limit) : beneficiaries;

    return NextResponse.json({
      data: items,
      meta: { limit, offset, hasMore, total: items.length + offset },
    });

  } catch (error: any) {
    console.error('[Enterprise Beneficiaries List] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const CreateBeneficiarySchema = z.object({
  customerId: z.string().min(1),
  legacyPlanId: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  walletAddress: z.string().optional(),
  share: z.number().int().min(1).max(100).default(100),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateBeneficiarySchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const orgId = 'org_legacy_migration';
    const { customerId, legacyPlanId, name, email, phone, walletAddress, share } = parsed.data;

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

    // If legacyPlanId provided, verify it belongs to customer
    if (legacyPlanId) {
      const planSnap = await db
        .collection('organizations').doc(orgId)
        .collection('legacyPlans').doc(legacyPlanId).get();

      if (!planSnap.exists || planSnap.data()!.customerId !== customerId) {
        return NextResponse.json({ error: 'Legacy plan not found or does not belong to customer' }, { status: 404 });
      }
    }

    // Check share total doesn't exceed 100
    const existingSnap = await db
      .collection('organizations').doc(orgId)
      .collection('beneficiaries')
      .where('customerId', '==', customerId)
      .get();

    let totalShare = share;
    existingSnap.docs.forEach(doc => {
      totalShare += doc.data().share || 0;
    });
    if (totalShare > 100) {
      return NextResponse.json({ error: `Total beneficiary shares would exceed 100% (current: ${totalShare - share}%, adding: ${share}%)` }, { status: 400 });
    }

    const beneficiaryId = `ben_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const beneficiary = {
      id: beneficiaryId,
      organizationId: orgId,
      customerId,
      legacyPlanId: legacyPlanId ?? null,
      name,
      email,
      phone,
      walletAddress,
      share,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .collection('organizations').doc(orgId)
      .collection('beneficiaries').doc(beneficiaryId).set(beneficiary);

    return NextResponse.json({ beneficiary }, { status: 201 });

  } catch (error: any) {
    console.error('[Enterprise Beneficiary Create] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}