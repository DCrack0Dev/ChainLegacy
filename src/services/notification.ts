import { sendEmail, extractEmails, validateRecipients } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Contact } from '@/types/vault';
import { withTimeout } from '@/lib/utils';

/**
 * Notification Engine V3
 * Simplified and vault-centric.
 */
export class NotificationService {
  /**
   * Dispatches notifications based on stage.
   */
  static async notifyLivenessEscalation(userId: string, stage: string, data: any) {
    // data should contain the merged user and vault information
    const beneficiaries = extractEmails(data);
    const beneficiaryEmail = beneficiaries[0]; // SINGLE BENEFICIARY
    const userPhone = data.userPhone || data.phone;
    const name = data.name || 'ChainLegacy User';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Timeout for all external calls
    const TIMEOUT = 10000; // 10 seconds

    // STEP 6: LOG EVERYTHING (DEBUG MODE)
    console.log("NOTIFICATION PIPELINE DEBUG:", {
      userId,
      stage,
      beneficiaryEmail,
      ownerEmail: data.email
    });

    switch (stage) {
      case 'warning_email':
        console.log(`[Notification] Sending warning email to owner: ${data.email}`);
        await withTimeout(sendEmail({
          to: data.email, // Notify the owner
          subject: 'Action Required: ChainLegacy Check-in',
          html: `<p>Hello ${name}, you missed your check-in. Please reset at ${appUrl}/dashboard</p>`,
          userId,
          ownerEmail: data.email
        }), TIMEOUT, 'Email Send');
        break;

      case 'warning_sms':
        if (userPhone) {
          console.log(`[Notification] Sending warning SMS to: ${userPhone}`);
          await withTimeout(sendSMS({
            to: userPhone,
            message: `[ChainLegacy] URGENT: Check-in missed. Reset now at ${appUrl}/dashboard`
          }), TIMEOUT, 'SMS Send');
        }
        break;

      case 'grace_period':
        // Notify owner AND single beneficiary
        console.log(`[Notification] Sending grace period emails to owner and beneficiary`);
        const graceRecipients = [data.email];
        if (beneficiaryEmail) graceRecipients.push(beneficiaryEmail);

        await withTimeout(sendEmail({
          to: graceRecipients,
          subject: 'FINAL WARNING: Vault Release Pending',
          html: `<p>A vault is entering the final grace period. Reset at ${appUrl}/dashboard if this is a mistake.</p>`,
          userId,
          ownerEmail: data.email
        }), TIMEOUT, 'Grace Email Send');
        break;

      case 'triggered':
        if (beneficiaryEmail) {
          console.log(`[Notification] Sending triggered email to beneficiary: ${beneficiaryEmail}`);
          await withTimeout(sendEmail({
            to: beneficiaryEmail,
            subject: 'Digital Legacy: Access Granted',
            html: `<p>Access granted to vault. Claim at ${appUrl}/claim/${userId}</p>`,
            userId,
            ownerEmail: data.email
          }), TIMEOUT, 'Triggered Email Send');
        }
        break;
      
      default:
        console.log(`[Notification] No specific action for stage: ${stage}`);
        break;
    }
  }
}
