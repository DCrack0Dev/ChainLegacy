import { ApiError } from '@/lib/api-errors';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import {
  Customer,
  IdentityVerificationStatus,
  LegacyPlan,
  Organization,
  Vault,
  VaultCreate,
  VaultStatus,
} from '@/types/enterprise';
import { ID_PREFIXES, createId } from '@/services/enterprise/persistence';
import { getMockIdentityProvider, MockIdentityProvider } from '@/services/enterprise/identity-verification';

/**
 * Canonical enterprise domain relationships (Phase 1).
 *
 *   Firebase Auth UID → Customer → Vault → Legacy Plan → Beneficiaries/Guardians → Claims
 *
 * Principles enforced here:
 *  - `firebaseUid` identifies the authenticated *person*; the Customer identifies the
 *    enterprise-domain *customer*. `users/{uid}` is not a domain table.
 *  - A Vault belongs to exactly one Customer (`vault.customerId` + `customer.vaultId`).
 *  - A Legacy Plan arranges exactly one Vault, owned by the same Customer.
 *  - Beneficiaries/Guardians/Claims never straddle tenants or customers.
 *  - Verification status is server-owned; the browser can never set `verified`.
 */

export const DOMAIN_ERROR_CODES = {
  RELATIONSHIP_REQUIRED: 'RELATIONSHIP_REQUIRED',
  RELATED_RESOURCE_NOT_FOUND: 'RELATED_RESOURCE_NOT_FOUND',
  RELATED_RESOURCE_WRONG_TENANT: 'RELATED_RESOURCE_WRONG_TENANT',
  RELATIONSHIP_CONFLICT: 'RELATIONSHIP_CONFLICT',
  DUPLICATE_VAULT: 'DUPLICATE_VAULT',
  DUPLICATE_VALIDATED_IDENTITY: 'DUPLICATE_VALIDATED_IDENTITY',
  VERIFICATION_TRANSITION_ILLEGAL: 'VERIFICATION_TRANSITION_ILLEGAL',
  CLAIM_REQUIRES_VERIFIED_IDENTITY: 'CLAIM_REQUIRES_VERIFIED_IDENTITY',
} as const;

export const IDENTITY_VERIFICATION_LEGAL_TRANSITIONS: Record<
  IdentityVerificationStatus,
  readonly IdentityVerificationStatus[]
> = {
  [IdentityVerificationStatus.NOT_STARTED]: [
    IdentityVerificationStatus.PENDING,
    IdentityVerificationStatus.MANUAL_REVIEW,
  ],
  [IdentityVerificationStatus.PENDING]: [
    IdentityVerificationStatus.VERIFIED,
    IdentityVerificationStatus.REJECTED,
    IdentityVerificationStatus.MANUAL_REVIEW,
  ],
  [IdentityVerificationStatus.VERIFIED]: [
    IdentityVerificationStatus.NOT_STARTED,
    IdentityVerificationStatus.PENDING,
  ],
  [IdentityVerificationStatus.REJECTED]: [
    IdentityVerificationStatus.PENDING,
    IdentityVerificationStatus.MANUAL_REVIEW,
  ],
  [IdentityVerificationStatus.MANUAL_REVIEW]: [
    IdentityVerificationStatus.PENDING,
    IdentityVerificationStatus.VERIFIED,
    IdentityVerificationStatus.REJECTED,
  ],
};

export function isLegalIdentityVerificationTransition(
  from: IdentityVerificationStatus,
  to: IdentityVerificationStatus,
): boolean {
  if (from === to) return true;
  return (IDENTITY_VERIFICATION_LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

export function isCustomerIdentityVerified(customer: Pick<Customer, 'verificationStatus'>): boolean {
  return customer.verificationStatus === IdentityVerificationStatus.VERIFIED;
}

/* ------------------------------------------------------------------ *
 * Pure relationship assertions (deterministic, unit-testable)
 * ------------------------------------------------------------------ */

export type CustomerIdentityInput = Pick<Customer, 'id' | 'organizationId' | 'firebaseUid'>;

export function assertCustomerIdentityLink(customer: CustomerIdentityInput): void {
  const uid = customer.firebaseUid;
  if (typeof uid !== 'string' || uid.trim().length === 0) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.RELATIONSHIP_REQUIRED,
      'Customer must link a Firebase UID (firebaseUid) to the authenticated person',
      { customerId: customer.id, field: 'firebaseUid' },
    );
  }
  if (uid === customer.id) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT,
      'firebaseUid must not be reused as the domain customer id: Customer is the domain identity',
      { customerId: customer.id },
    );
  }
}

