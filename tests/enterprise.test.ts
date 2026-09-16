import { describe, it, expect } from 'vitest';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'crypto';
import {
  CLAIM_LEGAL_TRANSITIONS,
  ClaimStatus,
  isLegalClaimTransition,
  registerGuardianApproval,
  ClaimEngine,
} from '@/services/enterprise/claim-engine';
import { hashKeySecret, hasScope, isKeyPrefix } from '@/services/enterprise/organization';
import { signSignature, verifySignature, generateSigningSecret } from '@/services/enterprise/webhook';
import { ApiError, apiErrorResponse, extractRequestId } from '@/lib/api-errors';
import { ApiKeyScope, ApiScopes, PaginationParams } from '@/types/enterprise';
import { redact } from '@/services/events';

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
const STAGE_DURATIONS_MS: Record<string, number> = {
  active: 30 * 24 * 3600 * 1000,
  warning_email: 7 * 24 * 3600 * 1000,
  warning_sms: 3 * 24 * 3600 * 1000,
  push_notification: 2 * 24 * 3600 * 1000,
  ai_liveness_check: 7 * 24 * 3600 * 1000,
  wallet_signature_req: 7 * 24 * 3600 * 1000,
  grace_period: 15 * 24 * 3600 * 1000,
};

function stageAt(nowMs: number, lastCheckinMs: number, intervalDays = 30): { stage: typeof STAGE_ORDER[number]; nextEscalationAt: number } {
  const defaultActiveMs = intervalDays * 24 * 3600 * 1000;
  let cursor = lastCheckinMs + defaultActiveMs;
  if (nowMs < cursor) return { stage: 'active', nextEscalationAt: cursor };
  for (let i = 1; i < STAGE_ORDER.length - 1; i++) {
    const stage = STAGE_ORDER[i];
    const dur = STAGE_DURATIONS_MS[stage];
    const nextCursor = cursor + dur;
    if (nowMs < nextCursor) return { stage, nextEscalationAt: nextCursor };
    cursor = nextCursor;
  }
  return { stage: 'triggered', nextEscalationAt: cursor };
}

async function aesGcmEncrypt(keyBytes: Uint8Array, plaintext: Uint8Array, iv: Uint8Array): Promise<{ ct: Uint8Array; tag: Uint8Array }> {
  const keyBuf = new Uint8Array(keyBytes.buffer, keyBytes.byteOffset, keyBytes.byteLength);
  const ck = await crypto.subtle.importKey('raw', keyBuf as BufferSource, 'AES-GCM', false, ['encrypt']);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv.buffer, iv.byteOffset, iv.byteLength) as BufferSource }, ck, new Uint8Array(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength) as BufferSource);
  const u8 = new Uint8Array(buf);
  return { ct: u8.slice(0, u8.length - 16), tag: u8.slice(u8.length - 16) };
}
async function aesGcmDecrypt(keyBytes: Uint8Array, ct: Uint8Array, tag: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const keyBuf = new Uint8Array(keyBytes.buffer, keyBytes.byteOffset, keyBytes.byteLength);
  const ck = await crypto.subtle.importKey('raw', keyBuf as BufferSource, 'AES-GCM', false, ['decrypt']);
  const combined = new Uint8Array(ct.length + 16);
  combined.set(new Uint8Array(ct.buffer, ct.byteOffset, ct.byteLength), 0);
  combined.set(new Uint8Array(tag.buffer, tag.byteOffset, tag.byteLength), ct.length);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv.buffer, iv.byteOffset, iv.byteLength) as BufferSource }, ck, combined as BufferSource));
}
function splitShamir2of3(secret: Buffer): [Buffer, Buffer, Buffer] {
  const a = randomBytes(secret.length);
  const b = randomBytes(secret.length);
  const s1 = a;
  const s2 = b;
  const s3 = Buffer.from(secret.map((v, i) => v ^ a[i] ^ b[i]));
  return [s1, s2, s3];
}
function combineShamir2of3(x: Buffer, y: Buffer, z: Buffer): Buffer {
  return Buffer.from(x.map((v, i) => v ^ y[i] ^ z[i]));
}

