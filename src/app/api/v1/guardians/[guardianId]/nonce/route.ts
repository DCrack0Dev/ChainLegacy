import { v1Route, structuredJson } from '@/lib/v1-route';
import { ApiError } from '@/lib/api-errors';
import {
  issueGuardianNonce,
  GuardianNonceStore,
  GuardianStore,
  GuardianNonceRow,
  GUARDIAN_NONCE_TTL_MS,
} from '@/services/enterprise/guardian-identity';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

class FirestoreGuardianNonceStore implements GuardianNonceStore {
  async create(row: GuardianNonceRow): Promise<void> {
    if (!adminDb) return;
    await adminDb
      .collection('organizations')
      .doc(row.organizationId)
      .collection('guardianNonces')
      .doc(row.nonce)
      .set(row);
  }
  async load(guardianId: string, nonce: string, orgId: string): Promise<GuardianNonceRow | null> {
    if (!adminDb) return null;
    const snaps = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('guardianNonces')
      .where('nonce', '==', nonce)
      .where('guardianId', '==', guardianId)
      .where('organizationId', '==', orgId)
      .limit(1)
      .get();
    return snaps.empty ? null : (snaps.docs[0].data() as GuardianNonceRow);
  }
  async markConsumed(_guardianId: string, nonce: string, orgId: string): Promise<void> {
    if (!adminDb) return;
    const snaps = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('guardianNonces')
      .where('nonce', '==', nonce)
      .where('organizationId', '==', orgId)
      .limit(1)
      .get();
    if (snaps.empty) return;
    const doc = snaps.docs[0];
    await doc.ref.update({ consumed: true, consumedAt: Date.now() });
  }
}

class FirestoreGuardianStore implements GuardianStore {
  async load(guardianId: string, orgId: string): Promise<any | null> {
    if (!adminDb) return null;
    const snaps = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('guardians')
      .where('id', '==', guardianId)
      .where('organizationId', '==', orgId)
      .limit(1)
      .get();
    return snaps.empty ? null : (snaps.docs[0].data() as any);
  }
}

const nonces = new FirestoreGuardianNonceStore();
const guardians = new FirestoreGuardianStore();

export const GET = v1Route({
  method: 'GET',
  scope: 'guardians:read',
  requireOrg: true,
  async handle({ auth, params, requestId }) {
    const guardianId = params.guardianId;
    if (!guardianId) throw new ApiError(400, 'GUARDIAN_ID_MISSING', 'Guardian id required');
    const g = await guardians.load(guardianId, auth.organizationId!);
    if (!g || g.organizationId !== auth.organizationId) {
      throw new ApiError(404, 'GUARDIAN_NOT_FOUND', 'Guardian not found');
    }
    const row = await issueGuardianNonce({
      orgId: auth.organizationId!,
      guardianId,
      nonces,
      now: Date.now(),
    });
    return structuredJson({
      nonce: row.nonce,
      guardianId: row.guardianId,
      issuedAt: new Date(row.createdAt).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
      ttlMs: GUARDIAN_NONCE_TTL_MS,
      requestId,
    });
  },
});
