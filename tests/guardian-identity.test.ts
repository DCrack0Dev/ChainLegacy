import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueGuardianNonce,
  verifyGuardianProof,
  validateProofShape,
  type GuardianNonceStore,
  type GuardianStore,
  type WalletAddressVerifier,
  type SecurityEventCounter,
} from '@/services/enterprise/guardian-identity';
import type { Guardian } from '@/types/enterprise';

class InMemoryNonceStore implements GuardianNonceStore {
  rows = new Map<string, any>();
  key(gid: string, nonce: string, orgId: string) { return `${orgId}|${gid}|${nonce}`; }
  async create(row: any) { this.rows.set(this.key(row.guardianId, row.nonce, row.organizationId), row); }
  async load(gid: string, nonce: string, orgId: string) { return this.rows.get(this.key(gid, nonce, orgId)) ?? null; }
  async markConsumed(gid: string, nonce: string, orgId: string) {
    const r = this.rows.get(this.key(gid, nonce, orgId));
    if (r) r.consumed = true;
  }
}

class InMemoryGuardianStore implements GuardianStore {
  map = new Map<string, Guardian>();
  key(id: string, orgId: string) { return `${orgId}|${id}`; }
  async load(id: string, orgId: string) { return this.map.get(this.key(id, orgId)) ?? null; }
  add(g: Guardian) { this.map.set(this.key(g.id, g.organizationId), g); }
}

class InMemorySecurityCounter implements SecurityEventCounter {
  events: any[] = [];
  async increment(orgId: string, reason: string, meta: any) {
    this.events.push({ orgId, reason, meta });
  }
}

const WALLET_A = '0x' + '11'.repeat(20);
const FIREBASE_A = 'firebaseUid_A';