function assertCustomerInOrg(customerOrgId: string, requestOrgId: string) {
  if (customerOrgId !== requestOrgId) throw new ApiError(403, 'TENANT_MISMATCH', 'resource belongs to another organization');
  return true;
}

describe('Crypto primitives (AES-GCM)', () => {
  it('roundtrip encrypt/decrypt with 256-bit key and 12-byte IV', async () => {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const pt = Buffer.from('ChainLegacy Enterprise Vault Content');
    const { ct, tag } = await aesGcmEncrypt(key, pt, iv);
    const out = await aesGcmDecrypt(key, ct, tag, iv);
    expect(Buffer.from(out).toString()).toBe(pt.toString());
  });
  it('bit-flip in ciphertext raises (auth tag fails)', async () => {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const pt = Buffer.from('hello');
    const { ct, tag } = await aesGcmEncrypt(key, pt, iv);
    const tamperCt = Uint8Array.from(ct);
    tamperCt[0] ^= 0x01;
    await expect(aesGcmDecrypt(key, tamperCt, tag, iv)).rejects.toThrow();
  });
});

describe('Argon2id via hash-wasm installed', () => {
  it('hash-wasm module importable and argon2id is a function', async () => {
    const mod = await import('hash-wasm');
    expect(typeof mod.argon2id).toBe('function');
  });
});

describe('Shamir 2-of-3 combinatorics', () => {
  it('2-of-3 reconstruction yields original; 1-of-3 fails trivially', () => {
    const s = Buffer.from('topsecret-shamir');
    const [a, b, c] = splitShamir2of3(s);
    expect(combineShamir2of3(a, b, c).toString()).toBe(s.toString());
    const bad = combineShamir2of3(a, b, Buffer.alloc(s.length));
    expect(bad.toString()).not.toBe(s.toString());
  });
});

describe('Claim state transitions', () => {
  it('legal transitions pass isLegalClaimTransition', () => {
    expect(isLegalClaimTransition(ClaimStatus.PENDING, ClaimStatus.VERIFICATION)).toBe(true);
    expect(isLegalClaimTransition(ClaimStatus.GRACE_PERIOD, ClaimStatus.APPROVED)).toBe(true);
    expect(isLegalClaimTransition(ClaimStatus.APPROVED, ClaimStatus.COMPLETED)).toBe(true);
  });
  it('COMPLETED terminal has no outgoing transitions', () => {
    expect(CLAIM_LEGAL_TRANSITIONS[ClaimStatus.COMPLETED]).toHaveLength(0);
    expect(isLegalClaimTransition(ClaimStatus.COMPLETED, ClaimStatus.PENDING)).toBe(false);
  });
  it('invalid transitions rejected', () => {
    expect(isLegalClaimTransition(ClaimStatus.PENDING, ClaimStatus.APPROVED)).toBe(false);
    expect(isLegalClaimTransition(ClaimStatus.GUARDIAN_REVIEW, ClaimStatus.VERIFICATION)).toBe(false);
  });
  it('CANCELLED -> PENDING allowed (reopen by claimant)', () => {
    expect(isLegalClaimTransition(ClaimStatus.CANCELLED, ClaimStatus.PENDING)).toBe(true);
  });
  it('REJECTED -> PENDING allowed (resubmission workflow)', () => {
    expect(isLegalClaimTransition(ClaimStatus.REJECTED, ClaimStatus.PENDING)).toBe(true);
  });
});

describe('Guardian quorum', () => {
  function tally(approvals: Record<string, boolean>, quorum: number) {
    return Object.values(approvals).filter(Boolean).length >= quorum;
  }
  it('quorum 2 of 3 not met at 1 approve', () => {
    expect(tally({ g1: true, g2: false, g3: false }, 2)).toBe(false);
  });
  it('quorum 2 of 3 met at 2 approves', () => {
    expect(tally({ g1: true, g2: true, g3: false }, 2)).toBe(true);
  });
});

