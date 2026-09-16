import { adminDb } from '@/lib/firebase-admin';

export enum SuspicionSignal {
  RAPID_BENEFICIARY_CHANGE = 'rapid_beneficiary_change',
  FAILED_CLAIM_BRUTEFORCE = 'failed_claim_brute_force',
  TIMER_MANIPULATION = 'timer_manipulation',
  UNAUTHORIZED_API_ACCESS = 'unauthorized_api_access',
  CONFLICTING_LIVENESS_SIGNALS = 'conflicting_liveness_signals',
  ANOMALOUS_LOCATION = 'anomalous_location',
  UNUSUAL_DEVICE = 'unusual_device',
  VELOCITY_EXCEEDED = 'velocity_exceeded'
}

/**
 * Suspicion Service V3
 * Tracks behavioral patterns indicating malicious activity or account takeover.
 * Includes weighted risk scores and automatic vault freeze.
 */
export class SuspicionService {
  /**
   * Records a suspicious signal and updates the user's suspicion score.
   */
  static async recordSignal(userId: string, signal: SuspicionSignal, details: any) {
    const userRef = adminDb?.collection('users').doc(userId);
    const userDoc = await userRef?.get();
    if (!userDoc?.exists) return;

    const userData = userDoc.data()!;
    let currentScore = userData.suspicionScore || 0;

    // Task 3: Weighted risk scores
    const weights = {
      [SuspicionSignal.RAPID_BENEFICIARY_CHANGE]: 40,
      [SuspicionSignal.FAILED_CLAIM_BRUTEFORCE]: 30,
      [SuspicionSignal.TIMER_MANIPULATION]: 50,
      [SuspicionSignal.UNAUTHORIZED_API_ACCESS]: 20,
      [SuspicionSignal.CONFLICTING_LIVENESS_SIGNALS]: 25,
      [SuspicionSignal.ANOMALOUS_LOCATION]: 15,
      [SuspicionSignal.UNUSUAL_DEVICE]: 10,
      [SuspicionSignal.VELOCITY_EXCEEDED]: 35
    };

    const newScore = Math.min(100, currentScore + (weights[signal] || 10));

    await userRef?.update({
      suspicionScore: newScore,
      lastSuspicionSignal: signal,
      [`suspicion_${signal}_count`]: (userData[`suspicion_${signal}_count`] || 0) + 1,
      suspicionSignals: (userData.suspicionSignals || []).concat({
        signal,
        details,
        timestamp: new Date()
      }),
      lastSuspicionAt: new Date()
    });

    // Task 3: Trigger automatic vault freeze on high-risk activity
    if (newScore >= 80) {
      console.warn(`[SuspicionService] CRITICAL suspicion score for user ${userId}. Score: ${newScore}. Freezing vault.`);
      await userRef?.update({ 
        isVaultFrozen: true,
        frozenAt: new Date(),
        freezeReason: 'High suspicion score detected'
      });
      // TODO: Notify user via all channels immediately
    } else if (newScore >= 50) {
      console.warn(`[SuspicionService] Elevated suspicion score for user ${userId}. Score: ${newScore}.`);
      await userRef?.update({ isLivenessPaused: true });
    }
  }

  /**
   * Anomaly Detection: Checks for unusual login patterns.
   */
  static async checkLoginAnomaly(userId: string, currentContext: { ip: string; device: string; location: string }) {
    const userRef = adminDb?.collection('users').doc(userId);
    const userDoc = await userRef?.get();
    if (!userDoc?.exists) return;

    const userData = userDoc.data()!;
    const lastLogin = userData.lastLoginContext;

    if (lastLogin) {
      if (lastLogin.location !== currentContext.location) {
        await this.recordSignal(userId, SuspicionSignal.ANOMALOUS_LOCATION, { from: lastLogin.location, to: currentContext.location });
      }
      if (lastLogin.device !== currentContext.device) {
        await this.recordSignal(userId, SuspicionSignal.UNUSUAL_DEVICE, { from: lastLogin.device, to: currentContext.device });
      }
    }

    await userRef?.update({ lastLoginContext: currentContext });
  }

  /**
   * Task 6: Tamper Alerts Dashboard (Data Layer)
   * Fetches high-risk suspicion signals for user review.
   */
  static async getTamperAlerts(userId: string) {
    const userDoc = await adminDb?.collection('users').doc(userId).get();
    if (!userDoc?.exists) return [];
    
    const signals = userDoc.data()?.suspicionSignals || [];
    return signals.filter((s: any) => s.details?.severity === 'high' || s.signal === SuspicionSignal.FAILED_CLAIM_BRUTEFORCE);
  }

  /**
   * Resets or decays the suspicion score over time.
   */
  static async decayScore(userId: string) {
    // Logic to reduce score by 5 every week of normal activity
    await adminDb?.collection('users').doc(userId).update({
      suspicionScore: Math.max(0, (await adminDb.collection('users').doc(userId).get()).data()?.suspicionScore - 5)
    });
  }
}