export function assertFirebaseUidNotReusedAsCustomerId(
  firebaseUid: string,
  customerRows: ReadonlyArray<Pick<Customer, 'id'>>,
): void {
  const clash = customerRows.some((row) => row.id === firebaseUid);
  if (clash) {
    throw new ApiError(
      409,
      DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT,
      'A Firebase UID must never be used as a Customer id (users/{uid} is not the enterprise domain model)',
      { firebaseUid },
    );
  }
}

export function assertCustomerHasNoValidatedIdentity(
  customer: Pick<Customer, 'id' | 'firebaseUid'>,
  existing: ReadonlyArray<Pick<Customer, 'id' | 'firebaseUid'>>,
): void {
  const uid = customer.firebaseUid;
  if (typeof uid !== 'string' || uid.length === 0) return;
  const clash = existing.find((row) => row.id !== customer.id && row.firebaseUid === uid);
  if (clash) {
    throw new ApiError(
      409,
      DOMAIN_ERROR_CODES.DUPLICATE_VALIDATED_IDENTITY,
      'Firebase UID is already linked to another customer in this organization',
      { firebaseUid: uid, conflictingCustomerId: clash.id },
    );
  }
}

export function assertVaultBelongsToCustomer(
  vault: Pick<Vault, 'id' | 'organizationId' | 'customerId'>,
  customer: Pick<Customer, 'id' | 'organizationId'>,
): void {
  if (vault.organizationId !== customer.organizationId) {
    throw new ApiError(
      403,
      DOMAIN_ERROR_CODES.RELATED_RESOURCE_WRONG_TENANT,
      'Vault and customer belong to different organizations',
      {
        vaultId: vault.id,
        vaultOrganizationId: vault.organizationId,
        customerOrganizationId: customer.organizationId,
      },
    );
  }
  if (vault.customerId !== customer.id) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT,
      'Vault is not linked to the supplied customer',
      { vaultId: vault.id, vaultCustomerId: vault.customerId, customerId: customer.id },
    );
  }
}

export function assertVaultLink(
  customer: Pick<Customer, 'id' | 'organizationId' | 'vaultId'>,
  vault: Pick<Vault, 'id' | 'organizationId' | 'customerId'>,
): void {
  assertVaultBelongsToCustomer(vault, customer);
  if (customer.vaultId !== vault.id) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT,
      'Customer is not linked back to the supplied vault (customer.vaultId mismatch)',
      { customerId: customer.id, customerVaultId: customer.vaultId ?? null, vaultId: vault.id },
    );
  }
}

export function assertPlanRelationship(
  plan: Pick<LegacyPlan, 'id' | 'organizationId' | 'customerId' | 'vaultId'>,
  customer: Pick<Customer, 'id' | 'organizationId'>,
  vault?: Pick<Vault, 'id' | 'organizationId' | 'customerId'> | null,
): void {
  if (plan.organizationId !== customer.organizationId) {
    throw new ApiError(
      403,
      DOMAIN_ERROR_CODES.RELATED_RESOURCE_WRONG_TENANT,
      'Legacy plan and customer belong to different organizations',
      {
        planId: plan.id,
        planOrganizationId: plan.organizationId,
        customerOrganizationId: customer.organizationId,
      },
    );
  }
  if (plan.customerId !== customer.id) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT,
      'Legacy plan is not linked to the supplied customer',
      { planId: plan.id, planCustomerId: plan.customerId, customerId: customer.id },
    );
  }
  if (!vault) return;
  if (plan.vaultId !== vault.id) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT,
      'Legacy plan is not linked to the supplied vault',
      { planId: plan.id, planVaultId: plan.vaultId ?? null, vaultId: vault.id },
    );
  }
  if (vault.customerId !== customer.id) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT,
      'Legacy plan vault belongs to a different customer',
      { planId: plan.id, vaultId: vault.id, vaultCustomerId: vault.customerId, customerId: customer.id },
    );
  }
}

export function assertPlanVaultConsistency(plan: Pick<LegacyPlan, 'id' | 'customerId' | 'vaultId'>): void {
  if (!plan.vaultId) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.RELATIONSHIP_REQUIRED,
      'Legacy plan must reference a vault (vaultId is required)',
      { planId: plan.id, field: 'vaultId' },
    );
  }
}

export function assertChildSameOrganization(
  child: { id: string; organizationId: string },
  parent: { id: string; organizationId: string },
  label: string,
): void {
  if (child.organizationId !== parent.organizationId) {
    throw new ApiError(
      403,
      DOMAIN_ERROR_CODES.RELATED_RESOURCE_WRONG_TENANT,
      `${label} belongs to another organization`,
      { childId: child.id, childOrganizationId: child.organizationId, parentOrganizationId: parent.organizationId },
    );
  }
}

