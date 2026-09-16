import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const SendEmailSchema = z.object({
  to: z.union([
    z.string().email(),
    z.array(z.string().email()),
    z.object({ email: z.string().email() }).passthrough(),
    z.array(z.object({ email: z.string().email() }).passthrough())
  ]),
  subject: z.string().min(1),
  html: z.string().min(1)
});

/**
 * API Route to send emails via SendGrid.
 * Includes validation, detailed logging, and proper async/await.
 */
export async function POST(request: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[API][${requestId}] Request received at /api/send-email`);

  try {
    // 0. Authorization Failsafe: Only allow authenticated users
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(`[API][${requestId}] Unauthorized: Missing token.`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!adminAuth) {
      console.error(`[API][${requestId}] Firebase Admin Auth not initialized.`);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    try {
      await adminAuth.verifyIdToken(idToken);
    } catch (e: any) {
      console.warn(`[API][${requestId}] Unauthorized: Invalid token.`, e.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // 1. Validation with Zod
    const validation = SendEmailSchema.safeParse(body);
    if (!validation.success) {
      console.warn(`[API][${requestId}] Validation failed:`, validation.error.format());
      return NextResponse.json({ 
        error: "Invalid request data", 
        details: validation.error.format() 
      }, { status: 400 });
    }

    const { to, subject, html } = validation.data;

    console.log(`[API][${requestId}] Payload valid. Sending email...`);

    // 2. Send Email
    const result = await sendEmail({ to: to as any, subject, html });

    if (!result.success) {
      console.error(`[API][${requestId}] Email sending failed:`, result.error);
      return NextResponse.json({ 
        success: false, 
        error: result.error, 
        details: result.details 
      }, { status: 500 });
    }

    console.log(`[API][${requestId}] Email sent successfully!`);
    return NextResponse.json({ 
      success: true, 
      message: 'Email accepted by SendGrid' 
    });

  } catch (error: any) {
    console.error(`[API][${requestId}] Unexpected error:`, error.message);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal Server Error', 
      details: error.message 
    }, { status: 500 });
  }
}
