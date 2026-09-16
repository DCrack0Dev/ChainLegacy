import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { EventService, SystemEvent } from '@/services/events';

export const dynamic = 'force-dynamic';

const CRON_LOCK_TTL_MS = 9 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;

const STAGE_ORDER = [
  'active',
  'warning_email',
  'warning_sms',
  'push_notification',
  'ai_liveness_check',
  'wallet_signature_req',
  'grace_period',
  'triggered',
] as const;
const STAGE_DURATIONS_MS: Record<string, number> = {
  active: 30 * 24 * 3600 * 1000,
  warning_email: 7 * 24 * 3600 * 1000,
  warning_sms: 3 * 24 * 3600 * 1000,
  push_notification: 2 * 24 * 3600 * 1000,
  ai_liveness_check: 7 * 24 * 3600 * 1000,
  wallet_signature_req: 7 * 24 * 3600 * 1000,
  grace_period: 15 * 24 * 3600 * 1000,
};

function stageFromTimestamp(nowMs: number, lastCheckinMs: number, intervalDays = 30): { stage: typeof STAGE_ORDER[number]; nextEscalationAt: number } {
  const activeMs = intervalDays * 24 * 3600 * 1000;
  let cursor = lastCheckinMs + activeMs;
  if (nowMs < cursor) return { stage: 'active', nextEscalationAt: cursor };
  for (let i = 1; i < STAGE_ORDER.length - 1; i++) {
    const s = STAGE_ORDER[i];
    const d = STAGE_DURATIONS_MS[s];
    const next = cursor + d;
    if (nowMs < next) return { stage: s, nextEscalationAt: next };
    cursor = next;
  }
  return { stage: 'triggered', nextEscalationAt: cursor };
}