export function assertChildSameCustomer(
  child: { id: string; customerId?: string | null },
  parent: { id: string },
  label: string,
): void {
  if (!child.customerId || child.customerId !== parent.id) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT,
      `${label} must reference the same customer (customerId mismatch)`,
      { childId: child.id, childCustomerId: child.customerId ?? null, customerId: parent.id },
    );
  }
}

/**
 * The browser can only ever *start* or *restart* a verification flow. Reaching any
 * provider outcome (`verified` / `rejected` / `manual_review`) requires a server actor.
 */
export const SERVER_OWNED_VERIFICATION_OUTCOMES: readonly IdentityVerificationStatus[] = [
  IdentityVerificationStatus.VERIFIED,
  IdentityVerificationStatus.REJECTED,
  IdentityVerificationStatus.MANUAL_REVIEW,
];

export function assertVerificationTransitionAllowedByActor(
  from: IdentityVerificationStatus,
  to: IdentityVerificationStatus,
  actor: 'client' | 'server',
): void {
  if (!isLegalIdentityVerificationTransition(from, to)) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.VERIFICATION_TRANSITION_ILLEGAL,
      `Illegal identity verification transition: ${from} to ${to}`,
      { from, to },
    );
  }
  if (actor === 'client' && SERVER_OWNED_VERIFICATION_OUTCOMES.includes(to)) {
    throw new ApiError(
      403,
      DOMAIN_ERROR_CODES.VERIFICATION_TRANSITION_ILLEGAL,
      'Verification outcome is server-owned: the browser cannot mark an identity as verified/rejected/manual_review',
      { from, to, actor },
    );
  }
}

export function assertIdentityVerifiedForClaim(
  customer: Pick<Customer, 'id' | 'verificationStatus'>,
): void {
  if (!isCustomerIdentityVerified(customer)) {
    throw new ApiError(
      403,
      DOMAIN_ERROR_CODES.CLAIM_REQUIRES_VERIFIED_IDENTITY,
      'Claim authorization requires a server-verified customer identity',
      { customerId: customer.id, verificationStatus: customer.verificationStatus },
    );
  }
}

/** Guard: only the organization owner's Firebase UID may act as the org domain root. */
export function assertOrganizationOwner(
  org: Pick<Organization, 'id' | 'ownerUid'>,
  firebaseUid: string,
): void {
  if (org.ownerUid !== firebaseUid) {
    throw new ApiError(403, 'TENANT_MISMATCH', 'Firebase UID does not own this organization', {
      organizationId: org.id,
    });
  }
}

export { ID_PREFIXES };

/* ------------------------------------------------------------------ *
 * Persistence-backed loaders and link writers (server admin only)
 * ------------------------------------------------------------------ */

export async function findCustomersByFirebaseUid(
  organizationId: string,
  firebaseUid: string,
): Promise<Customer[]> {
  if (!adminDb) return [];
  const snap = await adminDb
    .collection('organizations')
    .doc(organizationId)
    .collection('customers')
    .where('organizationId', '==', organizationId)
    .where('firebaseUid', '==', firebaseUid)
    .limit(10)
    .get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as Customer);
}

export async function getCustomerInOrg(organizationId: string, customerId: string): Promise<Customer> {
  if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
  const snap = await adminDb
    .collection('organizations')
    .doc(organizationId)
    .collection('customers')
    .doc(customerId)
    .get();
  if (!snap.exists) {
    throw new ApiError(404, DOMAIN_ERROR_CODES.RELATED_RESOURCE_NOT_FOUND, `Customer not found: ${customerId}`, {
      customerId,
      organizationId,
    });
  }
  return { id: snap.id, ...snap.data() } as Customer;
}

export async function getVaultInOrg(organizationId: string, vaultId: string): Promise<Vault> {
  if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
  const snap = await adminDb
    .collection('organizations')
    .doc(organizationId)
    .collection('vaults')
    .doc(vaultId)
    .get();
  if (!snap.exists) {
    throw new ApiError(404, DOMAIN_ERROR_CODES.RELATED_RESOURCE_NOT_FOUND, `Vault not found: ${vaultId}`, {
      vaultId,
      organizationId,
    });
  }
  return { id: snap.id, ...snap.data() } as Vault;
}

