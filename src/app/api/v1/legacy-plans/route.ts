import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListPlansSchema = z.object({
  customerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ListPlansSchema.safeParse(Object.fromEntries(searchParams));
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.format() }, { status: 400 });
    }

    const { customerId, limit, offset } = parsed.data;
    const orgId = 'org_legacy_migration';

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    let query = db
      .collection('organizations').doc(orgId)
      .collection('legacyPlans')
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc');

    if (customerId) query = query.where('customerId', '==', customerId);

    const snap = await query.limit(limit + 1).offset(offset).get();
    const plans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const hasMore = plans.length > limit;
    const items = hasMore ? plans.slice(0, limit) : plans;

    return NextResponse.json({
      data: items,
      meta: { limit, offset, hasMore, total: items.length + offset },
    });

  } catch (error: any) {
    console.error('[Enterprise Legacy Plans List] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const CreatePlanSchema = z.object({
  customerId: z.string().min(1),
  vaultId: z.string().optional(),
  name: z.string().min(1).default('Legacy Plan'),
  intervalDays: z.coerce.number().int().min(1).max(365).default(30),
  guardianQuorum: z.coerce.number().int().min(0).max(10).default(0),
  walletSignatureRequired: z.boolean().default(false),
  encryptionConfig: z.object({
    algorithm: z.literal('AES-256-GCM').default('AES-256-GCM'),
    kdf: z.string().default('argon2id'),
    shamirThreshold: z.number().int().min(0).default(0),
    shamirShares: z.number().int().min(0).default(0),
  }).default({ algorithm: 'AES-256-GCM', kdf: 'argon2id', shamirThreshold: 0, shamirShares: 0 }),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreatePlanSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const orgId = 'org_legacy_migration';
    const { customerId, vaultId, name, intervalDays, guardianQuorum, walletSignatureRequired, encryptionConfig } = parsed.data;

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

    const customer = customerSnap.data()!;

    // Determine vaultId
    let finalVaultId = vaultId;
    if (!finalVaultId) {
      finalVaultId = customer.vaultId;
    }
    if (!finalVaultId) {
      return NextResponse.json({ error: 'Customer has no vault. Create vault first or provide vaultId.' }, { status: 400 });
    }

    // Verify vault exists and belongs to customer
    const vaultSnap = await db
      .collection('organizations').doc(orgId)
      .collection('vaults').doc(finalVaultId).get();

    if (!vaultSnap.exists || vaultSnap.data()!.customerId !== customerId) {
      return NextResponse.json({ error: 'Vault not found or does not belong to customer' }, { status: 404 });
    }

    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const plan = {
      id: planId,
      organizationId: orgId,
      customerId,
      vaultId: finalVaultId,
      name,
      intervalDays,
      guardianQuorum,
      walletSignatureRequired,
      encryptionConfig,
      status: 'draft',
      suspicionScore: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .collection('organizations').doc(orgId)
      .collection('legacyPlans').doc(planId).set(plan);

    return NextResponse.json({ plan }, { status: 201 });

  } catch (error: any) {
    console.error('[Enterprise Legacy Plan Create] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}