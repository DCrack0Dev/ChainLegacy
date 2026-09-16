import { v1Route, structuredJson } from '@/lib/v1-route';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/api-errors';
import { LegacyPlan } from '@/types/enterprise';
import { SystemEvent } from '@/services/events';
import {
  processWebhookEnqueue,
  makeWebhookDeliveryEvent,
  logV1Event,
  genId,
  queryOrgCollection,
} from '@/services/enterprise/v1-helpers';
export const dynamic = 'force-dynamic';

const CheckInSchema = z.object({ legacyPlanId: z.string().min(1) });

export const GET = v1Route({
  method: 'GET',
  scope: 'liveness:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const legacyPlanId = searchParams.get('legacyPlanId');
    if (!legacyPlanId) {
      const { items, total } = await queryOrgCollection(
        organizationId,
        'legacyPlans',
        [],
        pagination,
      );
      return structuredJson({
        data: items.map((p: any) => ({
          legacyPlanId: p.id,
          organizationId: p.organizationId,
          stage: p.status === 'active' ? 'active' : (p.status ?? 'active'),
          lastCheckInAt: p.lastCheckInAt ?? null,
          nextEscalationAt: p.nextEscalationAt ?? null,
          suspicionScore: p.suspicionScore ?? 0,
        })),
        meta: { organizationId, total },
      });
    }
    let plan: LegacyPlan | null = null;
    if (adminDb) {
      const snap = await adminDb
        .collection('organizations')
        .doc(organizationId)
        .collection('legacyPlans')
        .doc(legacyPlanId)
        .get();
      if (snap.exists) {
        const raw = snap.data() as any;
        if (raw.organizationId !== organizationId) {
          throw new ApiError(403, 'TENANT_MISMATCH', 'legacyPlanId belongs to another organization');
        }
        plan = raw as LegacyPlan;
      }
    }
    if (!plan) {
      return structuredJson({
        legacyPlanId,
        organizationId,
        stage: 'active',
        lastCheckInAt: null,
        nextEscalationAt: null,
        suspicionScore: 0,
      });
    }
    return structuredJson({
      legacyPlanId: plan.id,
      organizationId: plan.organizationId,
      stage: plan.status === 'active' ? 'active' : plan.status,
      lastCheckInAt: plan.lastCheckInAt ?? null,
      nextEscalationAt: plan.nextEscalationAt ?? null,
      suspicionScore: plan.suspicionScore ?? 0,
    });
  },
});

export const POST = v1Route({
  method: 'POST',
  scope: 'liveness:write',
  requireOrg: true,
  bodySchema: CheckInSchema,
  async handle({ auth, body, requestId, idempotencyKey }) {
    const organizationId = auth.organizationId!;
    const legacyPlanId = (body as any).legacyPlanId;
    const now = new Date();
    let intervalDays = 30;
    if (adminDb) {
      const ref = adminDb
        .collection('organizations')
        .doc(organizationId)
        .collection('legacyPlans')
        .doc(legacyPlanId);
      const snap = await ref.get();
      if (snap.exists) {
        const raw = snap.data() as any;
        if (raw.organizationId !== organizationId) {
          throw new ApiError(403, 'TENANT_MISMATCH', 'legacyPlanId belongs to another organization');
        }
        intervalDays = Number(raw.intervalDays ?? 30) || 30;
        await ref.update({
          lastCheckInAt: now,
          nextEscalationAt: new Date(now.getTime() + intervalDays * 24 * 3600 * 1000),
          status: 'active',
          updatedAt: now,
        });
      } else {
        throw new ApiError(404, 'LEGACY_PLAN_NOT_FOUND', `legacyPlanId ${legacyPlanId} not found under this organization`);
      }
    }
    const nextEscalationAt = new Date(now.getTime() + intervalDays * 24 * 3600 * 1000);
    const livenessReset = {
      organizationId,
      legacyPlanId,
      lastCheckInAt: now,
      nextEscalationAt,
      stage: 'active' as const,
    };
    await logV1Event(auth, SystemEvent.LIVENESS_RESET, { livenessReset }, {
      requestId,
      resource: { type: 'legacyPlan', id: legacyPlanId },
    });
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'liveness.reset',
      organizationId,
      { livenessReset },
      { idempotencyKey: idempotencyKey ?? undefined, requestId, actor: (auth as any).actorId },
    );
    await processWebhookEnqueue(organizationId, evt);
    return structuredJson({
      organizationId,
      legacyPlanId,
      lastCheckInAt: now,
      nextEscalationAt,
      stage: 'active',
      webhookEvent: 'liveness.reset',
      audit: 'LIVENESS_RESET',
      requestId,
    });
  },
});
