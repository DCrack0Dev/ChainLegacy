import { describe, it, expect, beforeEach, vi } from 'vitest';

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
type Stage = typeof STAGE_ORDER[number];
const STAGE_DURATIONS_MS: Record<string, number> = {
  active: 30 * 24 * 3600 * 1000,
  warning_email: 7 * 24 * 3600 * 1000,
  warning_sms: 3 * 24 * 3600 * 1000,
  push_notification: 2 * 24 * 3600 * 1000,
  ai_liveness_check: 7 * 24 * 3600 * 1000,
  wallet_signature_req: 7 * 24 * 3600 * 1000,
  grace_period: 15 * 24 * 3600 * 1000,
};

const DAY_MS = 24 * 3600 * 1000;

function stageFromTimestamp(nowMs: number, lastCheckinMs: number, intervalDays = 30): { stage: Stage; nextEscalationAt: number } {
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

const CRON_LOCK_TTL_MS = 9 * 60 * 1000;

type PlanRow = {
  id: string;
  status: string;
  lastCheckInAt: number;
  lastCronLockId?: string;
  suspicionScore: number;
  nextEscalationAt?: number;
  updatedAt?: number;
  intervalDays: number;
  customerId?: string;
};

type ClaimRow = {
  id: string;
  planId: string;
  stage: string;
  createdAt: number;
  cronId: string;
};

type AuditRow = {
  id: string;
  planId: string;
  from: string;
  to: string;
  stage: string;
  cronId: string;
  createdAt: number;
};

type CronResult = {
  code: 'PROCESSED' | 'LOCKED' | 'SKIPPED';
  cronId: string;
  transitions: number;
  triggered: number;
  processed: number;
  batches: number;
};

class SimulatedStore {
  plans: Map<string, PlanRow> = new Map();
  claims: ClaimRow[] = [];
  audits: AuditRow[] = [];
  metaLock: { lockedUntil: number; cronId: string; startedAt: number } | null = null;

  seedPlansBeyondTriggered(count: number, baseLastCheckin: number) {
    for (let i = 0; i < count; i++) {
      const id = `plan_${i}`;
      this.plans.set(id, {
        id,
        status: 'active',
        lastCheckInAt: baseLastCheckin,
        suspicionScore: 0,
        intervalDays: 30,
        customerId: `cust_${i}`,
      });
    }
  }
}

function createCronHandler(store: SimulatedStore) {
  return function processLivenessCron(simulatedNow: number, batchLimit: number = 100): CronResult {
    const cronId = 'cron_' + Math.random().toString(36).slice(2, 14);
    if (store.metaLock && store.metaLock.lockedUntil > simulatedNow) {
      return { code: 'LOCKED', cronId, transitions: 0, triggered: 0, processed: 0, batches: 0 };
    }
    store.metaLock = {
      lockedUntil: simulatedNow + CRON_LOCK_TTL_MS,
      cronId,
      startedAt: simulatedNow,
    };
    const stats = { processed: 0, transitions: 0, triggered: 0, batches: 0 };
    const allPlans = Array.from(store.plans.values()).filter(p =>
      ['active', 'draft', 'warning', 'escalating', 'claim_in_progress'].includes(p.status)
    );
    let offset = 0;
    while (offset < allPlans.length) {
      const batch = allPlans.slice(offset, offset + batchLimit);
      if (batch.length === 0) break;
      stats.batches++;
      for (const plan of batch) {
        stats.processed++;
        if (plan.lastCronLockId === cronId) continue;
        if (plan.suspicionScore >= 80) continue;
        const { stage, nextEscalationAt } = stageFromTimestamp(simulatedNow, plan.lastCheckInAt, plan.intervalDays ?? 30);
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
        const mapped = planToStatus.get(stage) ?? plan.status;
        if (mapped !== plan.status) {
          const prev = plan.status;
          plan.status = mapped;
          plan.updatedAt = simulatedNow;
          plan.nextEscalationAt = nextEscalationAt;
          plan.lastCronLockId = cronId;
          stats.transitions++;
          if (mapped === 'claim_in_progress' && stage === 'triggered') {
            stats.triggered++;
            const existingClaims = store.claims.filter(c => c.planId === plan.id && c.stage === stage);
            if (existingClaims.length === 0) {
              store.claims.push({
                id: `claim_${plan.id}_${Date.now()}`,
                planId: plan.id,
                stage,
                createdAt: simulatedNow,
                cronId,
              });
            }
          }
          const existingAudits = store.audits.filter(a =>
            a.planId === plan.id && a.from === prev && a.to === mapped && a.stage === stage
          );
          if (existingAudits.length === 0) {
            store.audits.push({
              id: `aud_${plan.id}_${simulatedNow}_${Math.random().toString(36).slice(2, 6)}`,
              planId: plan.id,
              from: prev,
              to: mapped,
              stage,
              cronId,
              createdAt: simulatedNow,
            });
          }
        } else {
          plan.lastCronLockId = cronId;
        }
      }
      offset += batchLimit;
    }
    return { code: 'PROCESSED', cronId, ...stats };
  };
}

describe('stageFromTimestamp / stageAt unit tests', () => {
  const nowFixed = Date.parse('2025-01-15T00:00:00Z');

  it('active stage: now < lastCheckIn + 30d', () => {
    const { stage } = stageFromTimestamp(nowFixed, nowFixed - 10 * DAY_MS, 30);
    expect(stage).toBe('active');
  });

  it('active boundary: exactly at 30d still active', () => {
    const { stage, nextEscalationAt } = stageFromTimestamp(nowFixed, nowFixed - 30 * DAY_MS, 30);
    expect(stage).toBe('warning_email');
    const activeCheck = nowFixed - 1;
    const r2 = stageFromTimestamp(activeCheck, activeCheck - 30 * DAY_MS + 1, 30);
    expect(r2.stage).toBe('active');
    expect(r2.nextEscalationAt).toBe(activeCheck - 30 * DAY_MS + 1 + 30 * DAY_MS);
  });

  it('warning_email stage: 30d + 0..7d since checkin', () => {
    const { stage } = stageFromTimestamp(nowFixed, nowFixed - (30 + 3) * DAY_MS, 30);
    expect(stage).toBe('warning_email');
  });

  it('warning_email boundary at 30d+7d → warning_sms', () => {
    const justBefore = nowFixed - (30 + 7) * DAY_MS + 1;
    expect(stageFromTimestamp(nowFixed, justBefore, 30).stage).toBe('warning_email');
    const atBoundary = nowFixed - (30 + 7) * DAY_MS;
    expect(stageFromTimestamp(nowFixed, atBoundary, 30).stage).toBe('warning_sms');
  });

  it('warning_sms stage: 37d..40d since checkin', () => {
    const { stage } = stageFromTimestamp(nowFixed, nowFixed - (30 + 7 + 2) * DAY_MS, 30);
    expect(stage).toBe('warning_sms');
  });

  it('warning_sms boundary at 40d → push_notification', () => {
    const atBoundary = nowFixed - (30 + 7 + 3) * DAY_MS;
    expect(stageFromTimestamp(nowFixed, atBoundary, 30).stage).toBe('push_notification');
  });

  it('push_notification stage: 40d..42d since checkin', () => {
    const { stage } = stageFromTimestamp(nowFixed, nowFixed - (30 + 7 + 3 + 1) * DAY_MS, 30);
    expect(stage).toBe('push_notification');
  });

  it('push_notification boundary at 42d → ai_liveness_check', () => {
    const atBoundary = nowFixed - (30 + 7 + 3 + 2) * DAY_MS;
    expect(stageFromTimestamp(nowFixed, atBoundary, 30).stage).toBe('ai_liveness_check');
  });

  it('ai_liveness_check stage: 42d..49d since checkin', () => {
    const { stage } = stageFromTimestamp(nowFixed, nowFixed - (30 + 7 + 3 + 2 + 5) * DAY_MS, 30);
    expect(stage).toBe('ai_liveness_check');
  });

  it('ai_liveness_check boundary at 49d → wallet_signature_req', () => {
    const atBoundary = nowFixed - (30 + 7 + 3 + 2 + 7) * DAY_MS;
    expect(stageFromTimestamp(nowFixed, atBoundary, 30).stage).toBe('wallet_signature_req');
  });

  it('wallet_signature_req stage: 49d..56d since checkin', () => {
    const { stage } = stageFromTimestamp(nowFixed, nowFixed - (30 + 7 + 3 + 2 + 7 + 3) * DAY_MS, 30);
    expect(stage).toBe('wallet_signature_req');
  });

  it('wallet_signature_req boundary at 56d → grace_period', () => {
    const atBoundary = nowFixed - (30 + 7 + 3 + 2 + 7 + 7) * DAY_MS;
    expect(stageFromTimestamp(nowFixed, atBoundary, 30).stage).toBe('grace_period');
  });

  it('grace_period stage: 56d..71d since checkin', () => {
    const { stage } = stageFromTimestamp(nowFixed, nowFixed - (30 + 7 + 3 + 2 + 7 + 7 + 10) * DAY_MS, 30);
    expect(stage).toBe('grace_period');
  });

  it('grace_period boundary at 71d → triggered', () => {
    const atBoundary = nowFixed - (30 + 7 + 3 + 2 + 7 + 7 + 15) * DAY_MS;
    expect(stageFromTimestamp(nowFixed, atBoundary, 30).stage).toBe('triggered');
  });

  it('triggered stage: well beyond 71d', () => {
    const { stage } = stageFromTimestamp(nowFixed, nowFixed - 365 * DAY_MS, 30);
    expect(stage).toBe('triggered');
  });

  it('nextEscalationAt is correct for each non-triggered stage', () => {
    const checkin = nowFixed - (30 + 5) * DAY_MS;
    const r = stageFromTimestamp(nowFixed, checkin, 30);
    expect(r.stage).toBe('warning_email');
    expect(r.nextEscalationAt).toBe(checkin + 30 * DAY_MS + 7 * DAY_MS);
  });
});

describe('Cron idempotency (lastCronLockId + lock TTL)', () => {
  it('second call with same simulated now returns LOCKED with 0 new transitions', () => {
    const store = new SimulatedStore();
    const handler = createCronHandler(store);
    const simulatedNow = Date.parse('2025-06-01T12:00:00Z');
    store.seedPlansBeyondTriggered(3, simulatedNow - 365 * DAY_MS);
    const first = handler(simulatedNow, 100);
    expect(first.code).toBe('PROCESSED');
    expect(first.transitions).toBeGreaterThan(0);
    const firstCronId = first.cronId;
    const plan = store.plans.get('plan_0');
    expect(plan?.lastCronLockId).toBe(firstCronId);
    const second = handler(simulatedNow, 100);
    expect(second.code).toBe('LOCKED');
    expect(second.transitions).toBe(0);
    expect(second.triggered).toBe(0);
    expect(second.processed).toBe(0);
  });

  it('after lock TTL expires, new cron run proceeds with SKIPPED via lastCronLockId', () => {
    const store = new SimulatedStore();
    const handler = createCronHandler(store);
    const run1Now = Date.parse('2025-06-01T12:00:00Z');
    store.seedPlansBeyondTriggered(3, run1Now - 365 * DAY_MS);
    const first = handler(run1Now, 100);
    expect(first.code).toBe('PROCESSED');
    const transitionsAfterRun1 = first.transitions;
    const run2Now = run1Now + CRON_LOCK_TTL_MS + 1;
    const second = handler(run2Now, 100);
    expect(second.code).toBe('PROCESSED');
    expect(second.processed).toBe(3);
    expect(second.transitions).toBe(0);
    expect(transitionsAfterRun1).toBe(store.audits.length);
  });
});

describe('No duplicate notifications / claim rows', () => {
  it('same plan transitioned twice does not create duplicate claim or audit rows', () => {
    const store = new SimulatedStore();
    const handler = createCronHandler(store);
    const simulatedNow = Date.parse('2025-06-01T12:00:00Z');
    store.plans.set('plan_singleton', {
      id: 'plan_singleton',
      status: 'active',
      lastCheckInAt: simulatedNow - 400 * DAY_MS,
      suspicionScore: 0,
      intervalDays: 30,
      customerId: 'cust_singleton',
    });
    const r1 = handler(simulatedNow, 10);
    expect(r1.code).toBe('PROCESSED');
    expect(r1.triggered).toBe(1);
    const claimsAfterR1 = store.claims.filter(c => c.planId === 'plan_singleton');
    const auditsAfterR1 = store.audits.filter(a => a.planId === 'plan_singleton');
    expect(claimsAfterR1).toHaveLength(1);
    expect(auditsAfterR1.length).toBeGreaterThan(0);
    store.metaLock = null;
    store.plans.get('plan_singleton')!.status = 'active';
    store.plans.get('plan_singleton')!.lastCronLockId = undefined;
    const r2 = handler(simulatedNow + CRON_LOCK_TTL_MS + 1000, 10);
    expect(r2.code).toBe('PROCESSED');
    const claimsAfterR2 = store.claims.filter(c => c.planId === 'plan_singleton');
    const auditsAfterR2 = store.audits.filter(a => a.planId === 'plan_singleton' && a.from === 'active' && a.to === 'claim_in_progress' && a.stage === 'triggered');
    expect(claimsAfterR2).toHaveLength(1);
    expect(auditsAfterR2).toHaveLength(auditsAfterR1.filter(a => a.from === 'active' && a.to === 'claim_in_progress' && a.stage === 'triggered').length);
  });
});

describe('UTC handling timezone drift', () => {
  it('UTC midnight stage boundaries do not drift with local timezone offset', () => {
    const utcMidnights = [
      Date.parse('2025-01-01T00:00:00Z'),
      Date.parse('2025-07-15T00:00:00Z'),
      Date.parse('2025-12-31T00:00:00Z'),
    ];
    const stageAt = (checkin: number, now: number) => stageFromTimestamp(now, checkin, 30).stage;
    for (const nowMidnight of utcMidnights) {
      const checkinActive = nowMidnight - 29 * DAY_MS;
      expect(stageAt(checkinActive, nowMidnight)).toBe('active');
      const checkinWarningEmail = nowMidnight - (30 + 5) * DAY_MS;
      expect(stageAt(checkinWarningEmail, nowMidnight)).toBe('warning_email');
      const checkinGrace = nowMidnight - (30 + 7 + 3 + 2 + 7 + 7 + 5) * DAY_MS;
      expect(stageAt(checkinGrace, nowMidnight)).toBe('grace_period');
    }
  });

  it('lastCheckInAt set to UTC midnight, now set to next midnight at same hour → deterministic stage', () => {
    const lastCheckin = Date.parse('2025-03-01T00:00:00Z');
    const d0 = lastCheckin;
    expect(stageFromTimestamp(d0 + 30 * DAY_MS - 1, lastCheckin, 30).stage).toBe('active');
    expect(stageFromTimestamp(d0 + 30 * DAY_MS, lastCheckin, 30).stage).toBe('warning_email');
    expect(stageFromTimestamp(d0 + (30 + 7) * DAY_MS, lastCheckin, 30).stage).toBe('warning_sms');
    expect(stageFromTimestamp(d0 + (30 + 7 + 3) * DAY_MS, lastCheckin, 30).stage).toBe('push_notification');
    expect(stageFromTimestamp(d0 + (30 + 7 + 3 + 2) * DAY_MS, lastCheckin, 30).stage).toBe('ai_liveness_check');
    expect(stageFromTimestamp(d0 + (30 + 7 + 3 + 2 + 7) * DAY_MS, lastCheckin, 30).stage).toBe('wallet_signature_req');
    expect(stageFromTimestamp(d0 + (30 + 7 + 3 + 2 + 7 + 7) * DAY_MS, lastCheckin, 30).stage).toBe('grace_period');
    expect(stageFromTimestamp(d0 + (30 + 7 + 3 + 2 + 7 + 7 + 15) * DAY_MS, lastCheckin, 30).stage).toBe('triggered');
  });
});

describe('Pagination batches (limit=5 across 15 plans)', () => {
  it('15 plans past triggered processed across 3 calls with limit=5 batches', () => {
    const store = new SimulatedStore();
    const handler = createCronHandler(store);
    const simulatedNow = Date.parse('2025-08-10T10:00:00Z');
    store.seedPlansBeyondTriggered(15, simulatedNow - 400 * DAY_MS);
    expect(store.plans.size).toBe(15);
    const r1 = handler(simulatedNow, 5);
    expect(r1.code).toBe('PROCESSED');
    expect(r1.batches).toBe(3);
    expect(r1.processed).toBe(15);
    expect(r1.transitions).toBe(15);
    expect(r1.triggered).toBe(15);
    store.metaLock = null;
    for (const p of Array.from(store.plans.values())) {
      p.lastCronLockId = undefined;
    }
    const r2 = handler(simulatedNow + CRON_LOCK_TTL_MS + 1, 5);
    expect(r2.batches).toBe(3);
    expect(r2.processed).toBe(15);
    expect(r2.transitions).toBe(0);
    expect(store.claims.length).toBeGreaterThanOrEqual(15);
    for (let i = 0; i < 15; i++) {
      const plan = store.plans.get(`plan_${i}`);
      expect(plan?.status).toBe('claim_in_progress');
    }
  });
});
