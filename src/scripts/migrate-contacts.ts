import { adminDb } from '../lib/firebase-admin';

async function migrate() {
  if (!adminDb) {
    console.error('Firebase Admin DB not initialized');
    return;
  }

  const usersSnapshot = await adminDb.collection('users').get();
  console.log(`Starting migration for ${usersSnapshot.size} users...`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const userId = userDoc.id;

    if (userData.contacts && userData.contacts.beneficiaries) {
      console.log(`User ${userId} already has contacts. Skipping.`);
      skippedCount++;
      continue;
    }

    const beneficiaries = userData.beneficiaries || (userData.beneficiary ? [userData.beneficiary] : []);
    const guardians = userData.guardians || [];

    if (beneficiaries.length === 0 && guardians.length === 0) {
      console.log(`User ${userId} has no beneficiaries or guardians. Skipping.`);
      skippedCount++;
      continue;
    }

    // Standardize beneficiaries
    const standardizedBeneficiaries = beneficiaries.map((b: any) => ({
      name: b.name || 'Unknown',
      email: (b.email || b.Email || '').toLowerCase().trim(),
      phone: b.phone || b.Phone || '',
      walletAddress: b.walletAddress || ''
    })).filter((b: any) => b.email); // Only keep those with emails

    if (standardizedBeneficiaries.length === 0 && beneficiaries.length > 0) {
      console.warn(`User ${userId} has beneficiaries but NONE have valid emails!`, beneficiaries);
    }

    try {
      await adminDb.collection('users').doc(userId).update({
        contacts: {
          beneficiaries: standardizedBeneficiaries,
          guardians: guardians.map((g: any) => ({
            name: g.name || 'Unknown',
            email: (g.email || '').toLowerCase().trim(),
            phone: g.phone || ''
          }))
        },
        // Optionally remove legacy fields after verification
        // beneficiaries: adminDb.FieldValue.delete(),
        // beneficiary: adminDb.FieldValue.delete()
      });
      console.log(`Migrated user ${userId}`);
      migratedCount++;
    } catch (error) {
      console.error(`Failed to migrate user ${userId}:`, error);
    }
  }

  console.log(`Migration complete! Migrated: ${migratedCount}, Skipped: ${skippedCount}`);
}

migrate().catch(console.error);
