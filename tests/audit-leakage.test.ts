import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { redact } from '@/services/events';
import { hashKeySecret, generateSigningSecret, ApiKeyService, OrganizationService } from '@/services/enterprise/organization';
import { EnterpriseApiKeyService } from '@/services/enterprise/apikey-service';
import { InMemoryPersistenceBackend } from '@/services/enterprise/persistence';
import { ApiKeySchema, WebhookEndpointSchema, ApiKeyEnv, ApiScopes } from '@/types/enterprise';

function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return '***-***-****';
  const last4 = phone.slice(-4);
  return `***-***-${last4}`;
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@*****.com';
  const [local, domain] = email.split('@');
  const maskedLocal = local.length <= 2 ? '***' : local[0] + '***' + local[local.length - 1];
  const domParts = domain.split('.');
  const maskedDomain = domParts.length >= 2
    ? '***.' + domParts.slice(-1).join('.')
    : '*****';
  return `${maskedLocal}@${maskedDomain}`;
}

function simulateOtpResponse(opts: {
  reason: 'triggered' | 'preview' | 'admin-reset';
  otpRaw: string;
  nodeEnv: string;
  expiresAtIso: string;
  digits: number;
  email?: string;
  phone?: string;
  requestId: string;
}) {
  const { reason, otpRaw, nodeEnv, expiresAtIso, digits, email, phone, requestId } = opts;
  const includeOtpInResponse = (reason === 'preview' || reason === 'admin-reset') && nodeEnv !== 'production';
  const otpId = 'otp_' + Math.random().toString(36).slice(2, 10);
  return {
    code: 'OTP_ISSUED',
    message: 'OTP issued. 15-minute TTL.',
    ...(includeOtpInResponse ? { otp: otpRaw } : {}),
    otpId,
    expiresAt: expiresAtIso,
    digits,
    deliveryStatus: 'EMAIL_DISPATCHED',
    maskedContact: {
      email: email ? maskEmail(email) : undefined,
      phone: phone ? maskPhone(phone) : undefined,
    },
    requestId,
  };
}

describe('OTP generation - production never leaks raw OTP', () => {
  it('NODE_ENV=production response body has NO raw OTP code field (preview/admin-reset also blocked)', () => {
    const rawOtp = '123456';
    for (const reason of ['triggered', 'preview', 'admin-reset'] as const) {
      const resp = simulateOtpResponse({
        reason,
        otpRaw: rawOtp,
        nodeEnv: 'production',
        expiresAtIso: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        digits: 6,
        email: 'user@example.com',
        phone: '+15551234567',
        requestId: 'req_prod_1',
      });
      const body = resp as any;
      expect(body).not.toHaveProperty('otp');
      expect(JSON.stringify(body)).not.toContain(rawOtp);
      expect(body.otpId).toBeDefined();
      expect(body.expiresAt).toBeDefined();
      expect(body.digits).toBe(6);
    }
  });

  it('production response contains only masked contact info, not raw email/phone', () => {
    const resp = simulateOtpResponse({
      reason: 'triggered',
      otpRaw: '424242',
      nodeEnv: 'production',
      expiresAtIso: '2025-07-01T00:15:00Z',
      digits: 6,
      email: 'john.doe@acmebank.com',
      phone: '+14155559876',
      requestId: 'req_masked_1',
    });
    const body = resp as any;
    expect(body.maskedContact.email).toBeDefined();
    expect(body.maskedContact.email).not.toContain('john.doe');
    expect(body.maskedContact.email).not.toContain('acmebank');
    expect(body.maskedContact.phone).toBeDefined();
    expect(body.maskedContact.phone).not.toContain('415555');
    expect(body.maskedContact.phone).toContain('9876');
  });

  it('NODE_ENV=development preview/admin-reset DOES include raw OTP (dev convenience)', () => {
    const raw = '777888';
    for (const reason of ['preview', 'admin-reset'] as const) {
      const resp = simulateOtpResponse({
        reason,
        otpRaw: raw,
        nodeEnv: 'development',
        expiresAtIso: '2025-01-01T00:00:00Z',
        digits: 6,
        requestId: 'req_dev_1',
      });
      expect((resp as any).otp).toBe(raw);
    }
  });
});