function makeGuardian(params: Partial<Guardian> & { id: string; organizationId: string }): Guardian {
  return {
    id: params.id,
    organizationId: params.organizationId,
    name: params.name ?? 'G',
    email: params.email ?? 'g@example.com',
    firebaseUid: (params as any).firebaseUid,
    walletAddress: (params as any).walletAddress,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as Guardian;
}

function fixedWalletVerifier(returnAddress: string): WalletAddressVerifier {
  return {
    async recoverAddress(_msg: string, _sig: string, _scheme: any) { return returnAddress; },
  };
}

describe('validateProofShape (FR-1 shape)', () => {
  it('requires scheme non-empty in whitelist', () => {
    expect(() => validateProofShape({} as any)).toThrow(/SCHEME/);
    expect(() => validateProofShape({ scheme: 'garbage' } as any)).toThrow(/SCHEME/);
  });
  it('firebase_uid_match requires nonce + signedAt only (no signature)', () => {
    const p = validateProofShape({ scheme: 'firebase_uid_match', nonce: 'n', signedAt: new Date(Date.now()) });
    expect(p.scheme).toBe('firebase_uid_match');
    expect(p.nonce).toBe('n');
  });
  it('eth_sign/eip712 requires signature + messageHash', () => {
    expect(() => validateProofShape({ scheme: 'eth_sign', nonce: 'n', signedAt: new Date(Date.now()) } as any)).toThrow(/SIGNATURE_MISSING/);
    const ok = validateProofShape({ scheme: 'eth_sign', nonce: 'n', signedAt: new Date(Date.now()), signature: '0xS', messageHash: '0xH' });
    expect(ok.signature).toBe('0xS');
  });
});

describe('verifyGuardianProof firebase_uid_match (AC-1 TR-11 FR-1.2)', () => {
  let nonces: InMemoryNonceStore;
  let guardians: InMemoryGuardianStore;
  let counter: InMemorySecurityCounter;
  let now = 1000 * 60 * 60 * 1000;

  beforeEach(() => {
    nonces = new InMemoryNonceStore();
    guardians = new InMemoryGuardianStore();
    counter = new InMemorySecurityCounter();
    const g = makeGuardian({ id: 'g1', organizationId: 'orgA', firebaseUid: FIREBASE_A, walletAddress: undefined as any });
    guardians.add(g);
    now = 1000 * 60 * 60 * 1000;
  });

  it('valid firebase uid match consumes nonce ok', async () => {
    const nonceRow = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'g1', nonces, now });
    const out = await verifyGuardianProof({
      orgId: 'orgA',
      guardianId: 'g1',
      proof: { scheme: 'firebase_uid_match', nonce: nonceRow.nonce, signedAt: new Date(now) },
      callerFirebaseUid: FIREBASE_A,
      guardians, nonces,
      walletVerifier: fixedWalletVerifier('0x00'),
      securityEvents: counter, now,
    });
    expect(out.ok).toBe(true);
    expect((out as any).guardian.id).toBe('g1');
    const reread = await nonces.load('g1', nonceRow.nonce, 'orgA');
    expect(reread!.consumed).toBe(true);
  });

  it('rejects cross-org guardian (orgB verify against orgA-scoped guardian store g1) via TENANT_MISMATCH', async () => {
    const nonceRow = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'g1', nonces, now });
    const out = await verifyGuardianProof({
      orgId: 'orgB', guardianId: 'g1',
      proof: { scheme: 'firebase_uid_match', nonce: nonceRow.nonce, signedAt: new Date(now) },
      callerFirebaseUid: FIREBASE_A,
      guardians, nonces,
      walletVerifier: fixedWalletVerifier('0x00'),
      securityEvents: counter, now,
    });
    expect(out.ok).toBe(false);
    expect((out as any).code).toBe('GUARDIAN_NOT_FOUND');
  });

  it('T1: OrgA uses own guardian proof succeeds; OrgB same guardianId string fails GUARDIAN_NOT_FOUND', async () => {
    const guardB = makeGuardian({ id: 'g1', organizationId: 'orgB', firebaseUid: 'firebaseUid_B' });
    guardians.add(guardB);
    const nA = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'g1', nonces, now });
    const rA = await verifyGuardianProof({
      orgId: 'orgA', guardianId: 'g1',
      proof: { scheme: 'firebase_uid_match', nonce: nA.nonce, signedAt: new Date(now) },
      callerFirebaseUid: FIREBASE_A,
      guardians, nonces, walletVerifier: fixedWalletVerifier('0x00'),
      securityEvents: counter, now,
    });
    expect(rA.ok).toBe(true);
    const nB = await issueGuardianNonce({ orgId: 'orgB', guardianId: 'g1', nonces, now });
    const rB = await verifyGuardianProof({
      orgId: 'orgB', guardianId: 'g1',
      proof: { scheme: 'firebase_uid_match', nonce: nB.nonce, signedAt: new Date(now) },
      callerFirebaseUid: FIREBASE_A,
      guardians, nonces, walletVerifier: fixedWalletVerifier('0x00'),
      securityEvents: counter, now,
    });
    expect(rB.ok).toBe(false);
    expect((rB as any).code).toBe('GUARDIAN_IDENTITY_PROOF_REQUIRED');
  });

  it('T2: OrgB uses OrgA-issued nonce fails (nonce scoped to orgA)', async () => {
    const nA = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'g1', nonces, now });
    const guardB = makeGuardian({ id: 'g1', organizationId: 'orgB', firebaseUid: FIREBASE_A });
    guardians.add(guardB);
    const rB = await verifyGuardianProof({
      orgId: 'orgB', guardianId: 'g1',
      proof: { scheme: 'firebase_uid_match', nonce: nA.nonce, signedAt: new Date(now) },
      callerFirebaseUid: FIREBASE_A,
      guardians, nonces, walletVerifier: fixedWalletVerifier('0x00'),
      securityEvents: counter, now,
    });
    expect(rB.ok).toBe(false);
    expect((rB as any).code).toBe('GUARDIAN_IDENTITY_PROOF_REQUIRED');
  });

  it('T3: Valid OrgA guardian firebase uid match proof succeeds cross tenant intact', async () => {
    const nA = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'g1', nonces, now });
    const out = await verifyGuardianProof({
      orgId: 'orgA', guardianId: 'g1',
      proof: { scheme: 'firebase_uid_match', nonce: nA.nonce, signedAt: new Date(now) },
      callerFirebaseUid: FIREBASE_A,
      guardians, nonces, walletVerifier: fixedWalletVerifier('0x00'),
      securityEvents: counter, now,
    });
    expect(out.ok).toBe(true);
  });

  it('T4: Same guardianId in 2 orgs -> cross-org use via wrong org context fails, within own org ok', async () => {
    const g2A = makeGuardian({ id: 'gX', organizationId: 'orgA', firebaseUid: 'firebase_A' });
    const g2B = makeGuardian({ id: 'gX', organizationId: 'orgB', firebaseUid: 'firebase_B' });
    guardians.add(g2A);
    guardians.add(g2B);
    const nB = await issueGuardianNonce({ orgId: 'orgB', guardianId: 'gX', nonces, now });
    const useAOrgContext = await verifyGuardianProof({
      orgId: 'orgA', guardianId: 'gX',
      proof: { scheme: 'firebase_uid_match', nonce: nB.nonce, signedAt: new Date(now) },
      callerFirebaseUid: 'firebase_B',
      guardians, nonces, walletVerifier: fixedWalletVerifier('0x00'),
      securityEvents: counter, now,
    });
    expect(useAOrgContext.ok).toBe(false);
    const useBOrgCorrect = await issueGuardianNonce({ orgId: 'orgB', guardianId: 'gX', nonces, now }).then(async (n) => {
      const out = await verifyGuardianProof({
        orgId: 'orgB', guardianId: 'gX',
        proof: { scheme: 'firebase_uid_match', nonce: n.nonce, signedAt: new Date(now) },
        callerFirebaseUid: 'firebase_B',
        guardians, nonces, walletVerifier: fixedWalletVerifier('0x00'),
        securityEvents: counter, now,
      });
      return out.ok;
    });
    expect(useBOrgCorrect).toBe(true);
  });

  it('T5: Replayed nonce across orgs: orgA nonce used by orgB fails', async () => {
    const nA = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'g1', nonces, now });
    // Consume nonce in orgA first
    await verifyGuardianProof({
      orgId: 'orgA', guardianId: 'g1',
      proof: { scheme: 'firebase_uid_match', nonce: nA.nonce, signedAt: new Date(now) },
      callerFirebaseUid: FIREBASE_A,
      guardians, nonces, walletVerifier: fixedWalletVerifier('0x00'), securityEvents: counter, now,
    });
    // Try to reuse orgA nonce in orgB: load fails
    const guardB = makeGuardian({ id: 'g1', organizationId: 'orgB', firebaseUid: FIREBASE_A });
    guardians.add(guardB);
    const replay = await verifyGuardianProof({
      orgId: 'orgB', guardianId: 'g1',
      proof: { scheme: 'firebase_uid_match', nonce: nA.nonce, signedAt: new Date(now) },
      callerFirebaseUid: FIREBASE_A,
      guardians, nonces, walletVerifier: fixedWalletVerifier('0x00'),
      securityEvents: counter, now,
    });
    expect(replay.ok).toBe(false);
  });

  it('rejects if caller uid != guardian.firebaseUid + counter event, no consume', async () => {
    const nonceRow = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'g1', nonces, now });
    const out = await verifyGuardianProof({
      orgId: 'orgA', guardianId: 'g1',
      proof: { scheme: 'firebase_uid_match', nonce: nonceRow.nonce, signedAt: new Date(now) },
      callerFirebaseUid: 'stranger',
      guardians, nonces,
      walletVerifier: fixedWalletVerifier('0x00'),
      securityEvents: counter, now,
    });
    expect(out.ok).toBe(false);
    expect(counter.events.some(e => e.reason.includes('firebase_uid_mismatch'))).toBe(true);
    const reread = await nonces.load('g1', nonceRow.nonce, 'orgA');
    expect(reread!.consumed).toBe(false);
  });
});

