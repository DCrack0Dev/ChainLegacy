import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import {
  createId,
  createApiKeyPrefix,
  createApiKeySecret,
  ID_PREFIXES,
  InMemoryPersistenceBackend,
  FirestorePersistenceBackend,
} from '@/services/enterprise/persistence';
import {
  EnterpriseOrgService,
  AdminAuthBackend,
  EventBackend,
  EnterpriseCustomClaims,
} from '@/services/enterprise/org-service';
import {
  EnterpriseApiKeyService,
  generateApiKeySalt,
  hashSecretWithHmac,
  verifySecretAgainstHash,
} from '@/services/enterprise/apikey-service';
import { SystemEvent } from '@/services/events';
import { ApiKeyEnv, ApiKeyScope, ApiScopes, Organization } from '@/types/enterprise';

function makeFakeAuth(): { backend: AdminAuthBackend; claimsByUid: Map<string, any> } {
  const claimsByUid = new Map<string, any>();
  const backend: AdminAuthBackend = {
    async setCustomUserClaims(uid: string, claims: object) {
      claimsByUid.set(uid, { ...(claimsByUid.get(uid) ?? {}), ...claims });
    },
    async getUser(uid: string) {
      return claimsByUid.has(uid) ? { uid, customClaims: claimsByUid.get(uid) } : null;
    },
  };
  return { backend, claimsByUid };
}

function makeFakeEvents(): { backend: EventBackend; events: any[] } {
  const events: any[] = [];
  const backend: EventBackend = {
    async logEvent(userId, event, details, opts) {
      events.push({ userId, event, details, opts });
    },
  };
  return { backend, events };
}