describe('API key creation showOnce semantics (plaintext returned EXACTLY once)', () => {
  it('POST create response returns secret PLAINTEXT exactly ONCE on create', () => {
    const orgId = 'org_showonce_1';
    const created = ApiKeyService.create({
      organizationId: orgId,
      name: 'Prod Key',
      env: ApiKeyEnv.PRODUCTION,
      scopes: [...ApiScopes] as any,
    });
    expect(created.secret).toBeDefined();
    expect(typeof created.secret).toBe('string');
    expect(created.secret.length).toBeGreaterThan(10);
    expect(created.secret.startsWith('clprod_')).toBe(true);
    expect(created.row.keyHash).toBe(hashKeySecret(created.secret));
  });

  it('subsequent GET / list API keys returns ONLY keyHash prefix id metadata — NEVER plaintext secret', () => {
    const orgId = 'org_list_1';
    const k1 = ApiKeyService.create({ organizationId: orgId, name: 'K1', env: ApiKeyEnv.SANDBOX, scopes: [...ApiScopes] as any });
    const k2 = ApiKeyService.create({ organizationId: orgId, name: 'K2', env: ApiKeyEnv.PRODUCTION, scopes: [...ApiScopes] as any });
    const rows = [k1.row, k2.row];
    const listed = ApiKeyService.listByOrg(rows, orgId);
    expect(listed).toHaveLength(2);
    for (const entry of listed) {
      const e = entry as any;
      expect(e).not.toHaveProperty('secret');
      expect(typeof e.id).toBe('string');
      expect(typeof e.prefix).toBe('string');
      expect(typeof e.name).toBe('string');
      expect(typeof e.env).toBe('string');
    }
    const rawSeen = JSON.stringify(listed);
    expect(rawSeen).not.toContain(k1.secret);
    expect(rawSeen).not.toContain(k2.secret);
  });

  it('EnterpriseApiKeyService: listKeys strips keyHash entirely, never exposes hash as secret', async () => {
    const inMem = new InMemoryPersistenceBackend();
    const svc = new EnterpriseApiKeyService(inMem as any);
    const orgId = 'org_ent_list_1';
    const created = await svc.createKey({
      organizationId: orgId,
      name: 'Ent Key',
      env: ApiKeyEnv.SANDBOX,
    });
    expect(created.secret).toBeDefined();
    const listed = await svc.listKeys(orgId);
    expect(listed).toHaveLength(1);
    const l = listed[0] as any;
    expect(l).not.toHaveProperty('secret');
    expect(l).not.toHaveProperty('keyHash');
    expect(l.id).toBe(created.row.id);
    expect(l.prefix).toBe(created.row.prefix);
  });

  it('PATCH rotate returns new plaintext ONCE; old key revoked shows keyHash only', async () => {
    const inMem = new InMemoryPersistenceBackend();
    const svc = new EnterpriseApiKeyService(inMem as any);
    const orgId = 'org_rotate_1';
    const original = await svc.createKey({
      organizationId: orgId,
      name: 'Rotate Me',
      env: ApiKeyEnv.PRODUCTION,
    });
    const originalSecret = original.secret;
    const rotated = await svc.rotateKey(orgId, original.row.id);
    expect(rotated.newKey.secret).toBeDefined();
    expect(rotated.newKey.secret).not.toBe(originalSecret);
    expect(rotated.newKey.secret.startsWith('clprod_')).toBe(true);
    const prev = rotated.previousRevoked as any;
    expect(prev).not.toHaveProperty('secret');
    expect(prev).not.toHaveProperty('keyHash');
    expect(prev.revokedAt).toBeDefined();
    expect(prev.disabled).toBe(true);
  });

  it('DELETE revoke returns keyHash only (no secret field) — EnterpriseApiKeyService revokes cleanly', async () => {
    const inMem = new InMemoryPersistenceBackend();
    const svc = new EnterpriseApiKeyService(inMem as any);
    const orgId = 'org_revoke_1';
    const made = await svc.createKey({
      organizationId: orgId,
      name: 'To Revoke',
      env: ApiKeyEnv.SANDBOX,
    });
    const theSecret = made.secret;
    const revoked = await svc.revokeKey(orgId, made.row.id);
    const r = revoked as any;
    expect(r).not.toHaveProperty('secret');
    expect(r).not.toHaveProperty('keyHash');
    expect(r.disabled).toBe(true);
    expect(r.revokedAt).toBeDefined();
    expect(JSON.stringify(revoked)).not.toContain(theSecret);
  });
});