export async function GET(request: Request) {
  const cronId = 'cron_' + Math.random().toString(36).slice(2, 14);
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === 'production') {
      if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ code: 'CRON_AUTH_REQUIRED', error: 'Unauthorized cron', cronId }, { status: 401 });
      }
    }
    if (!adminDb) return NextResponse.json({ code: 'DB_DOWN', error: 'DB not initialized', cronId }, { status: 500 });

    const metaRef = adminDb.collection('SystemMeta').doc('cron_lock_liveness');
    const now = Date.now();
    const lock = await metaRef.get();
    if (lock.exists) {
      const l = lock.data()!;
      if (l.lockedUntil?.toMillis?.() > now || (typeof l.lockedUntil === 'number' && l.lockedUntil > now)) {
        return NextResponse.json({ code: 'LOCKED', info: 'Another cron run holds the lock (9-min TTL). Skipping this run.', cronId });
      }
    }
    await metaRef.set({ lockedUntil: now + CRON_LOCK_TTL_MS, cronId, startedAt: now }, { merge: true });

    const stats = {
      processed: 0,
      transitions: 0,
      triggered: 0,
      errors: 0,
      frozen: 0,
      batches: 0,
    };

    // Consumer vaults
    let cursor: any = undefined;
    while (true) {
      let q = adminDb!.collection('vaults').where('status', 'not-in', ['triggered', 'completed', 'cancelled']).limit(DEFAULT_BATCH_SIZE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      stats.batches++;
      for (const doc of snap.docs) {
        try {
          stats.processed++;
          const v = doc.data();
          const ownerId = v.ownerId ?? doc.id;
          const lastCronLockId = v.lastCronLockId as string | undefined;
          if (lastCronLockId === cronId) continue;
          const suspicion = typeof v.suspicionScore === 'number' ? v.suspicionScore : 0;
          if (suspicion >= 80 || v.isVaultFrozen) { stats.frozen++; continue; }
          const lastCheckin =
            v.lastCheckInAt?.toMillis?.() ??
            (typeof v.lastCheckInAt === 'number' ? v.lastCheckInAt : Number(v.lastCheckIn ?? Date.now()));
          const intervalDays = typeof v.interval === 'number' ? Math.max(1, v.interval) : 30;
          const { stage, nextEscalationAt } = stageFromTimestamp(Date.now(), lastCheckin, intervalDays);
          if (stage !== (v.status ?? 'active')) {
            const prev = v.status ?? 'active';
            await doc.ref.update({ status: stage, updatedAt: Date.now(), nextEscalationAt, lastCronLockId: cronId });
            stats.transitions++;
            if (stage === 'triggered') stats.triggered++;
            try {
              await EventService.logEvent(ownerId, SystemEvent.LIVENESS_TRANSITION, {
                from: prev,
                to: stage,
                cronId,
                vaultId: doc.id,
                nextEscalationAt,
              }, { requestId: cronId, result: stats.triggered ? 'success' : undefined });
            } catch { /* swallow */ }
          } else {
            await doc.ref.update({ lastCronLockId: cronId });
          }
        } catch { stats.errors++; }
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < DEFAULT_BATCH_SIZE) break;
    }

    // Enterprise legacyPlans collectionGroup
    cursor = undefined;
    while (true) {
      let q = adminDb!.collectionGroup('legacyPlans').where('status', 'in', ['active', 'draft', 'warning', 'escalating', 'claim_in_progress']).limit(DEFAULT_BATCH_SIZE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      stats.batches++;
      for (const doc of snap.docs) {
        try {
          stats.processed++;
          const p = doc.data();
          const suspicion = typeof p.suspicionScore === 'number' ? p.suspicionScore : 0;
          if (suspicion >= 80 || p.status === 'completed' || p.status === 'cancelled') { stats.frozen++; continue; }
          const lastCheckInAt =
            p.lastCheckInAt?.toMillis?.() ??
            (typeof p.lastCheckInAt === 'number' ? p.lastCheckInAt : p.createdAt?.toMillis?.() ?? Date.now());
          const { stage, nextEscalationAt } = stageFromTimestamp(Date.now(), lastCheckInAt, p.intervalDays ?? 30);
          const planToStatus = new Map<string, string>([
            ['active', 'active'],
            ['warning_email', 'warning'],
            ['warning_sms', 'warning'],
            ['push_notification', 'escalating'],
            ['ai_liveness_check', 'escalating'],
            ['wallet_signature_req', 'escalating'],
            ['grace_period', 'claim_in_progress'],
            ['triggered', 'claim_in_progress'],
          ]);
          const mapped = planToStatus.get(stage) ?? p.status;
          if (mapped !== p.status) {
            const orgId = doc.ref.path.includes('/organizations/') ? doc.ref.path.split('/organizations/')[1]?.split('/')[0] : undefined;
            await doc.ref.update({ status: mapped, updatedAt: Date.now(), nextEscalationAt, lastCronLockId: cronId });
            stats.transitions++;
            if (mapped === 'claim_in_progress' && stage === 'triggered') stats.triggered++;
            if (orgId && p.customerId) {
              try {
                await EventService.logEvent(p.customerId, SystemEvent.SYSTEM_LIVENESS_CRON, {
                  from: p.status, to: mapped, stage, planId: doc.id, cronId,
                }, { organizationId: orgId, actor: { type: 'cron', id: cronId }, requestId: cronId });
              } catch { /* swallow */ }
            }
          } else {
            await doc.ref.update({ lastCronLockId: cronId });
          }
        } catch { stats.errors++; }
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < DEFAULT_BATCH_SIZE) break;
    }

    return NextResponse.json({ code: 'OK', cronId, stats, lockMs: CRON_LOCK_TTL_MS, message: 'UTC times only; browser clock never trusted; 9min TTL lock; 100-row paginated batches; per-row lastCronLockId idempotency.' });
  } catch (e: any) {
    return NextResponse.json({ code: 'INTERNAL', error: process.env.NODE_ENV === 'production' ? 'Server error' : e.message, cronId }, { status: 500 });
  }
}
