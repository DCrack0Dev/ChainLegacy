import sgMail from '@sendgrid/mail';
import { Contact } from '@/types/vault';

// Initialize SendGrid with API Key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
} else {
  console.error('CRITICAL: SENDGRID_API_KEY is missing from environment variables.');
}

/**
 * STEP 2: HARD VALIDATION LAYER
 * Validates a list of email strings.
 */
export function validateRecipients(emails: string[]): string[] {
  return emails
    .filter(e => typeof e === 'string')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.includes('@') && e.length > 5);
}

/**
 * STEP 4: NORMALIZE DATA INPUT
 * Extracts the primary beneficiary email from user/vault data.
 */
export function extractEmails(data: any): string[] {
  // Return as array for compatibility, but prioritize single beneficiary
  if (data?.beneficiary?.email) return [data.beneficiary.email];
  
  if (Array.isArray(data?.contacts)) {
    const beneficiary = data.contacts.find((c: any) => c.role === 'beneficiary');
    if (beneficiary?.email) return [beneficiary.email];
  }

  if (Array.isArray(data?.beneficiaries) && data.beneficiaries.length > 0) {
    if (data.beneficiaries[0]?.email) return [data.beneficiaries[0].email];
  }

  return [];
}

interface SendEmailParams {
  to: string | string[] | Contact | Contact[];
  subject: string;
  html: string;
  retryCount?: number;
  userId?: string; // Optional for logging
  ownerEmail?: string; // Optional fallback
}

/**
 * Sends an email using SendGrid with retry logic and detailed logging.
 */
export async function sendEmail({ to, subject, html, retryCount = 0, userId, ownerEmail }: SendEmailParams): Promise<{ success: boolean; error?: string; details?: any }> {
  // Runtime environment check
  if (!process.env.SENDGRID_API_KEY) {
    console.error("[Email] CRITICAL ERROR: SENDGRID_API_KEY is not defined.");
    return { success: false, error: 'SendGrid API Key missing' };
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  // STEP 4: NORMALIZE & EXTRACT
  let rawRecipients: string[] = [];
  
  if (Array.isArray(to)) {
    rawRecipients = to.map(r => typeof r === 'string' ? r : r.email);
  } else if (typeof to === 'string') {
    rawRecipients = [to];
  } else {
    rawRecipients = [to.email];
  }

  // STEP 2: VALIDATE
  let validEmails = validateRecipients(rawRecipients);

  // STEP 7: ADD FALLBACK RECIPIENT
  if (validEmails.length === 0 && ownerEmail) {
    console.log(`[Email] No valid recipients found, using owner fallback: ${ownerEmail}`);
    validEmails = validateRecipients([ownerEmail]);
  }

  // STEP 6: LOG EVERYTHING (DEBUG MODE)
  console.log("EMAIL PIPELINE DEBUG:", { 
    userId: userId || 'unknown',
    rawRecipients, 
    validEmails,
    subject
  });

  // STEP 3: FAIL-SAFE BLOCK
  if (validEmails.length === 0) {
    console.error("BLOCKED EMAIL: No valid recipients", { userId, rawRecipients });
    return { success: false, error: "No valid recipients" };
  }

  if (!SENDGRID_FROM_EMAIL) {
    return { success: false, error: 'SendGrid From Email missing' };
  }

  // STEP 12: SEND DIRECTLY
  console.log(`[Email] Sending to ${validEmails.length} recipient(s)...`);
  
  const results = await Promise.all(validEmails.map(async (email) => {
    const msg = {
      to: email,
      from: SENDGRID_FROM_EMAIL,
      subject,
      html,
    };

    try {
      const [response] = await sgMail.send(msg);
      if (response.statusCode >= 200 && response.statusCode < 300) {
        console.log(`[Email] SUCCESS: Delivered to ${email}`);
        return { email, success: true };
      }
      throw new Error(`Status ${response.statusCode}`);
    } catch (error: any) {
      console.error(`[Email] FAILED for ${email}: ${error.message}`);
      return { email, success: false, error: error.message };
    }
  }));

  const allSucceeded = results.every(r => r.success);
  
  if (allSucceeded) {
    return { success: true };
  } else {
    // Retry logic simplified
    if (retryCount < 2) {
      const delay = 2000;
      console.log(`[Email] Retrying failed emails in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      const failedEmails = results.filter(r => !r.success).map(r => r.email);
      return sendEmail({ to: failedEmails, subject, html, retryCount: retryCount + 1, userId, ownerEmail });
    }
    return { success: false, error: "Failed to send after retries", details: results };
  }
}
