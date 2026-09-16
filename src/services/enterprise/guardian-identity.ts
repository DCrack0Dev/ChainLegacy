import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { Guardian } from '@/types/enterprise';

export type GuardianProofScheme = 'eip712' | 'eth_sign' | 'firebase_uid_match';

export type GuardianProof = {
  scheme: GuardianProofScheme;
  nonce: string;
  signature?: string;
  messageHash?: string;
  signedAt: Date;
};

export const GUARDIAN_NONCE_TTL_MS = 5 * 60 * 1000;
export const GUARDIAN_PROOF_SCHEMES: GuardianProofScheme[] = ['eip712', 'eth_sign', 'firebase_uid_match'];

export type GuardianNonceRow = {
  nonce: string;
  guardianId: string;
  organizationId: string;
  createdAt: number;
  expiresAt: number;
  consumed: boolean;
};

export interface GuardianNonceStore {
  create(row: GuardianNonceRow): Promise<void>;
  load(guardianId: string, nonce: string, orgId: string): Promise<GuardianNonceRow | null>;
  markConsumed(guardianId: string, nonce: string, orgId: string): Promise<void>;
}

export interface SecurityEventCounter {
  increment(orgId: string, reason: string, meta: Record<string, unknown>): Promise<void>;
}

export interface GuardianStore {
  load(guardianId: string, orgId: string): Promise<Guardian | null>;
}

export interface WalletAddressVerifier {
  recoverAddress(messageHash: string, signature: string, scheme: GuardianProofScheme): Promise<string>;
}

function newNonce32(): string {
  return 'gn_' + randomBytes(32).toString('hex');
}

export function guardianNonceDocId(guardianId: string, nonce: string): string {
  return createHash('sha256').update(`${guardianId}:${nonce}`).digest('hex');
}