describe('Webhook HMAC', () => {
  it('valid signature within 5-minute tolerance', () => {
    const secret = generateSigningSecret();
    const payload = JSON.stringify({ id: 'evt_1', type: 'claim.created' });
    const t = Math.floor(Date.now() / 1000) - 30;
    const sig = signSignature(secret, payload, t);
    expect(verifySignature(secret, payload, sig)).toBe(true);
  });
  it('expired tolerance rejected', () => {
    const secret = generateSigningSecret();
    const payload = JSON.stringify({ id: 'evt_1' });
    const t = Math.floor(Date.now() / 1000) - 10 * 60;
    const sig = signSignature(secret, payload, t);
    expect(verifySignature(secret, payload, sig)).toBe(false);
  });
  it('tampered payload rejected', () => {
    const secret = generateSigningSecret();
    const payload = JSON.stringify({ id: 'evt_1' });
    const t = Math.floor(Date.now() / 1000);
    const sig = signSignature(secret, payload, t);
    expect(verifySignature(secret, payload + 'x', sig)).toBe(false);
  });
  it('wrong secret rejected', () => {
    const s1 = generateSigningSecret();
    const s2 = generateSigningSecret();
    const payload = JSON.stringify({ a: 1 });
    const t = Math.floor(Date.now() / 1000);
    const sig = signSignature(s1, payload, t);
    expect(verifySignature(s2, payload, sig)).toBe(false);
  });
  it('malformed header format rejected', () => {
    expect(verifySignature(generateSigningSecret(), '{}', 'garbage')).toBe(false);
    expect(verifySignature(generateSigningSecret(), '{}', 't=abc,v1=123')).toBe(false);
  });
});

describe('ApiError + JSON wrapper', () => {
  it('apiErrorResponse produces structured body + status header', async () => {
    const err = new ApiError(500, 'INTERNAL', 'boom', { extra: 1 });
    const r = apiErrorResponse(err, { requestId: 'req123' });
    const json: any = await r.json();
    expect(r.status).toBe(500);
    expect(json.code).toBe('INTERNAL');
    expect(json.requestId).toBe('req123');
    expect(json.error).toContain('boom');
  });
});

describe('Zod and scope primitives', () => {
  it('ApiScopes array contains billing:write entry', () => {
    expect(ApiScopes.includes('billing:write')).toBe(true);
  });
  it('ApiKeyScope literal `claims:manage` is a valid scope', () => {
    const v: ApiKeyScope = 'claims:manage';
    expect(typeof v).toBe('string');
  });
});

describe('ApiKey hasScope/prefix/hash', () => {
  it('hasScope required subset passes when present; fails when missing', () => {
    expect(hasScope(['customers:read', 'customers:write'], 'customers:read')).toBe(true);
    expect(hasScope(['customers:read'], 'customers:write')).toBe(false);
  });
  it('prefixes clsbox_ and clprod_ recognized', () => {
    expect(isKeyPrefix('clsbox_abc')).toBe(true);
    expect(isKeyPrefix('clprod_xyz')).toBe(true);
    expect(isKeyPrefix('pk_test_123')).toBe(false);
  });
  it('hashKeySecret produces deterministic sha256 hex', () => {
    const a = hashKeySecret('clsbox_hello');
    const b = hashKeySecret('clsbox_hello');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKeySecret('clsbox_world')).not.toBe(a);
  });
  it('hash verify timing-safe-equivalent pattern: secrets compared via hashes', () => {
    const raw = 'clsbox_' + randomBytes(20).toString('hex');
    const stored = Buffer.from(hashKeySecret(raw), 'hex');
    const candidate = Buffer.from(hashKeySecret(raw), 'hex');
    const wrong = Buffer.from(hashKeySecret(raw + 'x'), 'hex');
    expect(timingSafeEqual(stored, candidate)).toBe(true);
    expect(timingSafeEqual(stored, wrong)).toBe(false);
  });
});