export async function getLegacyPlanInOrg(organizationId: string, planId: string): Promise<LegacyPlan> {
  if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
  const snap = await adminDb
    .collection('organizations')
    .doc(organizationId)
    .collection('legacyPlans')
    .doc(planId)
    .get();
  if (!snap.exists) {
    throw new ApiError(404, DOMAIN_ERROR_CODES.RELATED_RESOURCE_NOT_FOUND, `Legacy plan not found: ${planId}`, {
      planId,
      organizationId,
    });
  }
  return { id: snap.id, ...snap.data() } as LegacyPlan;
}

export type VaultCreationResult = { vault: Vault; created: boolean; customer: Customer };

function stripUndefined<T extends object>(row: T): Record<string, unknown> {
  const payload = { ...(row as Record<string, unknown>) };
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) delete payload[k];
  }
  return payload;
}
/**
 * Create the vault for a customer and wire the 1:1 link in both directions inside a
 * single transaction (vault.customerId ↔ customer.vaultId). Idempotent: repeating the
 * call for a customer that already has a vault returns the existing link untouched.
 */
export async function createVaultForCustomer(
  organizationId: string,
  customerId: string,
  input: VaultCreate = {},
): Promise<VaultCreationResult> {
  if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
  const db = adminDb;
  const customerRef = db.collection('organizations').doc(organizationId).collection('customers').doc(customerId);
  const vaults = db.collection('organizations').doc(organizationId).collection('vaults');
  const vaultId = createId('vault');

  return db.runTransaction(async (tx: any) => {
    const customerSnap = await tx.get(customerRef);
    if (!customerSnap.exists) {
      throw new ApiError(404, DOMAIN_ERROR_CODES.RELATED_RESOURCE_NOT_FOUND, `Customer not found: ${customerId}`, {
        customerId,
        organizationId,
      });
    }
    const customer = { id: customerSnap.id, ...customerSnap.data() } as Customer;
    if (customer.vaultId) {
      const existingSnap = await tx.get(vaults.doc(customer.vaultId));
      if (existingSnap.exists) {
        return {
          vault: { id: existingSnap.id, ...existingSnap.data() } as Vault,
          created: false,
          customer,
        };
      }
      throw new ApiError(
        409,
        DOMAIN_ERROR_CODES.RELATIONSHIP_CONFLICT,
        `Customer ${customerId} references a missing vault (${customer.vaultId})`,
        { customerId, vaultId: customer.vaultId },
      );
    }
    const now = nowStamp();
    const vault: Vault = {
      id: vaultId,
      organizationId,
      customerId,
      ownerUid: customer.firebaseUid ?? null,
      name: input.name,
      status: VaultStatus.ACTIVE,
      intervalDays: input.intervalDays ?? 30,
      createdAt: now,
      updatedAt: now,
    };
    tx.set(vaults.doc(vaultId), stripUndefined(vault));
    tx.update(customerRef, { vaultId, updatedAt: FieldValue ? FieldValue.serverTimestamp() : now });
    return { vault, created: true, customer: { ...customer, vaultId, updatedAt: now } };
  });
}

/**
 * Link an already-created vault to its customer in both directions. Fails loudly on
 * conflicts instead of silently repointing an existing relationship.
 */
export async function linkVaultToCustomer(
  organizationId: string,
  customerId: string,
  vaultId: string,
): Promise<{ vault: Vault; customer: Customer }> {
  if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
  const db = adminDb;
  const customerRef = db.collection('organizations').doc(organizationId).collection('customers').doc(customerId);
  const vaultRef = db.collection('organizations').doc(organizationId).collection('vaults').doc(vaultId);

  return db.runTransaction(async (tx: any) => {
    const [customerSnap, vaultSnap] = await Promise.all([tx.get(customerRef), tx.get(vaultRef)]);
    if (!customerSnap.exists) {
      throw new ApiError(404, DOMAIN_ERROR_CODES.RELATED_RESOURCE_NOT_FOUND, `Customer not found: ${customerId}`, { customerId });
    }
    if (!vaultSnap.exists) {
      throw new ApiError(404, DOMAIN_ERROR_CODES.RELATED_RESOURCE_NOT_FOUND, `Vault not found: ${vaultId}`, { vaultId });
    }
    const customer = { id: customerSnap.id, ...customerSnap.data() } as Customer;
    const vault = { id: vaultSnap.id, ...vaultSnap.data() } as Vault;
    assertVaultBelongsToCustomer(vault, customer);
    if (customer.vaultId === vaultId) return { vault, customer };
    if (customer.vaultId && customer.vaultId !== vaultId) {
      throw new ApiError(
        409,
        DOMAIN_ERROR_CODES.DUPLICATE_VAULT,
        'Customer already has a different vault linked; unlink before relinking',
        { customerId, existingVaultId: customer.vaultId, vaultId },
      );
    }
    const now = nowStamp();
    tx.update(customerRef, { vaultId, updatedAt: FieldValue ? FieldValue.serverTimestamp() : now });
    return { vault, customer: { ...customer, vaultId, updatedAt: now } };
  });
}

