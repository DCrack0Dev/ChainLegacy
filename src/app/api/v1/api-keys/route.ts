import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { createApiKeyPrefix, createId } from '@/services/enterprise/persistence';
import { API_SCOPES } from '@/types/enterprise';
import { createHash, randomBytes } from 'node:crypto';

export const dynamic = 'force-dynamic';

const ListApiKeysSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ListApiKeysSchema.safeParse(Object.fromEntries(searchParams));
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.format() }, { status: 400 });
    }

    const { limit, offset } = parsed.data;
    const orgId = 'org_legacy_migration';

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    let query = db
      .collection('organizations').doc(orgId)
      .collection('apiKeys')
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc');

    const snap = await query.limit(limit + 1).offset(offset).get();
    const apiKeys = snap.docs.map(doc => {
      const data = doc.data();
      // Never return the keyHash
      const { keyHash, ...safeData } = data;
      return { id: doc.id, ...safeData };
    });
    
    const hasMore = apiKeys.length > limit;
    const items = hasMore ? apiKeys.slice(0, limit) : apiKeys;

    return NextResponse.json({
      data: items,
      meta: { limit, offset, hasMore, total: items.length + offset },
    });

  } catch (error: unknown) {
    console.error('[Enterprise API Keys List] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const CreateApiKeySchema = z.object({
  name: z.string().min(1),
  env: z.enum(['sandbox', 'production']).default('sandbox'),
  scopes: z.array(z.enum(API_SCOPES)).default([]),
  expiresAt: z.coerce.date().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateApiKeySchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const orgId = 'org_legacy_migration';
    const { name, env, scopes, expiresAt } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const db = adminDb;

    const apiKeyId = createId('apiKey');
    const prefix = createApiKeyPrefix(env);
    const secret = `${prefix}${apiKeyId}.${randomBytes(32).toString('base64url')}`;
    const keyHash = createHash('sha256').update(secret).digest('hex');
    const now = new Date();

    const apiKey = {
      id: apiKeyId,
      organizationId: orgId,
      name,
      env,
      prefix,
      keyHash,
      scopes,
      expiresAt: expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      disabled: false,
      createdAt: now,
    };

    await db
      .collection('organizations').doc(orgId)
      .collection('apiKeys').doc(apiKeyId).set(apiKey);

    // Return the secret only once
    return NextResponse.json({ apiKey: { ...apiKey, secret } }, { status: 201 });

  } catch (error: unknown) {
    console.error('[Enterprise API Key Create] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
