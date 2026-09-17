import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { customerId: string } }
) {
  try {
    const { customerId } = params;
    const orgId = 'org_legacy_migration';

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const doc = await adminDb
      .collection('organizations').doc(orgId)
      .collection('customers').doc(customerId).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ customer: { id: doc.id, ...doc.data() } });

  } catch (error: any) {
    console.error('[Enterprise Customer Get] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { customerId: string } }
) {
  try {
    const { customerId } = params;
    const orgId = 'org_legacy_migration';

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    // Check if customer exists
    const doc = await adminDb
      .collection('organizations').doc(orgId)
      .collection('customers').doc(customerId).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Delete customer and all related data in a batch
    const batch = adminDb.batch();

    // Delete customer
    const customerRef = adminDb
      .collection('organizations').doc(orgId)
      .collection('customers').doc(customerId);
    batch.delete(customerRef);

    // Delete related vault (if exists)
    const vaultSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('vaults')
      .where('customerId', '==', customerId)
      .limit(1)
      .get();
    if (!vaultSnap.empty) {
      batch.delete(vaultSnap.docs[0].ref);
    }

    // Delete related legacy plans
    const plansSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('legacyPlans')
      .where('customerId', '==', customerId)
      .get();
    plansSnap.docs.forEach(doc => batch.delete(doc.ref));

    // Delete related beneficiaries
    const bensSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('beneficiaries')
      .where('customerId', '==', customerId)
      .get();
    bensSnap.docs.forEach(doc => batch.delete(doc.ref));

    // Delete related guardians
    const guardsSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('guardians')
      .where('customerId', '==', customerId)
      .get();
    guardsSnap.docs.forEach(doc => batch.delete(doc.ref));

    // Delete related claims
    const claimsSnap = await adminDb
      .collection('organizations').doc(orgId)
      .collection('claims')
      .where('customerId', '==', customerId)
      .get();
    claimsSnap.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();

    return NextResponse.json({ success: true, message: 'Customer and all related data deleted' });

  } catch (error: any) {
    console.error('[Enterprise Customer Delete] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}