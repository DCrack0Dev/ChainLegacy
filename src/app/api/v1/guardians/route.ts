import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListGuardiansSchema = z.object({
  customerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ListGuardiansSchema.safeParse(Object.fromEntries(searchParams));
    
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
      .collection('guardians')
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc');

    if (customerId) query = query.where('customerId', '==', customerId);

    const snap = await query.limit(limit + 1).offset(offset).get();
    const guardians = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const hasMore = guardians.length > limit;
    const items = hasMore ? guardians.slice(0, limit) : guardians;

    return NextResponse.json({
      data: items,
      meta: { limit, offset, hasMore, total: items.length + offset },
    });

  } catch (error: any) {
    console.error('[Enterprise Guardians List] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const CreateGuardianSchema = z.object({
  customerId: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  firebaseUid: z.string().optional(),
  walletAddress: z.string().optional(),
}).refine(
  (g) => (typeof g.firebaseUid === 'string' && g.firebaseUid.length > 0) || (typeof g.walletAddress === 'string' && g.walletAddress.length > 0),
  { message: 'Guardian must provide a firebaseUid or walletAddress for identity proofs' }
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateGuardianSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const orgId = 'org_legacy_migration';
    const { customerId, name, email, phone, firebaseUid, walletAddress } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    // If customerId provided, verify customer exists
    if (customerId) {
      const customerSnap = await db
        .collection('organizations').doc(orgId)
        .collection('customers').doc(customerId).get();

      if (!customerSnap.exists) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
    }

    // Check for duplicate firebaseUid
    if (firebaseUid) {
      const existing = await db
        .collection('organizations').doc(orgId)
        .collection('guardians')
        .where('firebaseUid', '==', firebaseUid)
        .limit(1)
        .get();
      if (!existing.empty) {
        return NextResponse.json({ error: 'firebaseUid already used by another guardian' }, { status: 409 });
      }
    }

    // Check for duplicate walletAddress
    if (walletAddress) {
      const existing = await db
        .collection('organizations').doc(orgId)
        .collection('guardians')
        .where('walletAddress', '==', walletAddress)
        .limit(1)
        .get();
      if (!existing.empty) {
        return NextResponse.json({ error: 'walletAddress already used by another guardian' }, { status: 409 });
      }
    }

    const guardianId = `guard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const guardian = {
      id: guardianId,
      organizationId: orgId,
      customerId: customerId ?? null,
      name,
      email,
      phone,
      firebaseUid,
      walletAddress,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .collection('organizations').doc(orgId)
      .collection('guardians').doc(guardianId).set(guardian);

    return NextResponse.json({ guardian }, { status: 201 });

  } catch (error: any) {
    console.error('[Enterprise Guardian Create] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}