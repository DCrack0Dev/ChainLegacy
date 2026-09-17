import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListCustomersSchema = z.object({
  partnerCustomerId: z.string().optional(),
  firebaseUid: z.string().optional(),
  email: z.string().email().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ListCustomersSchema.safeParse(Object.fromEntries(searchParams));
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.format() }, { status: 400 });
    }

    const { partnerCustomerId, firebaseUid, email, limit, offset } = parsed.data;
    const orgId = 'org_legacy_migration';

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    let query = adminDb
      .collection('organizations').doc(orgId)
      .collection('customers')
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc');

    if (partnerCustomerId) query = query.where('partnerCustomerId', '==', partnerCustomerId);
    if (firebaseUid) query = query.where('firebaseUid', '==', firebaseUid);
    if (email) query = query.where('email', '==', email);

    const snap = await query.limit(limit + 1).offset(offset).get();
    const customers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const hasMore = customers.length > limit;
    const items = hasMore ? customers.slice(0, limit) : customers;

    return NextResponse.json({
      data: items,
      meta: { limit, offset, hasMore, total: items.length + offset },
    });

  } catch (error: any) {
    console.error('[Enterprise Customers List] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const CreateCustomerSchema = z.object({
  partnerCustomerId: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  walletAddress: z.string().optional(),
  firebaseUid: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateCustomerSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const orgId = 'org_legacy_migration';
    const { partnerCustomerId, email, fullName, phone, walletAddress, firebaseUid } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    // Check for duplicate partnerCustomerId
    const existingPartner = await adminDb
      .collection('organizations').doc(orgId)
      .collection('customers')
      .where('partnerCustomerId', '==', partnerCustomerId)
      .limit(1)
      .get();
    if (!existingPartner.empty) {
      return NextResponse.json({ error: 'partnerCustomerId already exists' }, { status: 409 });
    }

    // Check for duplicate firebaseUid
    if (firebaseUid) {
      const existingFirebase = await adminDb
        .collection('organizations').doc(orgId)
        .collection('customers')
        .where('firebaseUid', '==', firebaseUid)
        .limit(1)
        .get();
      if (!existingFirebase.empty) {
        return NextResponse.json({ error: 'firebaseUid already linked to another customer' }, { status: 409 });
      }
    }

    const customerId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const customer = {
      id: customerId,
      organizationId: orgId,
      partnerCustomerId,
      email,
      fullName,
      phone,
      walletAddress,
      firebaseUid: firebaseUid ?? null,
      vaultId: null,
      verificationStatus: 'not_started',
      createdAt: now,
      updatedAt: now,
    };

    await adminDb
      .collection('organizations').doc(orgId)
      .collection('customers').doc(customerId).set(customer);

    return NextResponse.json({ customer }, { status: 201 });

  } catch (error: any) {
    console.error('[Enterprise Customers Create] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}