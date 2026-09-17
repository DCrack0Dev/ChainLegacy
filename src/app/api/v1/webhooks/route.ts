import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListWebhooksSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ListWebhooksSchema.safeParse(Object.fromEntries(searchParams));
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.format() }, { status: 400 });
    }

    const { limit, offset } = parsed.data;
    const orgId = 'org_legacy_migration';

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    const query = db
      .collection('organizations').doc(orgId)
      .collection('webhookEndpoints')
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc');

    const snap = await query.limit(limit + 1).offset(offset).get();
    const webhooks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const hasMore = webhooks.length > limit;
    const items = hasMore ? webhooks.slice(0, limit) : webhooks;

    return NextResponse.json({
      data: items,
      meta: { limit, offset, hasMore, total: items.length + offset },
    });

  } catch (error: any) {
    console.error('[Enterprise Webhooks List] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  description: z.string().optional(),
  events: z.array(z.string()).min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateWebhookSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const orgId = 'org_legacy_migration';
    const { url, description, events } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    const webhookId = `whe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const secret = require('crypto').randomBytes(32).toString('hex');
    const now = new Date();

    const webhook = {
      id: webhookId,
      organizationId: orgId,
      url,
      description,
      events,
      secret,
      signingAlgo: 'HMAC-SHA256',
      enabled: true,
      consecutiveFailures: 0,
      disabledAt: null,
      lastDeliveredAt: null,
      createdAt: now,
    };

    await db
      .collection('organizations').doc(orgId)
      .collection('webhookEndpoints').doc(webhookId).set(webhook);

    return NextResponse.json({ webhook: { ...webhook, secret } }, { status: 201 });

  } catch (error: any) {
    console.error('[Enterprise Webhook Create] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}