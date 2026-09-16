import { NextRequest } from 'next/server';
import { v1Route, structuredJson } from '@/lib/v1-route';
import { ApiError } from '@/lib/api-errors';
import { OrganizationCreateSchema } from '@/types/enterprise';
import { OrganizationService } from '@/services/enterprise/organization';
import { adminDb } from '@/lib/firebase-admin';
import { EventService, SystemEvent } from '@/services/events';
import { processWebhookEnqueue, makeWebhookDeliveryEvent, genId } from '@/services/enterprise/v1-helpers';

export const dynamic = 'force-dynamic';

export const POST = v1Route({
  method: 'POST',
  bodySchema: OrganizationCreateSchema,
  requireOrg: false,
  orgPayloadGuard: false,
  async handle({ body, auth, requestId }) {
    if (auth.method !== 'firebase' || !auth.uid) {
      throw new ApiError(
        401,
        'AUTH_REQUIRED',
        'Organization onboarding requires authenticated owner session',
      );
    }
    const ownerUid = auth.uid;
    const existingSlugs = new Set<string>();
    if (adminDb) {
      const orgsSnap = await adminDb.collection('organizations').select('slug').get();
      orgsSnap.forEach((d: any) => existingSlugs.add(d.data().slug));
    }
    const { organization, defaultSandboxKey } = OrganizationService.create({
      ...body,
      ownerUid,
      existingSlugs,
    });
    if (adminDb) {
      const batch = adminDb.batch();
      batch.set(adminDb.collection('organizations').doc(organization.id), { ...organization });
      batch.set(
        adminDb
          .collection('organizations')
          .doc(organization.id)
          .collection('apiKeys')
          .doc(defaultSandboxKey.row.id),
        { ...defaultSandboxKey.row },
      );
      batch.set(
        adminDb.collection('ownerUidToOrgId').doc(ownerUid),
        { organizationId: organization.id, uid: ownerUid, createdAt: organization.createdAt },
        { merge: true },
      );
      await batch.commit();
    }
    const userId = auth.uid;
    const actor = { type: 'user' as const, id: auth.uid };
    await EventService.logEvent(userId, SystemEvent.ORG_CREATED, { organization }, {
      organizationId: organization.id,
      actor,
      requestId,
      resource: { type: 'organization', id: organization.id },
      result: 'success',
    });
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'organization.created',
      organization.id,
      { organization: { id: organization.id, name: organization.name, slug: organization.slug, status: organization.status, country: organization.country, createdAt: organization.createdAt } },
      { requestId, actor: actor.id },
    );
    await processWebhookEnqueue(organization.id, evt);
    return structuredJson({
      organizationId: organization.id,
      organization: { id: organization.id, name: organization.name, slug: organization.slug, status: organization.status, country: organization.country, createdAt: organization.createdAt },
      defaultSandboxKey: {
        id: defaultSandboxKey.row.id,
        name: defaultSandboxKey.row.name,
        scopes: defaultSandboxKey.row.scopes,
        secret: defaultSandboxKey.secret,
        note: 'Store the secret now. It will never be returned again.',
      },
      requestId,
    }, 201);
  },
});

export function GET(req: NextRequest) {
  return structuredJson({ endpoints: ['POST /api/v1/organizations'], status: 'ok' });
}
