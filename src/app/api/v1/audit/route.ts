import { v1Route, structuredJson } from '@/lib/v1-route';
import { queryOrgCollection } from '@/services/enterprise/v1-helpers';
import { adminDb } from '@/lib/firebase-admin';
export const dynamic = 'force-dynamic';

export const GET = v1Route({
  method: 'GET',
  scope: 'audit:read',
  requireOrg: true,
  async handle({ auth, searchParams, pagination }) {
    const organizationId = auth.organizationId!;
    const event = searchParams.get('event');
    const resource = searchParams.get('resource');
    const actor = searchParams.get('actor');
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const filters: Array<[string, string, any]> = [];
    if (event) filters.push(['event', '==', event]);
    if (resource) filters.push(['resourceType', '==', resource]);
    if (actor) filters.push(['actor.id', '==', actor]);
    if (start || end) {
      const events: any[] = [];
      if (adminDb) {
        const snap = await adminDb
          .collection('organizations').doc(organizationId)
          .collection('auditEvents')
          .orderBy('createdAt', 'desc')
          .limit(500)
          .get();
        snap.forEach((d: any) => events.push(d.data()));
      }
      const startMs = start ? new Date(start).getTime() : -Infinity;
      const endMs = end ? new Date(end).getTime() : Infinity;
      const filtered = events.filter((e: any) => {
        const ct = typeof e.createdAt?.toDate === 'function' ? e.createdAt.toDate().getTime()
          : e.createdAt instanceof Date ? e.createdAt.getTime()
          : typeof e.createdAt === 'number' ? e.createdAt
          : new Date(e.createdAt ?? 0).getTime();
        return ct >= startMs && ct <= endMs;
      });
      return structuredJson({
        data: filtered,
        meta: {
          organizationId, event, resource, actor, start, end,
          total: filtered.length,
          pagination,
          redacted: true,
        },
      });
    }
    const { items, total } = await queryOrgCollection(
      organizationId,
      'auditEvents',
      filters,
      pagination,
    );
    return structuredJson({
      data: items,
      meta: {
        organizationId,
        event,
        resource,
        actor,
        start,
        end,
        pagination,
        total,
        redacted: true,
      },
    });
  },
});