export async function issueGuardianNonce(params: {
  orgId: string;
  guardianId: string;
  nonces: GuardianNonceStore;
  now?: number;
}): Promise<GuardianNonceRow> {
  const now = params.now ?? Date.now();
  const row: GuardianNonceRow = {
    nonce: newNonce32(),
    guardianId: params.guardianId,
    organizationId: params.orgId,
    createdAt: now,
    expiresAt: now + GUARDIAN_NONCE_TTL_MS,
    consumed: false,
  };
  await params.nonces.create(row);
  return row;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function validateProofShape(proof: Partial<GuardianProof>): GuardianProof {
  if (!proof || typeof proof !== 'object') throw new Error('GUARDIAN_PROOF_INVALID');
  if (!proof.scheme || !GUARDIAN_PROOF_SCHEMES.includes(proof.scheme as any)) {
    throw new Error('GUARDIAN_PROOF_INVALID_SCHEME');
  }
  if (!proof.nonce || typeof proof.nonce !== 'string') throw new Error('GUARDIAN_PROOF_NONCE_MISSING');
  if (!proof.signedAt || Number.isNaN(Number(proof.signedAt))) throw new Error('GUARDIAN_PROOF_SIGNED_AT_MISSING');
  const scheme = proof.scheme as GuardianProofScheme;
  if (scheme === 'firebase_uid_match') {
    return {
      scheme: 'firebase_uid_match',
      nonce: proof.nonce,
      signedAt: new Date(proof.signedAt as number | string | Date),
    } as GuardianProof;
  }
  if (!proof.signature || typeof proof.signature !== 'string') {
    throw new Error('GUARDIAN_PROOF_SIGNATURE_MISSING');
  }
  if (!proof.messageHash || typeof proof.messageHash !== 'string') {
    throw new Error('GUARDIAN_PROOF_MESSAGE_HASH_MISSING');
  }
  return {
    scheme,
    nonce: proof.nonce,
    signature: proof.signature,
    messageHash: proof.messageHash,
    signedAt: new Date(proof.signedAt as number | string | Date),
  } as GuardianProof;
}

export type GuardianProofResult =
  | { ok: true; guardian: Guardian }
  | { ok: false; code: string; reason: string };

export async function verifyGuardianProof(params: {
  orgId: string;
  guardianId: string;
  proof: Partial<GuardianProof>;
  callerFirebaseUid?: string;
  guardians: GuardianStore;
  nonces: GuardianNonceStore;
  walletVerifier: WalletAddressVerifier;
  securityEvents?: SecurityEventCounter;
  now?: number;
}): Promise<GuardianProofResult> {
  const now = params.now ?? Date.now();
  const guardian = await params.guardians.load(params.guardianId, params.orgId);
  if (!guardian) return { ok: false, code: 'GUARDIAN_NOT_FOUND', reason: 'guardian not found' };
  if (guardian.organizationId !== params.orgId) {
    await params.securityEvents?.increment(params.orgId, 'guardian_identity_org_mismatch', { guardianId: params.guardianId });
    return { ok: false, code: 'TENANT_MISMATCH', reason: 'guardian does not belong to this organization' };
  }
  let proof: GuardianProof;
  try {
    proof = validateProofShape(params.proof);
  } catch (e: any) {
    await params.securityEvents?.increment(params.orgId, 'guardian_identity_shape_fail', { guardianId: params.guardianId, err: e.message });
    return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: e.message };
  }
  const signedAtMs = new Date(proof.signedAt).getTime();
  if (Math.abs(signedAtMs - now) > 10 * 60 * 1000) {
    await params.securityEvents?.increment(params.orgId, 'guardian_identity_clock_skew', { guardianId: params.guardianId, signedAtMs, now });
    return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: 'proof outside clock skew window' };
  }
  const stored = await params.nonces.load(params.guardianId, proof.nonce, params.orgId);
  if (!stored || stored.consumed || stored.organizationId !== params.orgId || stored.expiresAt < now) {
    await params.securityEvents?.increment(params.orgId, 'guardian_identity_nonce_invalid', { guardianId: params.guardianId, noncePrefix: proof.nonce.slice(0, 8) });
    return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: 'nonce invalid/expired' };
  }
  if (!constantTimeEqual(stored.nonce, proof.nonce)) {
    await params.securityEvents?.increment(params.orgId, 'guardian_identity_nonce_ct_fail', { guardianId: params.guardianId });
    return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: 'nonce ct mismatch' };
  }
  if (proof.scheme === 'firebase_uid_match') {
    if (!guardian.firebaseUid || !params.callerFirebaseUid) {
      await params.securityEvents?.increment(params.orgId, 'guardian_identity_firebase_uid_missing', { guardianId: params.guardianId });
      return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: 'firebase uid identity required' };
    }
    if (!constantTimeEqual(guardian.firebaseUid, params.callerFirebaseUid)) {
      await params.securityEvents?.increment(params.orgId, 'guardian_identity_firebase_uid_mismatch', { guardianId: params.guardianId });
      return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: 'firebase uid mismatch' };
    }
    await params.nonces.markConsumed(params.guardianId, stored.nonce, params.orgId);
    return { ok: true, guardian };
  }
  if (proof.scheme === 'eip712' || proof.scheme === 'eth_sign') {
    if (!guardian.walletAddress) {
      await params.securityEvents?.increment(params.orgId, 'guardian_identity_wallet_missing', { guardianId: params.guardianId });
      return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: 'guardian has no wallet identity' };
    }
    let recovered = '0x';
    try {
      recovered = await params.walletVerifier.recoverAddress(proof.messageHash!, proof.signature!, proof.scheme);
    } catch (e: any) {
      await params.securityEvents?.increment(params.orgId, 'guardian_identity_recover_err', { guardianId: params.guardianId, err: e.message });
      return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: 'recover err' };
    }
    if (recovered.toLowerCase() !== guardian.walletAddress.toLowerCase()) {
      await params.securityEvents?.increment(params.orgId, 'guardian_identity_wallet_mismatch', { guardianId: params.guardianId, recovered });
      return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: 'wallet signature mismatch' };
    }
    await params.nonces.markConsumed(params.guardianId, stored.nonce, params.orgId);
    return { ok: true, guardian };
  }
  return { ok: false, code: 'GUARDIAN_IDENTITY_PROOF_REQUIRED', reason: 'unsupported scheme' };
}