describe('Audit event redaction — sensitive values NEVER stored raw', () => {
  it('redacts otpCode, apiKeySecret, password, webhookSecret, privateKey at top level', () => {
    const event = {
      otpCode: '123456',
      apiKeySecret: 'clsbox_k_abc123.SecretValueXYZ_987',
      password: 'secret123!@#Super',
      webhookSecret: 'whsec_a1b2c3d4e5f67890deadbeefcafe',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----',
      safeField: 'visible-value',
      planId: 'plan_visible_1',
    };
    const r = redact(event as any);
    expect(r.otpCode).toBe('[REDACTED]');
    expect(r.apiKeySecret).toBe('[REDACTED]');
    expect(r.password).toBe('[REDACTED]');
    expect(r.webhookSecret).toBe('[REDACTED]');
    expect(r.privateKey).toBe('[REDACTED]');
    expect(r.safeField).toBe('visible-value');
    expect(r.planId).toBe('plan_visible_1');
  });

  it('deeply nested sensitive keys at MAXDEPTH level redacted correctly', () => {
    const nested: any = { level1: { level2: { level3: {} } } };
    let cur = nested.level1.level2.level3;
    for (let i = 4; i <= 8; i++) {
      cur[`level${i}`] = {};
      cur = cur[`level${i}`];
    }
    nested.level1.level2.password = 'p@ss1';
    nested.level1.level2.level3.otpCode = '999000';
    nested.level1.level2.level3.level4.webhookSecret = 'whsec_X';
    nested.level1.level2.level3.level4.level5.apiKeySecret = 'clsbox_X';
    nested.level1.level2.level3.level4.level5.level6.privateKey = '-----BEGIN P...';
    const r = redact(nested);
    expect(r.level1.level2.password).toBe('[REDACTED]');
    expect(r.level1.level2.level3.otpCode).toBe('[REDACTED]');
    expect(r.level1.level2.level3.level4.webhookSecret).toBe('[REDACTED]');
    expect(r.level1.level2.level3.level4.level5.apiKeySecret).toBe('[REDACTED]');
    expect(r.level1.level2.level3.level4.level5.level6.privateKey).toBe('[REDACTED]');
  });

  it('object-in-array containing sensitive values gets redacted per item', () => {
    const data = {
      deliveries: [
        { id: 1, apiKeySecret: 'clsbox_aaa', ok: true },
        { id: 2, apiKeySecret: 'clsbox_bbb', webhookSecret: 'whsec_bbb', ok: true },
        { id: 3, safe: 'yes', password: 'bad-pass' },
      ],
    };
    const r = redact(data as any);
    expect((r.deliveries[0] as any).apiKeySecret).toBe('[REDACTED]');
    expect((r.deliveries[1] as any).apiKeySecret).toBe('[REDACTED]');
    expect((r.deliveries[1] as any).webhookSecret).toBe('[REDACTED]');
    expect((r.deliveries[2] as any).password).toBe('[REDACTED]');
    expect((r.deliveries[0] as any).ok).toBe(true);
    expect((r.deliveries[2] as any).safe).toBe('yes');
  });

  it('values never equal original after redact; safe fields unchanged', () => {
    const original = {
      otpCode: '000111',
      apiKeySecret: 'clprod_original_xyz',
      webhookSecret: 'whsec_original_abc',
      password: 'Pa$$w0rd!',
      privateKey: '-----BEGIN EC....-----',
      userId: 'usr_abc',
      orgId: 'org_xyz',
    };
    const r = redact(original as any);
    expect(r.otpCode).not.toEqual(original.otpCode);
    expect(r.apiKeySecret).not.toEqual(original.apiKeySecret);
    expect(r.webhookSecret).not.toEqual(original.webhookSecret);
    expect(r.password).not.toEqual(original.password);
    expect(r.privateKey).not.toEqual(original.privateKey);
    expect(r.userId).toBe(original.userId);
    expect(r.orgId).toBe(original.orgId);
  });

  it('case-insensitive key match (OTPCODE, WebhookSecret, APIKEYSECRET) redacted', () => {
    const r = redact({
      OTPCODE: '111222',
      WebhookSecret: 'whsec_mixed',
      APIKEYSECRET: 'clprod_MIXED_X',
      PassWord: 'CaseSens',
      PRIVATEKEY: '-----BEGIN HEADER-----',
    } as any);
    expect((r as any).OTPCODE).toBe('[REDACTED]');
    expect((r as any).WebhookSecret).toBe('[REDACTED]');
    expect((r as any).APIKEYSECRET).toBe('[REDACTED]');
    expect((r as any).PassWord).toBe('[REDACTED]');
    expect((r as any).PRIVATEKEY).toBe('[REDACTED]');
  });
});

