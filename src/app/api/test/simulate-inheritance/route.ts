import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
const TEST_USER_ID = 'test-simulation-user';

export async function GET(request: Request) {
  const requestId = 'sim_' + Math.random().toString(36).slice(2, 14);
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ code: 'NOT_AVAILABLE', error: 'Simulation routes are disabled in production', requestId }, { status: 404 });
  }
  const devKey = process.env.DEV_SIMULATION_KEY;
  if (devKey) {
    const auth = request.headers.get('authorization');
    if (!auth || auth !== `Bearer ${devKey}`) {
      return NextResponse.json({ code: 'SIM_KEY_REQUIRED', error: 'Authorize with DEV_SIMULATION_KEY Bearer token', requestId }, { status: 401 });
    }
  }
  if (!adminDb) return NextResponse.json({ code: 'DB_DOWN', error: 'DB not initialized', requestId }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const userRef = adminDb.collection('users').doc(TEST_USER_ID);
  try {
    if (action === 'reset') {
      const vaultRef = adminDb.collection('vaults').doc(TEST_USER_ID);
      const now = Date.now();
      await userRef.set({
        email: 'test@example.com', name: 'Test Owner', hasSetup: true, uid: TEST_USER_ID,
        createdAt: FieldValue.serverTimestamp(),
        logs: [{ action: 'reset', timestamp: new Date().toISOString(), details: 'Simulation reset to active status', requestId }],
      });
      await vaultRef.set({
        id: TEST_USER_ID, ownerId: TEST_USER_ID, status: 'active', lastCheckIn: now, interval: 0.0001,
        contacts: [{ id: 'test-ben-1', email: 'beneficiary@example.com', name: 'Test Beneficiary', role: 'beneficiary', share: 100 }],
        createdAt: now, updatedAt: now,
      });
      return NextResponse.json({ code: 'OK', success: true, message: 'Test user and vault reset to active', requestId });
    }
    if (action === 'fast-forward') {
      const vaultRef = adminDb.collection('vaults').doc(TEST_USER_ID);
      const v = await vaultRef.get();
      if (!v.exists) return NextResponse.json({ code: 'NOT_FOUND', error: 'Run reset first', requestId }, { status: 404 });
      const ff = Date.now() - 5 * 60 * 1000;
      await vaultRef.update({ lastCheckIn: ff, updatedAt: Date.now() });
      await userRef.update({
        logs: FieldValue.arrayUnion({ action: 'fast_forward', timestamp: new Date().toISOString(), details: `Fast-forwarded vault from ${v.data()?.status ?? 'unknown'}.`, requestId }),
      });
      return NextResponse.json({ code: 'OK', success: true, message: 'Fast-forwarded. Call /api/cron/check-status.', requestId });
    }
    const userDoc = await userRef.get();
    return NextResponse.json({
      user: userDoc.exists ? userDoc.data() : null, requestId,
      instructions: { reset: '?action=reset', fastForward: '?action=fast-forward', runCron: '/api/cron/check-status' },
    });
  } catch (e: any) {
    return NextResponse.json({ code: 'INTERNAL', error: e.message, requestId }, { status: 500 });
  }
}