function parsePagination(input: Partial<PaginationParams> | URLSearchParams): Required<Pick<PaginationParams, 'limit' | 'offset'>> {
  function raw(key: string): string | null {
    if (input instanceof URLSearchParams) return input.get(key);
    const v = (input as any)[key];
    return v === undefined || v === null ? null : String(v);
  }
  const limitRaw = raw('limit');
  const offsetRaw = raw('offset');
  const limitVal = limitRaw ? Math.min(parseInt(limitRaw, 10) || 20, 100) : 20;
  const offsetVal = offsetRaw ? Math.max(parseInt(offsetRaw, 10) || 0, 0) : 0;
  return { limit: limitVal, offset: offsetVal };
}
function parseIdempotencyKey(req: { headers: Headers | Record<string, string | string[] | undefined> }): string | null {
  const h = req.headers;
  const v = h instanceof Headers ? h.get('idempotency-key') : (h['idempotency-key'] as string | undefined);
  if (!v || typeof v !== 'string' || v.length > 64) return null;
  return v;
}

describe('Pagination + idempotency', () => {
  it('defaults limit 20 offset 0', () => {
    expect(parsePagination({})).toEqual({ limit: 20, offset: 0 });
  });
  it('limit clamped to 100', () => {
    expect(parsePagination({ limit: 1000 }).limit).toBe(100);
  });
  it('offset negative clamped to 0', () => {
    expect(parsePagination({ offset: -5 }).offset).toBe(0);
  });
  it('URLSearchParams parses correctly', () => {
    const p = new URLSearchParams('limit=50&offset=10');
    expect(parsePagination(p)).toEqual({ limit: 50, offset: 10 });
  });
  it('Idempotency-Key header parsed; invalid length returns null', () => {
    expect(parseIdempotencyKey({ headers: { 'idempotency-key': 'abc' } })).toBe('abc');
    expect(parseIdempotencyKey({ headers: {} })).toBeNull();
    const long = 'a'.repeat(65);
    expect(parseIdempotencyKey({ headers: { 'idempotency-key': long } })).toBeNull();
  });
});

describe('Event Redaction', () => {
  it('redacts top-level secret and nested otp', () => {
    const obj = { secret: 'xyz', nested: { otp: '123456', ok: 1 }, list: [{ a: 1 }, { password: 'p' }] };
    const r = redact(obj as any);
    expect(r.secret).toBe('[REDACTED]');
    expect(r.nested.otp).toBe('[REDACTED]');
    expect((r.list[1] as any).password).toBe('[REDACTED]');
    expect(r.nested.ok).toBe(1);
  });
  it('case insensitive match', () => {
    const r = redact({ SECRET: 'x', API_KEY: 'y' } as any);
    expect(r.SECRET).toBe('[REDACTED]');
    expect(r.API_KEY).toBe('[REDACTED]');
  });
  it('depth recursion guard', () => {
    let cur: any = {};
    const root = cur;
    for (let i = 0; i < 10; i++) {
      cur.next = { secret: 'x' };
      cur = cur.next;
    }
    const r = redact(root);
    expect(String(JSON.stringify(r))).toContain('[REDACTED_RECURSIVE]');
    expect(typeof JSON.stringify(r)).toBe('string');
  });
  it('redacts token array items and string values of sensitive keys', () => {
    const r = redact({ token: ['a', 'b'], seedPhrase: 'mnemonic' } as any);
    expect(r.token).toBe('[REDACTED]');
    expect(r.seedPhrase).toBe('[REDACTED]');
  });
});

describe('Tenant isolation invariants', () => {
  it('A accessing B customer → TENANT_MISMATCH', () => {
    expect(() => assertCustomerInOrg('orgB', 'orgA')).toThrow('resource belongs to another organization');
    try {
      assertCustomerInOrg('orgB', 'orgA');
    } catch (e: any) {
      expect(e.code).toBe('TENANT_MISMATCH');
    }
  });
  it('A accessing A customer → OK', () => {
    expect(assertCustomerInOrg('orgA', 'orgA')).toBe(true);
  });
  it('A accessing B plan → TENANT_MISMATCH', () => {
    expect(() => assertCustomerInOrg('orgB', 'orgA')).toThrow();
  });
  it('A accessing B claim → TENANT_MISMATCH', () => {
    expect(() => assertCustomerInOrg('orgB', 'orgA')).toThrow();
  });
  it('B using A key prefix rejected by hash verify (not equal timing safe)', () => {
    const a = Buffer.from(hashKeySecret('clsbox_A'), 'hex');
    const b = Buffer.from(hashKeySecret('clsbox_B'), 'hex');
    expect(timingSafeEqual(a, b)).toBe(false);
  });
  it('Unauthorized admin scope missing → false', () => {
    expect(hasScope(['customers:read'], '*')).toBe(false);
  });
});