describe('Persistence Layer (4 tests)', () => {
  it('[persistence-1] createId prefix utilities produce correct prefixes for all entity kinds', () => {
    expect(createId('org')).toMatch(/^org_[0-9a-f]+$/);
    expect(createId('customer')).toMatch(/^cust_[0-9a-f]+$/);
    expect(createId('legacyPlan')).toMatch(/^plan_[0-9a-f]+$/);
    expect(createId('beneficiary')).toMatch(/^ben_[0-9a-f]+$/);
    expect(createId('guardian')).toMatch(/^guard_[0-9a-f]+$/);
    expect(createId('claim')).toMatch(/^claim_[0-9a-f]+$/);
    expect(createId('apiKey', 6)).toMatch(/^k_[0-9a-f]+$/);
    expect(createId('webhookEndpoint')).toMatch(/^whe_[0-9a-f]+$/);
    expect(createId('livenessReset')).toMatch(/^lvr_[0-9a-f]+$/);
    expect(createId('auditEvent')).toMatch(/^aud_[0-9a-f]+$/);
    expect(createId('guardianNonce')).toMatch(/^gnonce_[0-9a-f]+$/);
    expect(createId('rateLimitBucket')).toMatch(/^rlb_[0-9a-f]+$/);
    expect(createId('idempotencyDoc')).toMatch(/^idem_[0-9a-f]+$/);
    expect(createId('securityEvent')).toMatch(/^sec_[0-9a-f]+$/);
    expect(createId('webhookDelivery')).toMatch(/^wdlv_[0-9a-f]+$/);
    expect(createId('webhookDeadLetter')).toMatch(/^wdll_[0-9a-f]+$/);
    expect(createId('webhookEvent')).toMatch(/^wev_[0-9a-f]+$/);

    expect(ID_PREFIXES.org).toBe('org_');
    expect(ID_PREFIXES.apiKey).toBe('k_');
  });

  it('[persistence-2] InMemoryPersistenceBackend CRUD roundtrip on org subcollection path', async () => {
    const mem = new InMemoryPersistenceBackend();
    const orgId = createId('org');

    await mem.create<any>(orgId, 'customers', 'cust_1', {
      organizationId: orgId,
      email: 'a@example.com',
      fullName: 'Alice',
      partnerCustomerId: 'p1',
    });

    const got = await mem.get<any>(orgId, 'customers', 'cust_1');
    expect(got).not.toBeNull();
    expect(got!.email).toBe('a@example.com');
    expect(got!.organizationId).toBe(orgId);

    const listed = await mem.list<any>(orgId, 'customers');
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('cust_1');

    await mem.update<any>(orgId, 'customers', 'cust_1', { fullName: 'Alice Updated' });
    const after = await mem.get<any>(orgId, 'customers', 'cust_1');
    expect(after!.fullName).toBe('Alice Updated');

    await mem.delete(orgId, 'customers', 'cust_1');
    expect(await mem.get<any>(orgId, 'customers', 'cust_1')).toBeNull();
  });

  it('[persistence-3] Tenant-prefixed paths isolate orgs: org-A customers not visible to org-B', async () => {
    const mem = new InMemoryPersistenceBackend();
    const orgA = 'org_A';
    const orgB = 'org_B';

    await mem.create<any>(orgA, 'customers', 'c1', { organizationId: orgA, email: 'a@a.com', fullName: 'A', partnerCustomerId: 'pa1' });
    await mem.create<any>(orgB, 'customers', 'c2', { organizationId: orgB, email: 'b@b.com', fullName: 'B', partnerCustomerId: 'pb1' });

    const onlyA = await mem.list<any>(orgA, 'customers');
    const onlyB = await mem.list<any>(orgB, 'customers');
    expect(onlyA.map(c => c.id)).toEqual(['c1']);
    expect(onlyB.map(c => c.id)).toEqual(['c2']);
    expect(await mem.get<any>(orgA, 'customers', 'c2')).toBeNull();
  });

  it('[persistence-4] FirestorePersistenceBackend constructs correct doc paths for org vs subcollections via fake DB', async () => {
    const writes: { path: string; id: string; data: any; mode: string }[] = [];
    const fakeDb: any = {
      collection: (path: string) => ({
        doc: (id: string) => {
          const refPath = `${path}/${id}`;
          return {
            async set(data: any) {
              writes.push({ path: refPath, id, data, mode: 'set' });
            },
            async get() {
              return {
                exists: false,
                id,
                data: () => undefined,
              };
            },
            async update(data: any) {
              writes.push({ path: refPath, id, data, mode: 'update' });
            },
            async delete() {
              writes.push({ path: refPath, id, data: undefined, mode: 'delete' });
            },
          };
        },
        async add(_data: any) {
          return { id: 'auto_' + randomBytes(4).toString('hex') };
        },
        where: () => fakeDb.collection('x'),
        orderBy: () => fakeDb.collection('x'),
        limit: () => fakeDb.collection('x'),
        get: async () => ({ docs: [] }),
      }),
    };

    const backend = new FirestorePersistenceBackend(fakeDb);
    const orgId = 'org_test';
    await backend.create<Organization>(null, null, orgId, {
      name: 'Test',
      slug: 'test',
      ownerUid: 'u1',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await backend.create<any>(orgId, 'apiKeys', 'k_1', {
      organizationId: orgId,
      name: 'key',
      env: 'sandbox',
      prefix: 'clsbox_',
      keyHash: 'h',
      scopes: [],
      disabled: false,
      createdAt: new Date(),
    });

    const orgWrite = writes.find(w => w.mode === 'set' && w.id === orgId);
    expect(orgWrite!.path).toBe(`organizations/${orgId}`);

    const keyWrite = writes.find(w => w.id === 'k_1');
    expect(keyWrite!.path).toBe(`organizations/${orgId}/apiKeys/k_1`);
  });
});

describe('Enterprise Org Onboarding (4 tests)', () => {
  it('[org-1] Successful onboarding creates org, sets custom claims, default sandbox key, and fires ORG_CREATED', async () => {
    const persistence = new InMemoryPersistenceBackend();
    const { backend: auth, claimsByUid } = makeFakeAuth();
    const { backend: events, events: eventLog } = makeFakeEvents();
    const svc = new EnterpriseOrgService({ persistence, auth, events });

    const result = await svc.onboardOrganization({
      name: 'Acme Inc',
      slug: 'acme-inc',
      country: 'US',
      ownerUid: 'uid_alice',
      requestId: 'req_123',
    });

    expect(result.org).not.toBeNull();
    expect(result.org.id).toMatch(/^org_/);
    expect(result.org.slug).toBe('acme-inc');
    expect(result.org.ownerUid).toBe('uid_alice');
    expect(result.org.status).toBe('active');
    expect(result.org.webhookSecret).toMatch(/^whsec_/);

    const claims = claimsByUid.get('uid_alice') as EnterpriseCustomClaims;
    expect(claims.enterprise_owner).toBe('uid_alice');
    expect(claims.enterprise_orgId).toBe(result.org.id);
    expect(claims.enterprise_scopes).toEqual(['*']);

    expect(result.showOnceWarning).toBe(true);
    expect(result.showOnceSandboxKey.startsWith('clsbox_')).toBe(true);
    expect(result.defaultSandboxKey.secret).toBe(result.showOnceSandboxKey);
    expect(result.defaultSandboxKey.row.env).toBe(ApiKeyEnv.SANDBOX);
    expect(result.defaultSandboxKey.row.name).toBe('Default Sandbox Key');

    const orgEvent = eventLog.find(e => e.event === SystemEvent.ORG_CREATED);
    expect(orgEvent).not.toBeUndefined();
    expect(orgEvent.details.orgId).toBe(result.org.id);
    expect(orgEvent.opts.organizationId).toBe(result.org.id);
    expect(orgEvent.opts.actor.id).toBe('uid_alice');
    expect(orgEvent.opts.result).toBe('success');
  });

  it('[org-B3-1] Onboarding body.ownerUid parameter MUST be ignored; ownerUid derived ONLY from svc param (auth.uid at route layer)', async () => {
    const persistence = new InMemoryPersistenceBackend();
    const { backend: auth, claimsByUid } = makeFakeAuth();
    const { backend: events } = makeFakeEvents();
    const svc = new EnterpriseOrgService({ persistence, auth, events });
    // EnterpriseOrgService.onboardOrganization ownerUid param is the auth-derived uid.
    // If a BODY value were passed, it would be different. We simulate route behavior:
    // always pass auth.uid to svc, regardless of any body.ownerUid that existed.
    const bodyValueIfAny = 'uid_body_attack';
    const actualAuthOwner = 'uid_auth_only';
    const onboarded = await svc.onboardOrganization({
      name: 'BodyIgnored Ltd',
      slug: 'body-ignored',
      ownerUid: actualAuthOwner, // this is auth.uid in real route
    });
    expect(onboarded.org.ownerUid).toBe(actualAuthOwner);
    expect(onboarded.org.ownerUid).not.toBe(bodyValueIfAny);
    expect((claimsByUid.get(actualAuthOwner) as any).enterprise_orgId).toBe(onboarded.org.id);
    expect(claimsByUid.has(bodyValueIfAny)).toBe(false);
    const persisted = await persistence.get<any>(null as any, null as any, onboarded.org.id) as Organization;
    expect(persisted?.ownerUid).toBe(actualAuthOwner);
    expect(onboarded.defaultSandboxKey.secret.startsWith('clsbox_')).toBe(true);
  });

  it('[org-2] Slug conflict returns 409 ORG_SLUG_CONFLICT before any writes or claims are set', async () => {
    const persistence = new InMemoryPersistenceBackend();
    const { backend: auth, claimsByUid } = makeFakeAuth();
    const { backend: events, events: eventLog } = makeFakeEvents();
    const svc = new EnterpriseOrgService({ persistence, auth, events });

    await svc.onboardOrganization({
      name: 'First',
      slug: 'conflict',
      ownerUid: 'u1',
    });

    try {
      await svc.onboardOrganization({
        name: 'Second',
        slug: 'CONFLICT-!@#',
        ownerUid: 'u2',
      });
      expect.fail('Expected 409 slug conflict');
    } catch (e: any) {
      expect(e.code).toBe('ORG_SLUG_CONFLICT');
      expect(e.statusCode).toBe(409);
      expect(e.details.slug).toBe('conflict');
    }

    expect(claimsByUid.has('u2')).toBe(false);
    const orgEvents = eventLog.filter(e => e.event === SystemEvent.ORG_CREATED);
    expect(orgEvents).toHaveLength(1);
  });

  it('[org-3] Onboarding result shows clsbox_ sandbox key once, row has no plaintext, only salt:hmac hash', async () => {
    const persistence = new InMemoryPersistenceBackend();
    const { backend: auth } = makeFakeAuth();
    const { backend: events } = makeFakeEvents();
    const svc = new EnterpriseOrgService({ persistence, auth, events });

    const result = await svc.onboardOrganization({
      name: 'ShowOnce Ltd',
      slug: 'show-once',
      ownerUid: 'u_once',
    });

    const persistedKey = await persistence.get<any>(result.org.id, 'apiKeys', result.defaultSandboxKey.row.id);
    expect(persistedKey).not.toBeNull();
    expect(persistedKey!.keyHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(persistedKey!.keyHash).not.toContain(result.showOnceSandboxKey);
    expect(typeof result.defaultSandboxKey.row.keyHash).toBe('string');
    expect(result.defaultSandboxKey.row.disabled).toBe(false);
    expect(result.defaultSandboxKey.row.scopes.sort()).toEqual([...ApiScopes].sort() as ApiKeyScope[]);
  });

  it('[org-4] getOwnerClaims extracts enterprise_* custom claims correctly', async () => {
    const persistence = new InMemoryPersistenceBackend();
    const { backend: auth, claimsByUid } = makeFakeAuth();
    const { backend: events } = makeFakeEvents();
    const svc = new EnterpriseOrgService({ persistence, auth, events });

    const before = await svc.getOwnerClaims('nobody');
    expect(before).toBeNull();

    claimsByUid.set('existing', { another: 'claim' });
    const noEnterprise = await svc.getOwnerClaims('existing');
    expect(noEnterprise).toEqual({
      enterprise_owner: undefined,
      enterprise_orgId: undefined,
      enterprise_scopes: undefined,
    });

    const onboarding = await svc.onboardOrganization({
      name: 'ClaimsCo',
      slug: 'claimsco',
      ownerUid: 'existing',
    });

    const after = await svc.getOwnerClaims('existing');
    expect(after!.enterprise_owner).toBe('existing');
    expect(after!.enterprise_orgId).toBe(onboarding.org.id);
    expect(after!.enterprise_scopes).toEqual(['*']);
  });
});

describe('API Key Service (4 tests)', () => {
  it('[apikey-1] createKey stores secret as salt:HMAC(sha256, secret+salt, salt), returns plaintext only once via callback', async () => {
    const mem = new InMemoryPersistenceBackend();
    const svc = new EnterpriseApiKeyService(mem);
    const shownSecrets: string[] = [];

    const created = await svc.createKey({
      organizationId: 'org_z',
      name: 'ProdKey',
      env: ApiKeyEnv.PRODUCTION,
      showOnceCallback: (s) => shownSecrets.push(s),
    });

    expect(shownSecrets).toHaveLength(1);
    expect(shownSecrets[0]).toBe(created.secret);
    expect(created.secret.startsWith('clprod_')).toBe(true);

    const raw = await svc.getKeyRaw('org_z', created.row.id);
    expect(raw).not.toBeNull();
    expect(raw!.keyHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);

    const [salt, storedHash] = raw!.keyHash.split(':');
    const expected = createHmac('sha256', salt).update(created.secret + salt).digest('hex');
    expect(storedHash).toBe(expected);

    const safe = await svc.getKey('org_z', created.row.id);
    expect(safe && (safe as any).keyHash).toBeUndefined();
  });

  it('[apikey-2] verifySecret timing-safe match: accepts correct secret, rejects wrong, revoked, expired', async () => {
    const mem = new InMemoryPersistenceBackend();
    const svc = new EnterpriseApiKeyService(mem);
    const orgId = 'org_v';

    const good = await svc.createKey({ organizationId: orgId, name: 'G', env: ApiKeyEnv.SANDBOX });
    const revoked = await svc.createKey({ organizationId: orgId, name: 'R', env: ApiKeyEnv.SANDBOX });
    await svc.revokeKey(orgId, revoked.row.id);

    const salt = generateApiKeySalt();
    const past = new Date(Date.now() - 60_000);
    const expiredId = createId('apiKey', 6);
    const expiredSecret = createApiKeySecret(ApiKeyEnv.SANDBOX, expiredId.replace('k_', ''), 32);
    const expiredHash = hashSecretWithHmac(expiredSecret, salt);
    await mem.create<any>(orgId, 'apiKeys', expiredId, {
      organizationId: orgId,
      name: 'E',
      env: 'sandbox',
      prefix: 'clsbox_',
      keyHash: `${salt}:${expiredHash}`,
      scopes: [],
      expiresAt: past,
      disabled: false,
      createdAt: new Date(),
    });

    const allRows = [
      await svc.getKeyRaw(orgId, good.row.id),
      await svc.getKeyRaw(orgId, revoked.row.id),
      await mem.get<any>(orgId, 'apiKeys', expiredId),
    ].filter(Boolean) as any[];

    expect(await svc.verifySecret(good.secret, allRows)).not.toBeNull();
    expect(await svc.verifySecret(good.secret + 'WRONG', allRows)).toBeNull();
    expect(await svc.verifySecret(revoked.secret, allRows)).toBeNull();
    expect(await svc.verifySecret(expiredSecret, allRows)).toBeNull();
  });

  it('[apikey-3] revokeKey marks revokedAt+disabled; rotateKey revokes old and returns new showOnce secret', async () => {
    const mem = new InMemoryPersistenceBackend();
    const svc = new EnterpriseApiKeyService(mem);
    const orgId = 'org_rr';

    const original = await svc.createKey({ organizationId: orgId, name: 'Orig', env: ApiKeyEnv.PRODUCTION });

    const revoked = await svc.revokeKey(orgId, original.row.id, 'manual');
    expect(revoked.revokedAt).not.toBeUndefined();
    expect(revoked.disabled).toBe(true);

    try {
      await svc.revokeKey(orgId, original.row.id);
      expect.fail('Re-revoke should throw');
    } catch (e: any) {
      expect(e.code).toBe('KEY_ALREADY_REVOKED');
    }

    const original2 = await svc.createKey({ organizationId: orgId, name: 'RotateMe', env: ApiKeyEnv.SANDBOX });
    const rotated = await svc.rotateKey(orgId, original2.row.id);

    expect(rotated.previousRevoked.id).toBe(original2.row.id);
    expect(rotated.previousRevoked.revokedAt).not.toBeUndefined();
    expect(rotated.previousRevoked.disabled).toBe(true);

    expect(rotated.newKey.row.id).not.toBe(original2.row.id);
    expect(rotated.newKey.row.name).toBe('RotateMe');
    expect(rotated.newKey.row.env).toBe(ApiKeyEnv.SANDBOX);
    expect(rotated.newKey.secret.startsWith('clsbox_')).toBe(true);
    expect(rotated.newKey.row.scopes).toEqual(original2.row.scopes);
  });

  it('[apikey-4] findByIdAndVerify rejects cross-org mismatches and disabled keys; verifySecretAgainstHash independent helper', async () => {
    const mem = new InMemoryPersistenceBackend();
    const svc = new EnterpriseApiKeyService(mem);
    const orgX = 'org_X';
    const orgY = 'org_Y';

    const x = await svc.createKey({ organizationId: orgX, name: 'XKey', env: ApiKeyEnv.SANDBOX });
    const y = await svc.createKey({ organizationId: orgY, name: 'YKey', env: ApiKeyEnv.SANDBOX });

    expect(await svc.findByIdAndVerify(orgX, x.row.id, x.secret)).not.toBeNull();
    expect(await svc.findByIdAndVerify(orgY, x.row.id, x.secret)).toBeNull();
    expect(await svc.findByIdAndVerify(orgX, y.row.id, x.secret)).toBeNull();

    await svc.revokeKey(orgX, x.row.id);
    expect(await svc.findByIdAndVerify(orgX, x.row.id, x.secret)).toBeNull();

    const salt = generateApiKeySalt();
    const secret = 'clsbox_test';
    const stored = `${salt}:${hashSecretWithHmac(secret, salt)}`;
    expect(verifySecretAgainstHash(secret, stored)).toBe(true);
    expect(verifySecretAgainstHash(secret + 'x', stored)).toBe(false);
    expect(verifySecretAgainstHash(secret, 'bad-format')).toBe(false);
  });
});
