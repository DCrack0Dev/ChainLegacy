/**
 * Simulated SMS provider with logging and retry logic.
 */
export async function sendSMS({ to, message, retryCount = 0 }: { to: string, message: string, retryCount?: number }) {
  console.log(`[SMS Provider] Sending SMS to ${to}: ${message} (Attempt ${retryCount + 1}/3)`);
  
  if (!to || to.length < 5) {
    console.error(`[SMS Provider] Invalid phone number: ${to}`);
    return { success: false, error: 'Invalid phone number' };
  }

  // Simulated failures only in non-production environments for testing retry logic
  const mockFailuresEnabled = process.env.NODE_ENV !== 'production';
  const isMockFailure = mockFailuresEnabled ? Math.random() < 0.1 : false;
  
  if (isMockFailure && retryCount < 2) {
    const delay = Math.pow(2, retryCount) * 1000;
    console.warn(`[SMS Provider] Mock failure for ${to}. Retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return sendSMS({ to, message, retryCount: retryCount + 1 });
  }

  // In a real app, integrate with Twilio/Vonage here
  return { success: true };
}