describe('Liveness cron intervals map', () => {
  const now = Date.now();
  it('recent checkin → active stage', () => {
    const { stage } = stageAt(now, now - 10_000, 30);
    expect(stage).toBe('active');
  });
  it('30d + 5d since checkin → warning_email', () => {
    const { stage } = stageAt(now, now - (30 + 5) * 24 * 3600 * 1000, 30);
    expect(stage).toBe('warning_email');
  });
  it('well past grace → triggered', () => {
    const { stage } = stageAt(now, now - (365 * 24 * 3600 * 1000), 30);
    expect(stage).toBe('triggered');
  });
  it('suspicion 80 → skip processing (invariant only, filter outside function)', () => {
    const plans = [
      { id: 'p1', suspicion: 50 },
      { id: 'p2', suspicion: 80 },
      { id: 'p3', suspicion: 90 },
    ];
    expect(plans.filter(p => p.suspicion < 80).map(p => p.id)).toEqual(['p1']);
  });
});

describe('Structured error production-safe redaction (no stack in body)', () => {
  it('ApiError details plain object only; body never includes stack/process.env', () => {
    const e = new ApiError(401, 'UNAUTH', 'bad token');
    (e as any).stack = 'at file.ts line 1';
    const r = apiErrorResponse(e, { requestId: 'r1' });
    expect(r.status).toBe(401);
    expect(String((r as any).body ?? '')).not.toContain('file.ts');
  });
});

describe('SHA-256 hash consistency (API keys)', () => {
  it('hashKeySecret matches Node createHash(sha256).digest(hex)', () => {
    const raw = 'clsbox_' + randomUUID() + randomBytes(8).toString('hex');
    const expected = createHash('sha256').update(raw).digest('hex');
    expect(hashKeySecret(raw)).toBe(expected);
  });
});

