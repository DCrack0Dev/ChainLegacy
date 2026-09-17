import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { customerId: string } }
) {
  try {
    const { customerId } = params;
    const orgId = 'org_legacy_migration';
    const body = await request.json();
    const { name, intervalDays } = body;

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

    // Check if customer already has a vault
    if (customer.vaultId) {
      const existingVault = await db
        .collection('organizations').doc(orgId)
        .collection('vaults').doc(customer.vaultId).get();
      
      if (existingVault.exists) {
        return NextResponse.json({ 
          vault: { id: existingVault.id, ...existingVault.data() },
          created: false,
          message: 'Customer already has a vault'
        }, { status: 200 });
      }
    }

    const vaultId = `vlt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const vault = {
      id: vaultId,
      organizationId: orgId,
      customerId,
      ownerUid: customer.firebaseUid ?? null,
      name: name ?? 'Primary Legacy Vault',
      status: 'active',
      intervalDays: intervalDays ?? 30,
      createdAt: now,
      updatedAt: now,
    };

    // Transaction: create vault + link to customer
    await db.runTransaction(async (tx) => {
      tx.set(db.collection('organizations').doc(orgId).collection('vaults').doc(vaultId), vault);
      tx.update(db.collection('organizations').doc(orgId).collection('customers').doc(customerId), {
        vaultId,
        updatedAt: now,
      });
    });

    return NextResponse.json({ vault, created: true }, { status: 201 });

  } catch (error: any) {
    console.error('[Enterprise Vault Create] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

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
    const db = adminDb;

    const customerSnap = await db
      .collection('organizations').doc(orgId)
      .collection('customers').doc(customerId).get();

    if (!customerSnap.exists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const customer = customerSnap.data()!;

    if (!customer.vaultId) {
      return NextResponse.json({ error: 'Customer has no vault' }, { status: 404 });
    }

    const vaultSnap = await db
      .collection('organizations').doc(orgId)
      .collection('vaults').doc(customer.vaultId).get();

    if (!vaultSnap.exists) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    return NextResponse.json({ vault: { id: vaultSnap.id, ...vaultSnap.data() } });

  } catch (error: any) {
    console.error('[Enterprise Vault Get] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}