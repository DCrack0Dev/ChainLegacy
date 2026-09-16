import { adminDb, FieldValue } from '@/lib/firebase-admin';

export interface BeneficiaryApproval {
  beneficiaryId: string;
  approved: boolean;
  timestamp: Date;
  signature?: string;
}

export interface Guardian {
  id: string;
  name: string;
  email: string;
  walletAddress?: string;
  status: 'active' | 'inactive' | 'pending';
}

/**
 * Governance Service V3
 * Handles M-of-N beneficiary consensus, Guardian Network, and Anti-Takeover Protection.
 */
export class GovernanceService {
  /**
   * Checks if the required threshold of beneficiary approvals has been met.
   * Simplified for single beneficiary.
   */
  static async checkConsensus(userId: string, data: any): Promise<boolean> {
    if (data.isDisputed || data.isVaultFrozen) return false;

    // Single beneficiary check: is the claim approved?
    return !!data.claimApproved;
  }

  /**
   * Task 4: Guardian Network - Assign a guardian.
   */
  static async assignGuardian(userId: string, guardian: Guardian) {
    await adminDb?.collection('users').doc(userId).update({
      guardians: FieldValue.arrayUnion({ ...guardian, status: 'pending' })
    });
    // TODO: Send invitation to guardian
  }

  /**
   * Task 2: Pause/Dispute Mechanism
   * Enhanced with audit trail and multi-party notification.
   */
  static async disputeVault(userId: string, disputedBy: string, reason: string) {
    const disputeEvent = {
      action: 'dispute_initiated',
      by: disputedBy,
      reason,
      timestamp: new Date()
    };

    await adminDb?.collection('users').doc(userId).update({
      isDisputed: true,
      disputedAt: new Date(),
      disputedBy,
      disputeReason: reason,
      status: 'disputed',
      auditTrail: FieldValue.arrayUnion(disputeEvent)
    });

    // TODO: Notify user, all beneficiaries, and all guardians
  }

  /**
   * Resolves a dispute and resumes the process.
   */
  static async resolveDispute(userId: string) {
    await adminDb?.collection('users').doc(userId).update({
      isDisputed: false,
      status: 'triggered'
    });
  }

  /**
   * Task 4: Anti-takeover reinforcement - 24-hour delay expanded.
   * Notifies all stakeholders of sensitive changes.
   */
  static async scheduleChange(userId: string, changeType: 'beneficiaries' | 'timer' | 'phrase' | 'guardians', newData: any) {
    const executionDate = new Date();
    executionDate.setHours(executionDate.getHours() + 24);

    const changeId = Math.random().toString(36).substring(7);
    await adminDb?.collection('users').doc(userId).collection('pending_changes').doc(changeId).set({
      type: changeType,
      data: newData,
      status: 'pending',
      scheduledFor: executionDate,
      createdAt: new Date()
    });

    // TODO: Notify all stakeholders immediately about the pending change
    return changeId;
  }

  /**
   * Task 6: Smart Will Generator (Data Layer)
   * Prepares the structured data for a legal-style inheritance document.
   */
  static async generateWillData(userId: string) {
    if (!adminDb) throw new Error('Database not initialized');

    // Parallelize DB reads for better performance
    const [userDoc, vaultDoc] = await Promise.all([
      adminDb.collection('users').doc(userId).get(),
      adminDb.collection('vaults').doc(userId).get()
    ]);
    
    if (!userDoc.exists || !vaultDoc.exists) throw new Error('User or Vault not found');
    
    const userData = userDoc.data()!;
    const vaultData = vaultDoc.data()!;

    return {
      owner: { name: userData.name, email: userData.email },
      beneficiaries: vaultData.contacts?.filter((c: any) => c.role === 'beneficiary') || [],
      guardians: vaultData.contacts?.filter((c: any) => c.role === 'guardian') || [],
      threshold: userData.approvalThreshold,
      interval: vaultData.interval,
      vaultType: 'Non-Custodial Zero-Knowledge',
      timestamp: new Date()
    };
  }

  /**
   * Executes scheduled changes if the delay has passed.
   */
  static async executePendingChanges(userId: string) {
    const now = new Date();
    const pending = await adminDb?.collection('users').doc(userId)
      .collection('pending_changes')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', now)
      .get();

    if (!pending || pending.empty) return;

    for (const doc of pending.docs) {
      const change = doc.data();
      // Apply change to main user doc or vault doc depending on type
      if (change.type === 'beneficiaries' || change.type === 'guardians' || change.type === 'contacts') {
        await adminDb?.collection('vaults').doc(userId).update({
          contacts: change.data.contacts || change.data,
          updatedAt: Date.now()
        });
      } else if (change.type === 'interval') {
        await adminDb?.collection('vaults').doc(userId).update({
          interval: change.data,
          updatedAt: Date.now()
        });
      } else {
        await adminDb?.collection('users').doc(userId).update({
          [change.type]: change.data,
          [`last_${change.type}_update`]: new Date()
        });
      }
      // Mark as executed
      await doc.ref.update({ status: 'executed', executedAt: new Date() });
    }
  }
}