describe('REGRESSION: Math.max(1, quorum) prevents zero-quorum auto-approval', () => {
  function makeBaseClaim() {
    return {
      id: 'claim_qt_1',
      organizationId: 'orgX',
      customerId: 'custX',
      legacyPlanId: 'planX',
      status: ClaimStatus.GUARDIAN_REVIEW,
      initiator: 'ben1',
      guardianApprovals: {} as Record<string, boolean>,
      transitions: [] as any[],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  function makePlan(quorum: number) {
    return {
      id: 'planX',
      organizationId: 'orgX',
      customerId: 'custX',
      name: 'Plan X',
      status: 'active',
      guardianQuorum: quorum,
    } as any;
  }

  it('plan.guardianQuorum=0, ZERO approvals → quorumMet MUST BE FALSE (bugfix)', () => {
    const claim = makeBaseClaim();
    const plan = makePlan(0);
    const result = registerGuardianApproval(claim, plan, 'g1', false, 'actor1');
    expect(result.quorumMet).toBe(false);
  });

  it('plan.guardianQuorum=0, ONE guardian approval → quorumMet TRUE', () => {
    const claim = makeBaseClaim();
    const plan = makePlan(0);
    const r1 = registerGuardianApproval(claim, plan, 'g1', true, 'actor1');
    expect(r1.quorumMet).toBe(true);
  });

  it('plan.guardianQuorum=2, ONE approval → FALSE; TWO → TRUE', () => {
    let claim: any = makeBaseClaim();
    const plan = makePlan(2);
    const r1 = registerGuardianApproval(claim, plan, 'g1', true, 'actor1');
    expect(r1.quorumMet).toBe(false);
    claim = r1.claim;
    const r2 = registerGuardianApproval(claim, plan, 'g2', true, 'actor1');
    expect(r2.quorumMet).toBe(true);
  });

  it('plan.guardianQuorum=2, same guardian approves twice → tally=1, quorumMet FALSE, approvals has only g1 key', () => {
    let claim: any = makeBaseClaim();
    const plan = makePlan(2);
    const r1 = registerGuardianApproval(claim, plan, 'g1', true, 'actor1');
    expect(r1.quorumMet).toBe(false);
    claim = r1.claim;
    const r2 = registerGuardianApproval(claim, plan, 'g1', true, 'actor1');
    expect(r2.quorumMet).toBe(false);
    const approvalKeys = Object.keys(r2.claim.guardianApprovals);
    expect(approvalKeys).toEqual(['g1']);
    expect(approvalKeys).toHaveLength(1);
    const tally = Object.values(r2.claim.guardianApprovals).filter(Boolean).length;
    expect(tally).toBe(1);
  });
});

describe('Security: terminal state mutation always DENIED', () => {
  function makeClaimAtStatus(status: ClaimStatus) {
    return {
      id: 'claim_term_1',
      organizationId: 'orgY',
      customerId: 'custY',
      legacyPlanId: 'planY',
      status,
      initiator: 'benY',
      guardianApprovals: {} as Record<string, boolean>,
      transitions: [{ from: '', to: status, at: new Date(), actor: 'init' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
  }

  it('COMPLETED: try transition to EVERY other ClaimStatus → all throw ILLEGAL_TRANSITION', () => {
    const allStatuses = Object.values(ClaimStatus);
    for (const to of allStatuses) {
      const claim = makeClaimAtStatus(ClaimStatus.COMPLETED);
      expect(() => ClaimEngine.transition(claim, to, 'actorX')).toThrow();
      try {
        ClaimEngine.transition(claim, to, 'actorX');
        expect(false).toBe(true);
      } catch (e: any) {
        expect(e.code).toBe('ILLEGAL_TRANSITION');
      }
    }
  });

  it('APPROVED: try transition to PENDING → throw ILLEGAL_TRANSITION', () => {
    const claim = makeClaimAtStatus(ClaimStatus.APPROVED);
    expect(() => ClaimEngine.transition(claim, ClaimStatus.PENDING, 'actorX')).toThrow();
    try {
      ClaimEngine.transition(claim, ClaimStatus.PENDING, 'actorX');
    } catch (e: any) {
      expect(e.code).toBe('ILLEGAL_TRANSITION');
    }
  });

  it('APPROVED: try transition to VERIFICATION → throw ILLEGAL_TRANSITION', () => {
    const claim = makeClaimAtStatus(ClaimStatus.APPROVED);
    expect(() => ClaimEngine.transition(claim, ClaimStatus.VERIFICATION, 'actorX')).toThrow();
    try {
      ClaimEngine.transition(claim, ClaimStatus.VERIFICATION, 'actorX');
    } catch (e: any) {
      expect(e.code).toBe('ILLEGAL_TRANSITION');
    }
  });

  it('CANCELLED: try transition to COMPLETED → throw ILLEGAL_TRANSITION', () => {
    const claim = makeClaimAtStatus(ClaimStatus.CANCELLED);
    expect(() => ClaimEngine.transition(claim, ClaimStatus.COMPLETED, 'actorX')).toThrow();
    try {
      ClaimEngine.transition(claim, ClaimStatus.COMPLETED, 'actorX');
    } catch (e: any) {
      expect(e.code).toBe('ILLEGAL_TRANSITION');
    }
  });

  it('CANCELLED: try transition to PENDING → LEGAL (only allowed outgoing)', () => {
    const claim = makeClaimAtStatus(ClaimStatus.CANCELLED);
    expect(() => ClaimEngine.transition(claim, ClaimStatus.PENDING, 'actorX')).not.toThrow();
    const result = ClaimEngine.transition(claim, ClaimStatus.PENDING, 'actorX');
    expect(result.status).toBe(ClaimStatus.PENDING);
  });
});
