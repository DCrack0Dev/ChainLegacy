import { adminDb } from '../lib/firebase-admin';

async function migrate() {
  if (!adminDb) {
    console.error('Firebase Admin DB not initialized');
    return;
  }

  const usersSnapshot = await adminDb.collection('users').get();
  console.log(`Starting migration for ${usersSnapshot.size} users to Vault V3...`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const userId = userDoc.id;

    const vaultRef = adminDb.collection('vaults').doc(userId);
    const vaultDoc = await vaultRef.get();

    if (vaultDoc.exists) {
      console.log(`Vault for user ${userId} already exists. Skipping.`);
      skippedCount++;
      continue;
    }

    // Extract legacy data
    // Get single beneficiary
    const beneficiary = userData.beneficiary || 
                       (userData.beneficiaries && userData.beneficiaries[0]) ||
                       (userData.contacts?.find((c: any) => c.role === 'beneficiary'));

    if (beneficiary) {
      console.log(`[Migrate][${userId}] Found primary beneficiary: ${beneficiary.email}`);
    }

    const beneficiaries = beneficiary ? [beneficiary] : [];
    const guardians = userData.contacts?.guardians || userData.guardians || [];
    
    const now = Date.now();
    const vaultContacts: any[] = [];

    // Standardize beneficiaries
    beneficiaries.forEach((b: any) => {
      const email = (b.email || b.Email || '').toLowerCase().trim();
      if (email && email.includes('@')) {
        vaultContacts.push({
          id: b.id || Math.random().toString(36).substring(7),
          name: b.name || 'Unknown Beneficiary',
          email,
          phone: b.phone || b.Phone || '',
          role: 'beneficiary',
          share: b.share || (beneficiaries.length === 1 ? 100 : 0)
        });
      }
    });

    // Standardize guardians
    guardians.forEach((g: any) => {
      const email = (g.email || '').toLowerCase().trim();
      if (email && email.includes('@')) {
        vaultContacts.push({
          id: g.id || Math.random().toString(36).substring(7),
          name: g.name || 'Unknown Guardian',
          email,
          phone: g.phone || '',
          role: 'guardian',
          status: g.status || 'active'
        });
      }
    });

    try {
      // Create new vault document
      await vaultRef.set({
        id: userId,
        ownerId: userId,
        status: userData.status || 'active',
        lastCheckIn: userData.lastCheckIn?.toMillis?.() || now,
        interval: userData.interval || 30,
        contacts: vaultContacts,
        createdAt: userData.createdAt?.toMillis?.() || now,
        updatedAt: now
      });

      // Update user document
      await adminDb.collection('users').doc(userId).update({
        vaultId: userId,
        logs: userData.logs || [{
          action: 'vault_migrated',
          timestamp: new Date().toISOString(),
          details: 'Legacy account migrated to Vault V3 protocol.'
        }]
        // Optionally clean up old fields
        // beneficiaries: adminDb.FieldValue.delete(),
        // beneficiary: adminDb.FieldValue.delete(),
        // contacts: adminDb.FieldValue.delete()
      });

      console.log(`Successfully migrated user ${userId} to Vault V3`);
      migratedCount++;
    } catch (error) {
      console.error(`Failed to migrate user ${userId}:`, error);
    }
  }

  console.log(`Migration complete! Migrated: ${migratedCount}, Skipped: ${skippedCount}`);
}

migrate().catch(console.error);
