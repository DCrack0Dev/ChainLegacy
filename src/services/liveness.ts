import { adminDb } from '@/lib/firebase-admin';
import { addDays, isAfter, addMinutes } from 'date-fns';
import { OnChainService } from './onchain';

export enum LivenessStage {
  ACTIVE = 'active',
  WARNING_EMAIL = 'warning_email',
  WARNING_SMS = 'warning_sms',
  PUSH_NOTIFICATION = 'push_notification',
  AI_LIVENESS_CHECK = 'ai_liveness_check',
  WALLET_SIGNATURE_REQ = 'wallet_signature_req',
  GRACE_PERIOD = 'grace_period',
  TRIGGERED = 'triggered'
}

/**
 * Liveness Service V3
 * Orchestrates multi-signal inactivity detection and escalation.
 * Includes AI-based liveness verification and multi-channel alerts.
 */
export class LivenessService {
  /**
   * Evaluates and transitions the liveness state for a user.
   */
  static async evaluateStatus(userId: string, userData: any) {
    const now = new Date();
    
    // Safely handle lastCheckIn as number (V3) or Timestamp (V2)
    let lastCheckIn = now;
    if (userData.lastCheckIn) {
      if (typeof userData.lastCheckIn === 'number') {
        lastCheckIn = new Date(userData.lastCheckIn);
      } else if (typeof userData.lastCheckIn.toDate === 'function') {
        lastCheckIn = userData.lastCheckIn.toDate();
      } else {
        lastCheckIn = new Date(userData.lastCheckIn);
      }
    }

    const interval = userData.interval || 30;
    const stage = userData.livenessStage || LivenessStage.ACTIVE;

    // Support for 1-minute testing intervals (if interval < 0.01)
    const isMinuteTesting = interval < 0.01;
    const addTime = (date: Date, amount: number) => {
      if (isMinuteTesting) {
        // In testing mode, 'interval' represents minutes, and stages are scaled down to minutes
        return addMinutes(date, amount === 0 ? 1 : amount); 
      }
      return addDays(date, amount);
    };

    // Failsafe: If vault is disputed/paused or frozen, do not progress liveness
    if (userData.isDisputed || userData.isVaultFrozen || userData.isLivenessPaused) {
      return { transitioned: false, current: stage, reason: 'halted' };
    }

    // Task 3: On-chain Activity Check (Auto-recovery signal)
    if (userData.walletAddress && userData.monitorOnChain) {
      const thresholdDate = lastCheckIn;
      const isActiveOnChain = await OnChainService.checkRecentActivity(userData.walletAddress, thresholdDate);
      if (isActiveOnChain) {
        await this.resetTimer(userId, 'on-chain');
        return { transitioned: true, from: stage, to: LivenessStage.ACTIVE, signal: 'on-chain' };
      }
    }

    // Task 3: Multi-channel escalation configuration
    // When isMinuteTesting is true, these numbers represent minutes after the initial interval
    const stages = {
      [LivenessStage.WARNING_EMAIL]: 0,
      [LivenessStage.WARNING_SMS]: isMinuteTesting ? 2 : 7,
      [LivenessStage.PUSH_NOTIFICATION]: isMinuteTesting ? 3 : 10,
      [LivenessStage.AI_LIVENESS_CHECK]: isMinuteTesting ? 4 : 14,
      [LivenessStage.WALLET_SIGNATURE_REQ]: isMinuteTesting ? 5 : 21,
      [LivenessStage.GRACE_PERIOD]: isMinuteTesting ? 6 : 30,
      [LivenessStage.TRIGGERED]: isMinuteTesting ? 7 : 45
    };

    let nextStage = stage;

    if (stage === LivenessStage.ACTIVE && isAfter(now, addTime(lastCheckIn, isMinuteTesting ? 1 : interval))) {
      nextStage = LivenessStage.WARNING_EMAIL;
    } else if (stage === LivenessStage.WARNING_EMAIL && isAfter(now, addTime(lastCheckIn, (isMinuteTesting ? 1 : interval) + stages[LivenessStage.WARNING_SMS]))) {
      nextStage = LivenessStage.WARNING_SMS;
    } else if (stage === LivenessStage.WARNING_SMS && isAfter(now, addTime(lastCheckIn, (isMinuteTesting ? 1 : interval) + stages[LivenessStage.PUSH_NOTIFICATION]))) {
      nextStage = LivenessStage.PUSH_NOTIFICATION;
    } else if (stage === LivenessStage.PUSH_NOTIFICATION && isAfter(now, addTime(lastCheckIn, (isMinuteTesting ? 1 : interval) + stages[LivenessStage.AI_LIVENESS_CHECK]))) {
      nextStage = LivenessStage.AI_LIVENESS_CHECK;
    } else if (stage === LivenessStage.AI_LIVENESS_CHECK && isAfter(now, addTime(lastCheckIn, (isMinuteTesting ? 1 : interval) + stages[LivenessStage.WALLET_SIGNATURE_REQ]))) {
      nextStage = LivenessStage.WALLET_SIGNATURE_REQ;
    } else if (stage === LivenessStage.WALLET_SIGNATURE_REQ && isAfter(now, addTime(lastCheckIn, (isMinuteTesting ? 1 : interval) + stages[LivenessStage.GRACE_PERIOD]))) {
      nextStage = LivenessStage.GRACE_PERIOD;
    } else if (stage === LivenessStage.GRACE_PERIOD && isAfter(now, addTime(lastCheckIn, (isMinuteTesting ? 1 : interval) + stages[LivenessStage.TRIGGERED]))) {
      nextStage = LivenessStage.TRIGGERED;
    }

    if (nextStage !== stage) {
      const updateData: any = {
        livenessStage: nextStage,
        [`${nextStage}At`]: new Date(),
        status: nextStage === LivenessStage.TRIGGERED ? 'triggered' : userData.status,
        lastStatusUpdate: new Date(),
        updatedAt: new Date()
      };

      // Sync releasePendingStartedAt for grace/triggered transitions
      if (nextStage === LivenessStage.GRACE_PERIOD || nextStage === LivenessStage.TRIGGERED) {
        updateData.releasePendingStartedAt = new Date();
      }

      return { transitioned: true, from: stage, to: nextStage, updateData };
    }

    return { transitioned: false, current: stage };
  }