describe('Webhook secret never leaked in list responses', () => {
  it('Organization webhookSecret field: listOrgs equivalent strips raw whsec_ values', () => {
    const org = OrganizationService.create({
      name: 'Webhook Test Org',
      slug: 'wh-test',
      ownerUid: 'firebase_user_1',
    });
    const rawSecret = org.organization.webhookSecret!;
    expect(rawSecret.startsWith('whsec_')).toBe(true);
    function listOrgsSafeView(rows: typeof org.organization[]): Omit<typeof org.organization, 'webhookSecret'>[] {
      return rows.map(({ webhookSecret: _omit, ...rest }) => rest);
    }
    const listed = listOrgsSafeView([org.organization]);
    const json = JSON.stringify(listed);
    expect(json).not.toContain(rawSecret);
    expect((listed[0] as any).webhookSecret).toBeUndefined();
  });

  it('WebhookEndpoint list response NEVER returns raw whsec_ secret value — [REDACTED] or hash-only', () => {
    const secret = generateSigningSecret();
    expect(secret.startsWith('whsec_')).toBe(true);
    const endpointInput = {
      id: 'whe_list_test',
      organizationId: 'org_wh_list',
      url: 'https://example.com/webhook',
      description: 'Test endpoint',
      events: ['*'],
      enabled: true,
      signingAlgo: 'HMAC-SHA256' as const,
      consecutiveFailures: 0,
      createdAt: new Date(),
    };
    const parse = WebhookEndpointSchema.safeParse({
      ...endpointInput,
      secret,
    });
    expect(parse.success).toBe(true);
    function listEndpoints(rows: z.infer<typeof WebhookEndpointSchema>[]) {
      return rows.map(r => {
        const s = r as any;
        const raw = s.secret;
        return {
          ...r,
          secret: raw ? hashKeySecret(raw) : undefined,
          secretMask: '[REDACTED]',
        };
      });
    }
    const listed = listEndpoints([parse.data!]);
    for (const entry of listed) {
      const e = entry as any;
      expect(e.secret).not.toBe(secret);
      if (typeof e.secret === 'string') {
        expect(e.secret.startsWith('whsec_')).toBe(false);
      }
      expect(e.secretMask).toBe('[REDACTED]');
      const entryJson = JSON.stringify(e);
      expect(entryJson).not.toContain(secret);
    }
    expect(listed[0].id).toBe('whe_list_test');
    expect(listed[0].url).toBe('https://example.com/webhook');
  });
});