/** Server-owned verification movement. `actor: 'client'` may only start/restart a flow. */
export async function setCustomerVerificationStatus(
  organizationId: string,
  customerId: string,
  to: IdentityVerificationStatus,
  opts: { actor?: 'client' | 'server'; reason?: string } = {},
): Promise<Customer> {
  if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
  const actor = opts.actor ?? 'server';
  const ref = adminDb
    .collection('organizations')
    .doc(organizationId)
    .collection('customers')
    .doc(customerId);
  return adminDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new ApiError(404, DOMAIN_ERROR_CODES.RELATED_RESOURCE_NOT_FOUND, `Customer not found: ${customerId}`, { customerId });
    }
    const customer = { id: snap.id, ...snap.data() } as Customer;
    const from = (customer.verificationStatus ?? IdentityVerificationStatus.NOT_STARTED) as IdentityVerificationStatus;
    assertVerificationTransitionAllowedByActor(from, to, actor);
    const now = nowStamp();
    tx.update(ref, {
      verificationStatus: to,
      updatedAt: FieldValue ? FieldValue.serverTimestamp() : now,
    });
    return { ...customer, verificationStatus: to, updatedAt: now };
  });
}

/* ------------------------------------------------------------------ *
 * Identity Verification Provider Integration (Phase 2)
 * ------------------------------------------------------------------ */

export interface StartIdentityVerificationResult {
  verificationId: string;
  status: IdentityVerificationStatus;
  provider: string;
}

export async function startIdentityVerification(
  organizationId: string,
  customerId: string,
  provider: MockIdentityProvider = getMockIdentityProvider()
): Promise<StartIdentityVerificationResult> {
  if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');

  const customer = await getCustomerInOrg(organizationId, customerId);
  if (!customer.firebaseUid) {
    throw new ApiError(400, DOMAIN_ERROR_CODES.RELATIONSHIP_REQUIRED, 'Customer has no firebaseUid linked', { customerId });
  }

  const currentStatus = customer.verificationStatus ?? IdentityVerificationStatus.NOT_STARTED;
  if (currentStatus === IdentityVerificationStatus.VERIFIED) {
    throw new ApiError(409, 'ALREADY_VERIFIED', 'Customer is already verified', { customerId });
  }

  if (currentStatus === IdentityVerificationStatus.PENDING) {
    throw new ApiError(409, 'VERIFICATION_IN_PROGRESS', 'Verification already in progress', { customerId });
  }

  const result = await provider.startVerification({
    organizationId,
    customerId,
    firebaseUid: customer.firebaseUid,
    email: customer.email,
    fullName: customer.fullName,
    phone: customer.phone,
  });

  await setCustomerVerificationStatus(organizationId, customerId, IdentityVerificationStatus.PENDING, {
    actor: 'server',
    reason: `provider:${provider.name}:${result.verificationId}`,
  });

  return {
    verificationId: result.verificationId,
    status: IdentityVerificationStatus.PENDING,
    provider: provider.name,
  };
}

export async function completeIdentityVerificationFromProvider(
  organizationId: string,
  customerId: string,
  verificationId: string,
  provider: MockIdentityProvider = getMockIdentityProvider()
): Promise<Customer> {
  if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');

  const providerResult = await provider.getVerificationStatus({
    organizationId,
    customerId,
    verificationId,
  });

  const allowedOutcomes: IdentityVerificationStatus[] = [
    IdentityVerificationStatus.VERIFIED,
    IdentityVerificationStatus.REJECTED,
    IdentityVerificationStatus.MANUAL_REVIEW,
  ];

  if (!allowedOutcomes.includes(providerResult.status)) {
    throw new ApiError(
      400,
      DOMAIN_ERROR_CODES.VERIFICATION_TRANSITION_ILLEGAL,
      `Provider returned incomplete status: ${providerResult.status}`,
      { verificationId, providerStatus: providerResult.status }
    );
  }

  return setCustomerVerificationStatus(organizationId, customerId, providerResult.status, {
    actor: 'server',
    reason: `provider:${provider.name}:${verificationId}:${providerResult.status}`,
  });
}

function nowStamp(): Date {
  return new Date();
}