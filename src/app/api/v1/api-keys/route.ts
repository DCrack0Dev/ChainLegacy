import { v1Route, structuredJson } from '@/lib/v1-route';
import { z } from 'zod';
import { ApiKeyCreateSchema } from '@/types/enterprise';
import { EnterpriseApiKeyService } from '@/services/enterprise/apikey-service';
import { SystemEvent } from '@/services/events';
import { logV1Event, processWebhookEnqueue, makeWebhookDeliveryEvent, genId } from '@/services/enterprise/v1-helpers';
import { FirestorePersistenceBackend } from '@/services/enterprise/persistence';

export const dynamic = 'force-dynamic';

const persistence = new FirestorePersistenceBackend();
const apiKeyService = new EnterpriseApiKeyService(persistence as any);

const RevokeSchema = z.object({ keyId: z.string().min(1) });
const RotateSchema = z.object({ keyId: z.string().min(1) });

export const GET = v1Route({
  method: 'GET',
  scope: 'api_keys:read',
  requireOrg: true,
  async handle({ auth }) {
    const organizationId = auth.organizationId!;
    const includeDisabled = true;
    const keys = await apiKeyService.listKeys(organizationId, { includeDisabled });
    return structuredJson({
      data: keys,
      meta: {
        organizationId,
        note: 'keyHash is SHA-256 of secret; secret returned only on POST create or PATCH rotate; prefix clsbox_=sandbox, clprod_=production.',
        total: keys.length,
      },
    });
  },
});

export const POST = v1Route({
  method: 'POST',
  scope: 'api_keys:write',
  requireOrg: true,
  bodySchema: ApiKeyCreateSchema,
  async handle({ auth, body, requestId }) {
    const organizationId = auth.organizationId!;
    let plaintextSecret = '';
    const result = await apiKeyService.createKey({
      organizationId,
      ...body,
      showOnceCallback: (secret) => {
        plaintextSecret = secret;
      },
    });
    await logV1Event(auth, SystemEvent.API_KEY_CREATED, {
      key: {
        id: result.row.id,
        name: result.row.name,
        env: result.row.env,
        scopes: result.row.scopes,
        prefix: result.row.prefix,
      },
    }, {
      requestId,
      resource: { type: 'apiKey', id: result.row.id },
      result: 'success',
    });
    const actorId = auth.method === 'api_key' ? auth.keyId : auth.method === 'firebase' ? auth.uid : auth.actorId;
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'api_key.created',
      organizationId,
      {
        key: {
          id: result.row.id,
          name: result.row.name,
          env: result.row.env,
          prefix: result.row.prefix,
          scopes: result.row.scopes,
          expiresAt: result.row.expiresAt,
          createdAt: result.row.createdAt,
        },
      },
      { requestId, actor: actorId },
    );
    await processWebhookEnqueue(organizationId, evt);
    return structuredJson({
      key: {
        id: result.row.id,
        organizationId: result.row.organizationId,
        name: result.row.name,
        env: result.row.env,
        prefix: result.row.prefix,
        scopes: result.row.scopes,
        expiresAt: result.row.expiresAt,
        disabled: result.row.disabled,
        createdAt: result.row.createdAt,
      },
      secret: plaintextSecret,
      showOnceWarning: 'Write this down now. We never return the plaintext again.',
      audit: 'API_KEY_CREATED',
      requestId,
    }, 201);
  },
});

export const DELETE = v1Route({
  method: 'DELETE',
  scope: 'api_keys:write',
  requireOrg: true,
  bodySchema: RevokeSchema,
  async handle({ auth, body, requestId }) {
    const organizationId = auth.organizationId!;
    const { keyId } = body as z.infer<typeof RevokeSchema>;
    const revoked = await apiKeyService.revokeKey(organizationId, keyId);
    await logV1Event(auth, SystemEvent.API_KEY_REVOKED, {
      key: {
        id: revoked.id,
        name: revoked.name,
        env: revoked.env,
      },
    }, {
      requestId,
      resource: { type: 'apiKey', id: revoked.id },
      result: 'success',
    });
    const actorId = auth.method === 'api_key' ? auth.keyId : auth.method === 'firebase' ? auth.uid : auth.actorId;
    const evt = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'api_key.revoked',
      organizationId,
      {
        key: {
          id: revoked.id,
          name: revoked.name,
          env: revoked.env,
          revokedAt: revoked.revokedAt,
        },
      },
      { requestId, actor: actorId },
    );
    await processWebhookEnqueue(organizationId, evt);
    return structuredJson({
      revoked: true,
      revokedAt: revoked.revokedAt,
      keyId: revoked.id,
      key: {
        id: revoked.id,
        name: revoked.name,
        env: revoked.env,
        disabled: revoked.disabled,
        revokedAt: revoked.revokedAt,
      },
      audit: 'API_KEY_REVOKED',
      requestId,
    });
  },
});