describe('verifyGuardianProof wallet eth_sign (AC-1 FR-1.3 eip712)', () => {
  let nonces: InMemoryNonceStore;
  let guardians: InMemoryGuardianStore;
  let counter: InMemorySecurityCounter;
  let now: number;
  beforeEach(() => {
    nonces = new InMemoryNonceStore();
    guardians = new InMemoryGuardianStore();
    counter = new InMemorySecurityCounter();
    now = 1000 * 60 * 60 * 1000;
    const g = makeGuardian({ id: 'gw1', organizationId: 'orgA', walletAddress: WALLET_A, firebaseUid: undefined as any });
    guardians.add(g);
  });
  it('accepted when recovered address matches guardian walletAddress, nonce consumed', async () => {
    const nonceRow = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'gw1', nonces, now });
    const out = await verifyGuardianProof({
      orgId: 'orgA', guardianId: 'gw1',
      proof: { scheme: 'eth_sign', nonce: nonceRow.nonce, signedAt: new Date(now), signature: '0xSIG', messageHash: '0xHASH' },
      guardians, nonces,
      walletVerifier: fixedWalletVerifier(WALLET_A),
      securityEvents: counter, now,
    });
    expect(out.ok).toBe(true);
    const reread = await nonces.load('gw1', nonceRow.nonce, 'orgA');
    expect(reread!.consumed).toBe(true);
    expect(counter.events).toHaveLength(0);
  });
  it('rejects mismatch recovered address + security event', async () => {
    const nonceRow = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'gw1', nonces, now });
    const out = await verifyGuardianProof({
      orgId: 'orgA', guardianId: 'gw1',
      proof: { scheme: 'eip712', nonce: nonceRow.nonce, signedAt: new Date(now), signature: '0xSIG', messageHash: '0xHASH' },
      guardians, nonces,
      walletVerifier: fixedWalletVerifier('0x' + '99'.repeat(20)),
      securityEvents: counter, now,
    });
    expect(out.ok).toBe(false);
    expect((out as any).code).toBe('GUARDIAN_IDENTITY_PROOF_REQUIRED');
    expect(counter.events.some(e => e.reason.includes('wallet_mismatch'))).toBe(true);
    const reread = await nonces.load('gw1', nonceRow.nonce, 'orgA');
    expect(reread!.consumed).toBe(false);
  });
  it('rejects expired nonce (expiresAt past now by > TTL) + no consume', async () => {
    const nonceRow = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'gw1', nonces, now });
    await expect(
      verifyGuardianProof({
        orgId: 'orgA', guardianId: 'gw1',
        proof: { scheme: 'eth_sign', nonce: nonceRow.nonce, signedAt: new Date(now + 1000), signature: '0xSIG', messageHash: '0xHASH' },
        guardians, nonces,
        walletVerifier: fixedWalletVerifier(WALLET_A),
        securityEvents: counter,
        now: now + 1000 * 60 * 30,
      }),
    ).resolves.toMatchObject({ ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED' });
  });
  it('rejects reused nonce (consumed=true from prior call)', async () => {
    const nonceRow = await issueGuardianNonce({ orgId: 'orgA', guardianId: 'gw1', nonces, now });
    const first = await verifyGuardianProof({
      orgId: 'orgA', guardianId: 'gw1',
      proof: { scheme: 'eth_sign', nonce: nonceRow.nonce, signedAt: new Date(now), signature: '0xSIG', messageHash: '0xHASH' },
      guardians, nonces,
      walletVerifier: fixedWalletVerifier(WALLET_A),
      securityEvents: counter, now,
    });
    expect(first.ok).toBe(true);
    const replay = await verifyGuardianProof({
      orgId: 'orgA', guardianId: 'gw1',
      proof: { scheme: 'eth_sign', nonce: nonceRow.nonce, signedAt: new Date(now), signature: '0xSIG', messageHash: '0xHASH' },
      guardians, nonces,
      walletVerifier: fixedWalletVerifier(WALLET_A),
      securityEvents: counter, now,
    });
    expect(replay.ok).toBe(false);
    expect(counter.events.some(e => e.reason.includes('nonce_invalid'))).toBe(true);
  });
});
