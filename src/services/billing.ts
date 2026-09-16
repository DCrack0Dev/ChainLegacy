import { adminDb } from '@/lib/firebase-admin';

export enum SubscriptionTier {
  FREE = 'free',
  PRO = 'pro',
  PREMIUM = 'premium',
  LEGACY_ELITE = 'legacy_elite'
}

/**
 * Billing Service V3 (Simulated Payment Integration)
 * Manages payments and subscriptions using a temporary simulation.
 */
export class BillingService {
  /**
   * Simulates creating a charge.
   */
  static async createCharge(token: string, amountInCents: number, currency: string = 'ZAR', metadata: any = {}) {
    try {
      console.log('[Billing] Simulating charge for:', { amountInCents, currency, metadata });
      
      // Simulate API latency
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Always succeed for the simulation
      const chargeId = 'sim_' + Math.random().toString(36).substr(2, 9);
      
      return {
        id: chargeId,
        status: 'successful',
        amount: amountInCents,
        currency,
        metadata
      };
    } catch (error: any) {
      console.error('[Billing] Simulated Charge Error:', error.message);
      throw error;
    }
  }

  /**
   * Simulated Webhook Event Handler.
   */
  static async handleWebhookEvent(payload: any) {
    const { type, data } = payload;

    try {
      switch (type) {
        case 'payment.succeeded':
          const userId = data.metadata?.userId;
          const tier = data.metadata?.plan || SubscriptionTier.FREE;
          
          if (userId) {
            await adminDb?.collection('users').doc(userId).update({
              plan: tier,
              planStatus: 'active',
              lastPaymentDate: new Date(),
              simulatedPaymentId: data.id,
              isPro: tier !== SubscriptionTier.FREE
            });
          }
          break;
          
        case 'payment.failed':
          const failedUserId = data.metadata?.userId;
          if (failedUserId) {
            await adminDb?.collection('users').doc(failedUserId).update({
              billingError: true,
              planStatus: 'past_due'
            });
          }
          break;
      }
    } catch (err: any) {
      console.error(`[Billing] Simulated Webhook Error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Checks if user has a specific entitlement based on their tier.
   */
  static async checkEntitlement(userId: string, feature: 'sms' | 'on-chain' | 'ai-liveness' | 'multi-region' | 'video' | 'hardware-wallet'): Promise<boolean> {
    const userDoc = await adminDb?.collection('users').doc(userId).get();
    if (!userDoc || !userDoc.exists) return false;
    const userData = userDoc.data()!;
    const plan = userData.plan as SubscriptionTier;

    // Entitlement Matrix
    const entitlements = {
      [SubscriptionTier.FREE]: ['email-only'],
      [SubscriptionTier.PRO]: ['sms', 'on-chain', 'limited-beneficiaries', 'shamir'],
      [SubscriptionTier.PREMIUM]: ['sms', 'on-chain', 'ai-liveness', 'multi-region', 'video', 'audit-logs', 'passkeys', 'guardian-network'],
      [SubscriptionTier.LEGACY_ELITE]: ['sms', 'on-chain', 'ai-liveness', 'multi-region', 'video', 'audit-logs', 'legal-integration', 'hardware-wallet', 'concierge']
    };

    const hasTierAccess = entitlements[plan]?.includes(feature as string);
    if (hasTierAccess) {
      if (userData.planStatus === 'active') return true;
      
      // 30-day grace period for unpaid accounts
      if (userData.planStatus === 'past_due' || userData.planStatus === 'unpaid') {
        const now = new Date();
        const lastPayment = userData.lastPaymentDate?.toDate();
        if (lastPayment && (now.getTime() - lastPayment.getTime()) < 30 * 24 * 60 * 60 * 1000) {
          return true;
        }
      }
    }

    return false;
  }
}