export const PATCH = v1Route({
  method: 'PATCH',
  scope: 'api_keys:write',
  requireOrg: true,
  bodySchema: RotateSchema,
  async handle({ auth, body, requestId }) {
    const organizationId = auth.organizationId!;
    const { keyId } = body as z.infer<typeof RotateSchema>;
    let plaintextSecret = '';
    const rotated = await apiKeyService.rotateKey(organizationId, keyId);
    plaintextSecret = rotated.newKey.secret;
    await logV1Event(auth, SystemEvent.API_KEY_CREATED, {
      key: {
        id: rotated.newKey.row.id,
        name: rotated.newKey.row.name,
        env: rotated.newKey.row.env,
        scopes: rotated.newKey.row.scopes,
        prefix: rotated.newKey.row.prefix,
        rotatedFrom: keyId,
      },
    }, {
      requestId,
      resource: { type: 'apiKey', id: rotated.newKey.row.id },
      result: 'success',
    });
    await logV1Event(auth, SystemEvent.API_KEY_REVOKED, {
      key: {
        id: rotated.previousRevoked.id,
        name: rotated.previousRevoked.name,
        env: rotated.previousRevoked.env,
        reason: 'rotated',
        replacedBy: rotated.newKey.row.id,
      },
    }, {
      requestId,
      resource: { type: 'apiKey', id: rotated.previousRevoked.id },
      result: 'success',
    });
    const actorId = auth.method === 'api_key' ? auth.keyId : auth.method === 'firebase' ? auth.uid : auth.actorId;
    const evtCreated = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'api_key.created',
      organizationId,
      {
        key: {
          id: rotated.newKey.row.id,
          name: rotated.newKey.row.name,
          env: rotated.newKey.row.env,
          prefix: rotated.newKey.row.prefix,
          scopes: rotated.newKey.row.scopes,
          expiresAt: rotated.newKey.row.expiresAt,
          createdAt: rotated.newKey.row.createdAt,
          rotatedFrom: keyId,
        },
      },
      { requestId, actor: actorId },
    );
    await processWebhookEnqueue(organizationId, evtCreated);
    const evtRevoked = makeWebhookDeliveryEvent(
      `evt_${genId('').slice(0, 16)}`,
      'api_key.revoked',
      organizationId,
      {
        key: {
          id: rotated.previousRevoked.id,
          name: rotated.previousRevoked.name,
          env: rotated.previousRevoked.env,
          revokedAt: rotated.previousRevoked.revokedAt,
          reason: 'rotated',
          replacedBy: rotated.newKey.row.id,
        },
      },
      { requestId, actor: actorId },
    );
    await processWebhookEnqueue(organizationId, evtRevoked);
    return structuredJson({
      key: {
        id: rotated.newKey.row.id,
        organizationId: rotated.newKey.row.organizationId,
        name: rotated.newKey.row.name,
        env: rotated.newKey.row.env,
        prefix: rotated.newKey.row.prefix,
        scopes: rotated.newKey.row.scopes,
        expiresAt: rotated.newKey.row.expiresAt,
        disabled: rotated.newKey.row.disabled,
        createdAt: rotated.newKey.row.createdAt,
      },
      secret: plaintextSecret,
      showOnceWarning: 'Write this down now. We never return the plaintext again.',
      previousRevoked: {
        id: rotated.previousRevoked.id,
        name: rotated.previousRevoked.name,
        env: rotated.previousRevoked.env,
        revokedAt: rotated.previousRevoked.revokedAt,
        disabled: rotated.previousRevoked.disabled,
      },
      audit: 'API_KEY_ROTATED',
      requestId,
    }, 200);
  },
});