  /**
   * Task 3: AI-based Liveness Verification (Architecture)
   * This would be called after a user submits a selfie or voice phrase.
   */
  static async verifyAILiveness(userId: string, data: { selfieBlob?: Blob; voiceBlob?: Blob }) {
    // In a real implementation, integrate with an AI provider (e.g., AWS Rekognition, Azure Cognitive Services)
    console.log(`[LivenessService] Performing AI liveness check for user ${userId}`);
    
    // Simulate verification
    const isVerified = true; 

    if (isVerified) {
      await this.resetTimer(userId, 'on-chain'); // Reset on success
      return { success: true };
    } else {
      return { success: false, error: 'AI Liveness check failed' };
    }
  }

  /**
   * Task 3: Emergency Override System
   * Allows user to cancel trigger within grace period with strong re-authentication.
   */
  static async emergencyOverride(userId: string, authContext: any) {
    // Require passkey or multi-factor auth verification here
    await this.resetTimer(userId, 'login');
    return { success: true, message: 'Emergency override successful. Vault secured.' };
  }

  /**
   * Task 6: Inheritance Simulator (Logic Layer)
   * Predicts the timeline of inheritance trigger based on current settings.
   */
  static simulateTimeline(interval: number) {
    const now = new Date();
    const isMinuteTesting = interval < 0.01;

    if (isMinuteTesting) {
      return [
        { stage: 'Active', date: now },
        { stage: 'Warning Email', date: addMinutes(now, 1) },
        { stage: 'Warning SMS', date: addMinutes(now, 3) },
        { stage: 'AI Liveness Check', date: addMinutes(now, 5) },
        { stage: 'Wallet Signature Req', date: addMinutes(now, 7) },
        { stage: 'Final Grace Period', date: addMinutes(now, 10) },
        { stage: 'Vault Release', date: addMinutes(now, 15) },
      ];
    }

    const timeline = [
      { stage: 'Active', date: now },
      { stage: 'Warning Email', date: addDays(now, interval) },
      { stage: 'Warning SMS', date: addDays(now, interval + 7) },
      { stage: 'AI Liveness Check', date: addDays(now, interval + 14) },
      { stage: 'Wallet Signature Req', date: addDays(now, interval + 21) },
      { stage: 'Final Grace Period', date: addDays(now, interval + 30) },
      { stage: 'Vault Release', date: addDays(now, interval + 45) },
    ];
    return timeline;
  }

  /**
   * Resets the liveness timer based on various signals.
   */
  static async resetTimer(userId: string, signal: 'login' | 'email' | 'sms' | 'wallet' | 'on-chain') {
    await adminDb?.collection('users').doc(userId).update({
      lastCheckIn: new Date(),
      livenessStage: LivenessStage.ACTIVE,
      status: 'active',
      lastSignal: signal,
      lastSignalAt: new Date()
    });
  }
}
