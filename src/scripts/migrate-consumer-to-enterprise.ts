import { adminDb } from '@/lib/firebase-admin';
import { createId } from '@/services/enterprise/persistence';

async function migrateConsumerToEnterprise() {
  if (!adminDb) {
    console.error('Firestore admin DB not initialized');
    process.exit(1);
  }

  console.log('Starting consumer to enterprise migration...');

  const usersSnap = await adminDb.collection('users').get();
  console.log(`Found ${usersSnap.size} users to migrate`);

  const orgId = 'org_legacy_migration';
  
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const userData = userDoc.data();

    try {
      await migrateUser(uid, userData, orgId, adminDb);
    } catch (error) {
      console.error(`Failed to migrate user ${uid}:`, error);
    }
  }

  console.log('Migration complete');
}

async function migrateUser(uid: string, userData: any, orgId: string, db: typeof adminDb) {
  const email = userData.email || `user_${uid}@legacy.local`;
  const fullName = userData.fullName || userData.displayName || 'Legacy User';
  const phone = userData.phone;

  const customerId = `cust_${uid}`;
  const vaultId = `vlt_${uid}`;

  const customerRef = db!.collection('organizations').doc(orgId).collection('customers').doc(customerId);
  const vaultRef = db!.collection('organizations').doc(orgId).collection('vaults').doc(vaultId);
  const planRef = db!.collection('organizations').doc(orgId).collection('legacyPlans').doc(`plan_${uid}`);

  const now = new Date();

  const customer = {
    id: customerId,
    organizationId: orgId,
    partnerCustomerId: `partner_${uid}`,
    email,
    fullName,
    phone,
    firebaseUid: uid,
    vaultId,
    verificationStatus: 'not_started',
    createdAt: userData.createdAt?.toDate?.() || now,
    updatedAt: now,
  };

  const vaultSnap = await db!.collection('vaults').doc(uid).get();
  let vaultData: any = {};
  if (vaultSnap.exists) {
    vaultData = vaultSnap.data()!;
  }

  const vault = {
    id: vaultId,
    organizationId: orgId,
    customerId,
    ownerUid: uid,
    name: 'Primary Legacy Vault',
    status: mapVaultStatus(vaultData.status),
    intervalDays: 30,
    createdAt: vaultData.createdAt?.toDate?.() || now,
    updatedAt: now,
  };

  const plan = {
    id: `plan_${uid}`,
    organizationId: orgId,
    customerId,
    vaultId,
    name: 'Legacy Plan',
    intervalDays: 30,
    guardianQuorum: 0,
    encryptionConfig: {
      algorithm: 'AES-256-GCM',
      kdf: 'argon2id',
      shamirThreshold: 0,
      shamirShares: 0,
    },
    walletSignatureRequired: false,
    status: 'draft',
    suspicionScore: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db!.runTransaction(async (tx: any) => {
    tx.set(customerRef, customer);
    tx.set(vaultRef, vault);
    tx.set(planRef, plan);
  });

  if (vaultData.beneficiaries && Array.isArray(vaultData.beneficiaries)) {
    for (let i = 0; i < vaultData.beneficiaries.length; i++) {
      const b = vaultData.beneficiaries[i];
      if (!b.email) continue;
      
      const benId = `ben_${uid}_${i}`;
      const benRef = db!.collection('organizations').doc(orgId).collection('beneficiaries').doc(benId);
      
      await benRef.set({
        id: benId,
        organizationId: orgId,
        customerId,
        legacyPlanId: `plan_${uid}`,
        name: b.name || 'Beneficiary',
        email: b.email,
        phone: b.phone,
        walletAddress: b.walletAddress,
        share: b.share || (100 / vaultData.beneficiaries.length),
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (vaultData.contacts && Array.isArray(vaultData.contacts)) {
    for (const contact of vaultData.contacts) {
      if (contact.role === 'guardian' && (contact.firebaseUid || contact.walletAddress)) {
        const guardId = `guard_${uid}_${contact.id || Math.random().toString(36).slice(2)}`;
        const guardRef = db!.collection('organizations').doc(orgId).collection('guardians').doc(guardId);
        
        await guardRef.set({
          id: guardId,
          organizationId: orgId,
          customerId,
          name: contact.name || 'Guardian',
          email: contact.email,
          phone: contact.phone,
          firebaseUid: contact.firebaseUid,
          walletAddress: contact.walletAddress,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  console.log(`Migrated user ${uid} -> customer ${customerId}`);
}

function mapVaultStatus(status?: string): string {
  switch (status) {
    case 'triggered': return 'triggered';
    case 'warning': return 'warning';
    case 'grace': return 'grace';
    case 'active': return 'active';
    default: return 'active';
  }
}

migrateConsumerToEnterprise()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });