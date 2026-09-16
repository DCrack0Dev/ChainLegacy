import { describe, it, expect, vi } from 'vitest';
import {
  EnterpriseApiKeyService,
  generateApiKeySalt,
  hashSecretWithHmac,
  verifySecretAgainstHash,
} from '@/services/enterprise/apikey-service';
import {
  InMemoryPersistenceBackend,
  createId,
  createApiKeyPrefix,
} from '@/services/enterprise/persistence';
import {
  ApiKeyEnv,
  ApiScopes,
  type LegacyPlan,
  type Claim,
} from '@/types/enterprise';
import {
  registerGuardianApproval,
  ClaimEngine,
  ClaimStatus,
} from '@/services/enterprise/claim-engine';
import {
  retryDelayMs,
  MAX_ATTEMPTS,
  CONSECUTIVE_FAILURE_DISABLE_THRESHOLD,
  processDeliveryBatch,
  enqueueForOrg,
  generateSigningSecret,
  signSignature,
  verifySignature,
  type EndpointLike,
  type DeliveryRow,
} from '@/services/enterprise/webhook';

describe('API Key Service — create / hash / revoke / rotate / auth', () => {
  function makeService() {
    return new EnterpriseApiKeyService(new InMemoryPersistenceBackend() as any);
  }

  it('createKey returns correct prefix format and stores only keyHash (never plaintext)', async () => {
    const svc = makeService();
    const orgId = createId('org');
    const result = await svc.createKey({
      organizationId: orgId,
      name: 'Sandbox Full',
      env: ApiKeyEnv.SANDBOX,
      scopes: [...ApiScopes],
    });

    const prefix = createApiKeyPrefix(ApiKeyEnv.SANDBOX);
    expect(result.secret.startsWith(prefix)).toBe(true);
    expect(result.secret.includes('.')).toBe(true);
    const keyPart = result.secret.split('.')[0];
    expect(keyPart.startsWith(prefix)).toBe(true);
    expect(keyPart.length).toBeGreaterThan(prefix.length);

    expect(result.row.keyHash).not.toBe(result.secret);
    expect(result.row.keyHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(verifySecretAgainstHash(result.secret, result.row.keyHash)).toBe(true);
  });

  it('verifySecretAgainstHash: timingSafeEqual true for correct, false for tampered', () => {
    const secret = 'clsbox_k_test.testsecret123';
    const salt = generateApiKeySalt();
    const hash = hashSecretWithHmac(secret, salt);
    const stored = `${salt}:${hash}`;
    expect(verifySecretAgainstHash(secret, stored)).toBe(true);
    const tampered = secret.slice(0, -1) + 'X';
    expect(verifySecretAgainstHash(tampered, stored)).toBe(false);
    expect(verifySecretAgainstHash('', stored)).toBe(false);
    expect(verifySecretAgainstHash(secret, 'badformat')).toBe(false);
  });

  it('revokeKey sets revokedAt + disabled=true; KEY_ALREADY_REVOKED on second call', async () => {
    const svc = makeService();
    const orgId = createId('org');
    const created = await svc.createKey({
      organizationId: orgId,
      name: 'K1',
      env: ApiKeyEnv.SANDBOX,
    });
    const revoked = await svc.revokeKey(orgId, created.row.id);
    expect(revoked.revokedAt).toBeDefined();
    expect(revoked.disabled).toBe(true);
    await expect(svc.revokeKey(orgId, created.row.id)).rejects.toThrow(/already revoked/);
  });

  it('rotateKey revokes previous; returns new key+secret; cannot rotate revoked', async () => {
    const svc = makeService();
    const orgId = createId('org');
    const created = await svc.createKey({
      organizationId: orgId,
      name: 'Rotatable',
      env: ApiKeyEnv.PRODUCTION,
      scopes: ['customers:read'],
    });
    const oldSecret = created.secret;
    const rotated = await svc.rotateKey(orgId, created.row.id);
    expect(rotated.previousRevoked.id).toBe(created.row.id);
    expect(rotated.previousRevoked.disabled).toBe(true);
    expect(rotated.previousRevoked.revokedAt).toBeDefined();
    expect(rotated.newKey.secret).not.toBe(oldSecret);
    expect(rotated.newKey.row.scopes).toEqual(['customers:read']);
    expect(rotated.newKey.secret.startsWith('clprod_')).toBe(true);

    await expect(svc.rotateKey(orgId, created.row.id)).rejects.toThrow(/rotate revoked|already revoked/);
  });

  it('verifySecret rejects revoked / bad prefix / expired keys', async () => {
    const svc = makeService();
    const orgId = createId('org');

    const valid = await svc.createKey({ organizationId: orgId, name: 'Valid', env: ApiKeyEnv.SANDBOX });
    const revoked = await svc.createKey({ organizationId: orgId, name: 'Rev', env: ApiKeyEnv.SANDBOX });
    await svc.revokeKey(orgId, revoked.row.id);
    const expired = await svc.createKey({
      organizationId: orgId, name: 'Exp', env: ApiKeyEnv.SANDBOX,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const p = (svc as any).persistence;
    const allRows = [
      (await p.get(orgId, 'apiKeys', valid.row.id)),
      (await p.get(orgId, 'apiKeys', revoked.row.id)),
      (await p.get(orgId, 'apiKeys', expired.row.id)),
    ];

    expect(await svc.verifySecret(valid.secret, allRows)).not.toBeNull();
    expect(await svc.verifySecret(revoked.secret, allRows)).toBeNull();
    expect(await svc.verifySecret(expired.secret, allRows)).toBeNull();
    expect(await svc.verifySecret('invalidprefix_secret123', allRows)).toBeNull();
    expect(await svc.verifySecret('clsbox_k_fake.notthere', allRows)).toBeNull();
  });
});

describe('Zero Quorum Regression — Math.max(1, threshold) cannot auto-approve', () => {
  function makeClaim(status: ClaimStatus): Claim {
    return {
      id: createId('claim'),
      organizationId: createId('org'),
      customerId: createId('customer'),
      legacyPlanId: createId('legacyPlan'),
      status,
      initiator: 'init',
      guardianApprovals: {},
      transitions: [{ from: '', to: status, at: new Date(), actor: 'seed' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('guardianQuorum=0 still requires 1 approval; 0/1 fails, 1/1 passes', () => {
    const plan: LegacyPlan = {
      id: createId('legacyPlan'),
      organizationId: createId('org'),
      customerId: createId('customer'),
      name: 'ZeroQuorum',
      intervalDays: 30,
      guardianQuorum: 0,
      encryptionConfig: { algorithm: 'AES-256-GCM', kdf: 'argon2id', shamirThreshold: 0, shamirShares: 0 },
      walletSignatureRequired: false,
      status: 'claim_in_progress',
      suspicionScore: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const claim = makeClaim(ClaimStatus.GUARDIAN_REVIEW);
    const r0 = registerGuardianApproval(claim, plan, 'g1', false, 'sys');
    expect(r0.quorumMet).toBe(false);

    const r1 = registerGuardianApproval(r0.claim, plan, 'g1', true, 'sys');
    expect(r1.quorumMet).toBe(true);
  });
});

describe('Cron Auth Production Gate — 401 without CRON_SECRET Bearer', () => {
  it('production env with no auth header returns 401 CRON_AUTH_REQUIRED', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalCronSecret = process.env.CRON_SECRET;
    (process.env as any).NODE_ENV = 'production';
    (process.env as any).CRON_SECRET = 'correct-secret-xyz';

    const { GET } = await import('@/app/api/cron/check-status/route');
    const req = new Request('http://localhost/api/cron/check-status', {
      headers: {},
    });
    const resp = await GET(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.code).toBe('CRON_AUTH_REQUIRED');

    const reqWrong = new Request('http://localhost/api/cron/check-status', {
      headers: { authorization: 'Bearer WRONG-SECRET' },
    });
    const respWrong = await GET(reqWrong);
    expect(respWrong.status).toBe(401);

    (process.env as any).NODE_ENV = originalNodeEnv;
    (process.env as any).CRON_SECRET = originalCronSecret;
  });
});

describe('Webhook Retry Backoff / Deadletter / Auto-Disable', () => {
  it('retryDelayMs is strictly increasing exponential up to 24h cap', () => {
    const delays = Array.from({ length: 10 }, (_, i) => retryDelayMs(i));
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
    expect(delays[0]).toBe(60_000);
    expect(delays[1]).toBe(120_000);
    expect(delays[2]).toBe(240_000);
    const oneDay = 24 * 3600 * 1000;
    expect(delays[delays.length - 1]).toBeLessThanOrEqual(oneDay);
  });

  function makeEndpoint(overrides: Partial<EndpointLike> = {}): EndpointLike {
    return {
      id: createId('webhookEndpoint'),
      organizationId: createId('org'),
      url: 'https://example.com/hook',
      enabled: true,
      events: ['*'],
      consecutiveFailures: 0,
      secret: generateSigningSecret(),
      ...overrides,
    };
  }

  async function simulateBatchFailures(
    endpoint: EndpointLike,
    failCount: number,
  ): Promise<{ endpointDisabled: boolean; movedToDeadLetter: number; failed: number; endpointUpdates: any[] }> {
    const deliveries: DeliveryRow[] = [];
    const evt = { id: 'evt_1', type: 'claim.created', createdAt: new Date().toISOString(), organizationId: endpoint.organizationId, data: {} };
    for (let i = 0; i < failCount; i++) {
      const d = enqueueForOrg(endpoint, { ...evt, id: 'evt_' + i }, []);
      if (d) deliveries.push(d!);
    }
    const endpointUpdates: any[] = [];
    const deliveryUpdates: DeliveryRow[] = [];
    const deadletters: DeliveryRow[] = [];
    const result = await processDeliveryBatch(endpoint.organizationId, endpoint.id, {
      loadEndpoint: async () => endpoint,
      loadScheduledEvents: async () => deliveries,
      persistDeliveryUpdate: async (r) => { deliveryUpdates.push(r); },
      moveToDeadLetter: async (r) => { deadletters.push(r); },
      persistEndpointUpdate: async (p) => { endpointUpdates.push(p); },
      fetcher: async () => ({ ok: false, status: 500, err: 'boom' }),
    }, failCount + 1);
    return { ...result, endpointUpdates };
  }

  it('5 consecutive failures auto-disables endpoint (threshold=' + CONSECUTIVE_FAILURE_DISABLE_THRESHOLD + ')', async () => {
    const ep = makeEndpoint({ consecutiveFailures: 0 });
    const result = await simulateBatchFailures(ep, 10);
    expect(result.endpointDisabled).toBe(true);
    const disablePatch = result.endpointUpdates.find(p => p.enabled === false);
    expect(disablePatch).toBeDefined();
    expect(disablePatch.consecutiveFailures).toBeGreaterThanOrEqual(CONSECUTIVE_FAILURE_DISABLE_THRESHOLD);
    expect(disablePatch.disabledAt).toBeDefined();
  });

  it('MAX_ATTEMPTS=' + MAX_ATTEMPTS + ' deliveries sets deadLetterAt + moves to deadletter', async () => {
    const ep = makeEndpoint({ consecutiveFailures: 0 });
    const orgId = ep.organizationId;
    const endpointId = ep.id;
    const preFailedRow: DeliveryRow = {
      id: createId('webhookEvent'),
      dedupeKey: 'end1:evtX:abcd',
      attempt: MAX_ATTEMPTS - 1,
      deliverAfter: 0,
      endpointId,
      organizationId: orgId,
      eventId: 'evtX',
      eventType: 'claim.created',
      scheduledAt: Date.now() - 1_000_000,
      payload: JSON.stringify({ hi: 1 }),
      signatureHeader: 't=0,v1=abc',
    };
    const dls: DeliveryRow[] = [];
    const deliveries: DeliveryRow[] = [];
    const result = await processDeliveryBatch(orgId, endpointId, {
      loadEndpoint: async () => ep,
      loadScheduledEvents: async () => [preFailedRow],
      persistDeliveryUpdate: async (r) => { deliveries.push(r); },
      moveToDeadLetter: async (r) => { dls.push(r); },
      persistEndpointUpdate: async () => {},
      fetcher: async () => ({ ok: false, status: 500 }),
    });
    const updatedRow = deliveries.find(r => r.id === preFailedRow.id);
    expect(result.movedToDeadLetter).toBeGreaterThanOrEqual(1);
    expect(updatedRow?.deadLetterAt).toBeDefined();
    expect(dls.length).toBeGreaterThanOrEqual(1);
  });

  it('replayed webhook dedupeKey: enqueueForOrg returns null for duplicate', () => {
    const ep = makeEndpoint();
    const evt = { id: 'evt_replay', type: 'claim.created', createdAt: new Date().toISOString(), organizationId: ep.organizationId, data: { a: 1 } };
    const d1 = enqueueForOrg(ep, evt, []);
    expect(d1).not.toBeNull();
    const d2 = enqueueForOrg(ep, evt, [{ dedupeKey: d1!.dedupeKey }]);
    expect(d2).toBeNull();
  });
});

describe('Webhook Signing: tamper + expiry independently verified', () => {
  it('bit flip in payload fails verify; 6-min-old timestamp fails (5-min tolerance)', () => {
    const secret = generateSigningSecret();
    const payload = JSON.stringify({ claimId: 'c_1', status: 'approved', amount: 100 });
    const nowT = Math.floor(Date.now() / 1000);
    const sig = signSignature(secret, payload, nowT);
    expect(verifySignature(secret, payload, sig)).toBe(true);

    const tampered = payload.replace('"approved"', '"rejected"');
    expect(verifySignature(secret, tampered, sig)).toBe(false);

    const oldT = nowT - 6 * 60;
    const oldSig = signSignature(secret, payload, oldT);
    expect(verifySignature(secret, payload, oldSig)).toBe(false);
  });
});
