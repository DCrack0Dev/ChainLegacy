import { randomBytes } from 'crypto';
import { z } from 'zod';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/api-errors';
import {
  Organization,
  Customer,
  LegacyPlan,
  Beneficiary,
  Guardian,
  Claim,
  ApiKey,
  WebhookEndpoint,
  OrganizationCreate,
  CustomerCreate,
  LegacyPlanCreateSchema,
  BeneficiaryCreate,
  GuardianCreate,
  ClaimCreate,
  ApiKeyCreate,
  WebhookEndpointCreateSchema,
  ApiKeyEnv,
  OrganizationStatus,
  ClaimStatus,
} from '@/types/enterprise';
import { generateSigningSecret } from '@/services/enterprise/webhook';

export const ID_PREFIXES = {
  org: 'org_',
  customer: 'cust_',
  legacyPlan: 'plan_',
  beneficiary: 'ben_',
  guardian: 'guard_',
  claim: 'claim_',
  apiKey: 'k_',
  webhookEndpoint: 'whe_',
  livenessReset: 'lvr_',
  auditEvent: 'aud_',
  guardianNonce: 'gnonce_',
  rateLimitBucket: 'rlb_',
  idempotencyDoc: 'idem_',
  securityEvent: 'sec_',
  webhookDelivery: 'wdlv_',
  webhookDeadLetter: 'wdll_',
  webhookEvent: 'wev_',
} as const;

export type IdPrefixKind = keyof typeof ID_PREFIXES;

export function createId(kind: IdPrefixKind, bytes = 8): string {
  const prefix = ID_PREFIXES[kind];
  return prefix + randomBytes(bytes).toString('hex');
}

export function createApiKeyPrefix(env: ApiKeyEnv): string {
  return env === 'production' ? 'clprod_' : 'clsbox_';
}

export function createApiKeySecret(env: ApiKeyEnv, keyId: string, bytes = 32): string {
  const prefix = createApiKeyPrefix(env);
  return `${prefix}${keyId}.${randomBytes(bytes).toString('base64url')}`;
}

const ORG_COLLECTION = 'organizations';
const SUBCOLLECTIONS = {
  customers: 'customers',
  legacyPlans: 'legacyPlans',
  beneficiaries: 'beneficiaries',
  guardians: 'guardians',
  claims: 'claims',
  apiKeys: 'apiKeys',
  webhookEndpoints: 'webhookEndpoints',
  livenessResets: 'livenessResets',
  auditEvents: 'auditEvents',
  guardianNonces: 'guardianNonces',
  rateLimitBuckets: 'rateLimitBuckets',
  idempotencyDocs: 'idempotencyDocs',
  securityEvents: 'securityEvents',
  webhookDeliveries: 'webhookDeliveries',
  webhookDeadLetters: 'webhookDeadLetters',
  webhookEvents: 'webhookEvents',
} as const;

type SubcollectionName = typeof SUBCOLLECTIONS[keyof typeof SUBCOLLECTIONS];

function orgSubcollection(orgId: string, sub: SubcollectionName): string {
  return `${ORG_COLLECTION}/${orgId}/${sub}`;
}

export type FirestoreAdminDb = {
  collection: (path: string) => {
    doc: (id: string) => {
      get: () => Promise<{ exists: boolean; data: () => any | undefined; id: string }>;
      set: (data: any, opts?: { merge?: boolean }) => Promise<any>;
      update: (data: any) => Promise<any>;
      delete: () => Promise<any>;
    };
    add: (data: any) => Promise<{ id: string }>;
    where: (field: string, op: string, val: any) => any;
    orderBy: (field: string, dir?: string) => any;
    limit: (n: number) => any;
    startAfter: (doc: any) => any;
    get: () => Promise<{ docs: { id: string; data: () => any }[] }>;
  };
  runTransaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
};

export interface PersistenceBackend {
  db: FirestoreAdminDb | null;
  create<T extends { id: string }>(orgId: string | null, sub: SubcollectionName | null, id: string, data: Omit<T, 'id'>): Promise<T>;
  get<T>(orgId: string | null, sub: SubcollectionName | null, id: string): Promise<T | null>;
  list<T>(orgId: string | null, sub: SubcollectionName | null, opts?: { limit?: number; where?: [string, string, any][]; orderBy?: [string, 'asc' | 'desc'] }): Promise<T[]>;
  update<T>(orgId: string | null, sub: SubcollectionName | null, id: string, patch: Partial<T>): Promise<T>;
  delete(orgId: string | null, sub: SubcollectionName | null, id: string): Promise<void>;
}

export class FirestorePersistenceBackend implements PersistenceBackend {
  db: FirestoreAdminDb | null;

  constructor(dbOverride?: FirestoreAdminDb | null) {
    this.db = dbOverride !== undefined ? dbOverride : (adminDb as unknown as FirestoreAdminDb | null);
  }

  private docRef(orgId: string | null, sub: SubcollectionName | null, id: string) {
    if (!this.db) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
    const path = orgId && sub ? orgSubcollection(orgId, sub) : ORG_COLLECTION;
    return this.db.collection(path).doc(id);
  }

  private async requireDoc<T>(orgId: string | null, sub: SubcollectionName | null, id: string, label: string): Promise<T> {
    const doc = this.docRef(orgId, sub, id);
    const snap = await doc.get();
    if (!snap.exists) {
      throw new ApiError(404, `${label.toUpperCase()}_NOT_FOUND`, `${label} not found: ${id}`);
    }
    return { id: snap.id, ...snap.data() } as T;
  }

  async create<T extends { id: string }>(
    orgId: string | null,
    sub: SubcollectionName | null,
    id: string,
    data: Omit<T, 'id'>,
  ): Promise<T> {
    const ref = this.docRef(orgId, sub, id);
    const payload = { ...(data as any), id };
    await ref.set(payload);
    return payload as T;
  }

  async get<T>(orgId: string | null, sub: SubcollectionName | null, id: string): Promise<T | null> {
    const ref = this.docRef(orgId, sub, id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as T;
  }

  async list<T>(
    orgId: string | null,
    sub: SubcollectionName | null,
    opts?: { limit?: number; where?: [string, string, any][]; orderBy?: [string, 'asc' | 'desc'] },
  ): Promise<T[]> {
    if (!this.db) throw new ApiError(500, 'DB_UNAVAILABLE', 'Firestore admin DB not initialized');
    const path = orgId && sub ? orgSubcollection(orgId, sub) : ORG_COLLECTION;
    let q: any = this.db.collection(path);
    if (opts?.where) {
      for (const [field, op, val] of opts.where) {
        q = q.where(field, op, val);
      }
    }
    if (opts?.orderBy) {
      q = q.orderBy(opts.orderBy[0], opts.orderBy[1]);
    }
    if (opts?.limit) {
      q = q.limit(opts.limit);
    }
    const snap = await q.get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as T);
  }

  async update<T>(orgId: string | null, sub: SubcollectionName | null, id: string, patch: Partial<T>): Promise<T> {
    const ref = this.docRef(orgId, sub, id);
    const clean: any = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'id') continue;
      if (v === undefined) continue;
      clean[k] = v;
    }
    clean.updatedAt = clean.updatedAt ?? (FieldValue ? FieldValue.serverTimestamp() : new Date());
    await ref.update(clean);
    return this.requireDoc<T>(orgId, sub, id, 'resource');
  }

  async delete(orgId: string | null, sub: SubcollectionName | null, id: string): Promise<void> {
    const ref = this.docRef(orgId, sub, id);
    await ref.delete();
  }

  async createOrg(input: OrganizationCreate & { ownerUid: string; existingSlugs?: Set<string> }): Promise<Organization> {
    const slug = input.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (input.existingSlugs?.has(slug)) {
      throw new ApiError(409, 'ORG_SLUG_CONFLICT', `Organization slug already taken: ${slug}`);
    }
    const id = createId('org');
    const now = new Date();
    const org: Organization = {
      id,
      name: input.name,
      slug,
      ownerUid: input.ownerUid,
      status: OrganizationStatus.ACTIVE,
      webhookSecret: generateSigningSecret(),
      country: input.country,
      createdAt: now,
      updatedAt: now,
    };
    return this.create<Organization>(null, null, id, {
      name: org.name,
      slug: org.slug,
      ownerUid: org.ownerUid,
      status: org.status,
      webhookSecret: org.webhookSecret,
      country: org.country,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    });
  }

  async getOrg(orgId: string): Promise<Organization | null> {
    return this.get<Organization>(null, null, orgId);
  }

  async listOrgs(opts?: { limit?: number }): Promise<Organization[]> {
    return this.list<Organization>(null, null, opts);
  }

  async deleteOrg(orgId: string): Promise<void> {
    return this.delete(null, null, orgId);
  }

  async createCustomer(orgId: string, data: CustomerCreate): Promise<Customer> {
    const id = createId('customer');
    const now = new Date();
    const payload: Omit<Customer, 'id'> = {
      organizationId: orgId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    return this.create<Customer>(orgId, SUBCOLLECTIONS.customers, id, payload);
  }

  async getCustomer(orgId: string, id: string): Promise<Customer | null> {
    return this.get<Customer>(orgId, SUBCOLLECTIONS.customers, id);
  }

  async listCustomers(orgId: string, opts?: { limit?: number }): Promise<Customer[]> {
    return this.list<Customer>(orgId, SUBCOLLECTIONS.customers, opts);
  }

  async deleteCustomer(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.customers, id);
  }

  async createLegacyPlan(orgId: string, data: z.input<typeof LegacyPlanCreateSchema>): Promise<LegacyPlan> {
    const id = createId('legacyPlan');
    const now = new Date();
    const payload: Omit<LegacyPlan, 'id'> = {
      organizationId: orgId,
      intervalDays: data.intervalDays ?? 30,
      guardianQuorum: data.guardianQuorum ?? 0,
      walletSignatureRequired: data.walletSignatureRequired ?? false,
      ...data,
      status: 'draft',
      suspicionScore: 0,
      createdAt: now,
      updatedAt: now,
    };
    return this.create<LegacyPlan>(orgId, SUBCOLLECTIONS.legacyPlans, id, payload);
  }

  async getLegacyPlan(orgId: string, id: string): Promise<LegacyPlan | null> {
    return this.get<LegacyPlan>(orgId, SUBCOLLECTIONS.legacyPlans, id);
  }

  async listLegacyPlans(orgId: string, opts?: { limit?: number }): Promise<LegacyPlan[]> {
    return this.list<LegacyPlan>(orgId, SUBCOLLECTIONS.legacyPlans, opts);
  }

  async deleteLegacyPlan(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.legacyPlans, id);
  }

  async createBeneficiary(orgId: string, data: BeneficiaryCreate): Promise<Beneficiary> {
    const id = createId('beneficiary');
    const now = new Date();
    const payload: Omit<Beneficiary, 'id'> = {
      organizationId: orgId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    return this.create<Beneficiary>(orgId, SUBCOLLECTIONS.beneficiaries, id, payload);
  }

  async getBeneficiary(orgId: string, id: string): Promise<Beneficiary | null> {
    return this.get<Beneficiary>(orgId, SUBCOLLECTIONS.beneficiaries, id);
  }

  async listBeneficiaries(orgId: string, opts?: { limit?: number }): Promise<Beneficiary[]> {
    return this.list<Beneficiary>(orgId, SUBCOLLECTIONS.beneficiaries, opts);
  }

  async deleteBeneficiary(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.beneficiaries, id);
  }

  async createGuardian(orgId: string, data: GuardianCreate): Promise<Guardian> {
    const id = createId('guardian');
    const now = new Date();
    const payload: Omit<Guardian, 'id'> = {
      organizationId: orgId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    return this.create<Guardian>(orgId, SUBCOLLECTIONS.guardians, id, payload);
  }

  async getGuardian(orgId: string, id: string): Promise<Guardian | null> {
    return this.get<Guardian>(orgId, SUBCOLLECTIONS.guardians, id);
  }

  async listGuardians(orgId: string, opts?: { limit?: number }): Promise<Guardian[]> {
    return this.list<Guardian>(orgId, SUBCOLLECTIONS.guardians, opts);
  }

  async deleteGuardian(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.guardians, id);
  }

  async createClaim(orgId: string, data: ClaimCreate & { initiator: string }): Promise<Claim> {
    const id = createId('claim');
    const now = new Date();
    const payload: Omit<Claim, 'id'> = {
      organizationId: orgId,
      ...data,
      status: ClaimStatus.PENDING,
      guardianApprovals: {},
      transitions: [],
      createdAt: now,
      updatedAt: now,
    };
    return this.create<Claim>(orgId, SUBCOLLECTIONS.claims, id, payload);
  }

  async getClaim(orgId: string, id: string): Promise<Claim | null> {
    return this.get<Claim>(orgId, SUBCOLLECTIONS.claims, id);
  }

  async listClaims(orgId: string, opts?: { limit?: number; orderBy?: [string, 'asc' | 'desc'] }): Promise<Claim[]> {
    return this.list<Claim>(orgId, SUBCOLLECTIONS.claims, opts);
  }

  async deleteClaim(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.claims, id);
  }

  async createApiKey(orgId: string, data: ApiKeyCreate & { keyHash: string; prefix: string }): Promise<ApiKey> {
    const id = createId('apiKey', 6);
    const now = new Date();
    const payload: Omit<ApiKey, 'id'> = {
      organizationId: orgId,
      ...data,
      disabled: false,
      createdAt: now,
    };
    return this.create<ApiKey>(orgId, SUBCOLLECTIONS.apiKeys, id, payload);
  }

  async getApiKey(orgId: string, id: string): Promise<ApiKey | null> {
    return this.get<ApiKey>(orgId, SUBCOLLECTIONS.apiKeys, id);
  }

  async listApiKeys(orgId: string, opts?: { limit?: number }): Promise<ApiKey[]> {
    return this.list<ApiKey>(orgId, SUBCOLLECTIONS.apiKeys, opts);
  }

  async deleteApiKey(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.apiKeys, id);
  }

  async createWebhookEndpoint(orgId: string, data: z.input<typeof WebhookEndpointCreateSchema> & { secret: string }): Promise<WebhookEndpoint> {
    const id = createId('webhookEndpoint');
    const now = new Date();
    const payload: Omit<WebhookEndpoint, 'id'> = {
      organizationId: orgId,
      ...data,
      signingAlgo: 'HMAC-SHA256',
      enabled: true,
      consecutiveFailures: 0,
      createdAt: now,
    };
    return this.create<WebhookEndpoint>(orgId, SUBCOLLECTIONS.webhookEndpoints, id, payload);
  }

  async getWebhookEndpoint(orgId: string, id: string): Promise<WebhookEndpoint | null> {
    return this.get<WebhookEndpoint>(orgId, SUBCOLLECTIONS.webhookEndpoints, id);
  }

  async listWebhookEndpoints(orgId: string, opts?: { limit?: number }): Promise<WebhookEndpoint[]> {
    return this.list<WebhookEndpoint>(orgId, SUBCOLLECTIONS.webhookEndpoints, opts);
  }

  async deleteWebhookEndpoint(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.webhookEndpoints, id);
  }

  async createLivenessReset(orgId: string, data: { customerId: string; legacyPlanId: string; reason?: string; actor: string }): Promise<{ id: string; organizationId: string; customerId: string; legacyPlanId: string; reason?: string; actor: string; createdAt: Date }> {
    const id = createId('livenessReset');
    const now = new Date();
    const payload = {
      organizationId: orgId,
      customerId: data.customerId,
      legacyPlanId: data.legacyPlanId,
      reason: data.reason,
      actor: data.actor,
      createdAt: now,
    };
    return this.create(orgId, SUBCOLLECTIONS.livenessResets, id, payload);
  }

  async getLivenessReset(orgId: string, id: string) {
    return this.get(orgId, SUBCOLLECTIONS.livenessResets, id);
  }

  async listLivenessResets(orgId: string, opts?: { limit?: number }) {
    return this.list(orgId, SUBCOLLECTIONS.livenessResets, opts);
  }

  async deleteLivenessReset(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.livenessResets, id);
  }

  async createAuditEvent(orgId: string, data: { event: string; actor?: { type: string; id: string }; resource?: { type: string; id: string }; details?: any; result?: string }): Promise<{ id: string; organizationId: string; event: string; actor?: any; resource?: any; details?: any; result?: string; createdAt: Date }> {
    const id = createId('auditEvent');
    const now = new Date();
    const payload = {
      organizationId: orgId,
      event: data.event,
      actor: data.actor,
      resource: data.resource,
      details: data.details,
      result: data.result,
      createdAt: now,
    };
    return this.create(orgId, SUBCOLLECTIONS.auditEvents, id, payload);
  }

  async getAuditEvent(orgId: string, id: string) {
    return this.get(orgId, SUBCOLLECTIONS.auditEvents, id);
  }

  async listAuditEvents(orgId: string, opts?: { limit?: number; orderBy?: [string, 'asc' | 'desc'] }) {
    return this.list(orgId, SUBCOLLECTIONS.auditEvents, opts);
  }

  async deleteAuditEvent(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.auditEvents, id);
  }

  async createGuardianNonce(orgId: string, data: { guardianId: string; claimId: string; nonce: string; scheme: string; expiresAt: Date }): Promise<{ id: string; organizationId: string; guardianId: string; claimId: string; nonce: string; scheme: string; expiresAt: Date; createdAt: Date }> {
    const id = createId('guardianNonce');
    const now = new Date();
    const payload = {
      organizationId: orgId,
      guardianId: data.guardianId,
      claimId: data.claimId,
      nonce: data.nonce,
      scheme: data.scheme,
      expiresAt: data.expiresAt,
      createdAt: now,
    };
    return this.create(orgId, SUBCOLLECTIONS.guardianNonces, id, payload);
  }

  async getGuardianNonce(orgId: string, id: string) {
    return this.get(orgId, SUBCOLLECTIONS.guardianNonces, id);
  }

  async listGuardianNonces(orgId: string, opts?: { limit?: number }) {
    return this.list(orgId, SUBCOLLECTIONS.guardianNonces, opts);
  }

  async deleteGuardianNonce(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.guardianNonces, id);
  }

  async createRateLimitBucket(orgId: string, data: { bucketKey: string; shardKey: string; value?: number; ttlSec?: number }): Promise<{ id: string; organizationId: string; bucketKey: string; shardKey: string; value: number; expireAt: Date; createdAt: Date }> {
    const id = createId('rateLimitBucket');
    const now = new Date();
    const ttlMs = (data.ttlSec ?? 61) * 1000;
    const payload = {
      organizationId: orgId,
      bucketKey: data.bucketKey,
      shardKey: data.shardKey,
      value: data.value ?? 1,
      expireAt: new Date(now.getTime() + ttlMs),
      createdAt: now,
    };
    return this.create(orgId, SUBCOLLECTIONS.rateLimitBuckets, id, payload);
  }

  async getRateLimitBucket(orgId: string, id: string) {
    return this.get(orgId, SUBCOLLECTIONS.rateLimitBuckets, id);
  }

  async listRateLimitBuckets(orgId: string, opts?: { limit?: number }) {
    return this.list(orgId, SUBCOLLECTIONS.rateLimitBuckets, opts);
  }

  async deleteRateLimitBucket(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.rateLimitBuckets, id);
  }

  async createIdempotencyDoc(orgId: string, data: { idempotencyKey: string; status: 'LOCK' | 'DONE' | 'ERROR'; expiresAt: Date; response?: any; requestId?: string; lastError?: any }): Promise<{ id: string; organizationId: string; idempotencyKey: string; status: string; createdAt: Date; expiresAt: Date; response?: any; requestId?: string; lastError?: any }> {
    const id = createId('idempotencyDoc');
    const now = new Date();
    const payload = {
      organizationId: orgId,
      idempotencyKey: data.idempotencyKey,
      status: data.status,
      createdAt: now,
      expiresAt: data.expiresAt,
      response: data.response,
      requestId: data.requestId,
      lastError: data.lastError,
    };
    return this.create(orgId, SUBCOLLECTIONS.idempotencyDocs, id, payload);
  }

  async getIdempotencyDoc(orgId: string, id: string) {
    return this.get(orgId, SUBCOLLECTIONS.idempotencyDocs, id);
  }

  async listIdempotencyDocs(orgId: string, opts?: { limit?: number }) {
    return this.list(orgId, SUBCOLLECTIONS.idempotencyDocs, opts);
  }

  async deleteIdempotencyDoc(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.idempotencyDocs, id);
  }

  async createSecurityEvent(orgId: string, data: { severity: 'info' | 'warning' | 'critical'; event: string; actor?: { type: string; id: string }; details?: any; sourceIp?: string }): Promise<{ id: string; organizationId: string; severity: string; event: string; actor?: any; details?: any; sourceIp?: string; createdAt: Date }> {
    const id = createId('securityEvent');
    const now = new Date();
    const payload = {
      organizationId: orgId,
      severity: data.severity,
      event: data.event,
      actor: data.actor,
      details: data.details,
      sourceIp: data.sourceIp,
      createdAt: now,
    };
    return this.create(orgId, SUBCOLLECTIONS.securityEvents, id, payload);
  }

  async getSecurityEvent(orgId: string, id: string) {
    return this.get(orgId, SUBCOLLECTIONS.securityEvents, id);
  }

  async listSecurityEvents(orgId: string, opts?: { limit?: number; orderBy?: [string, 'asc' | 'desc'] }) {
    return this.list(orgId, SUBCOLLECTIONS.securityEvents, opts);
  }

  async deleteSecurityEvent(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.securityEvents, id);
  }

  async createWebhookDelivery(orgId: string, data: { endpointId: string; eventId: string; eventType: string; payload: string; signatureHeader?: string; attempt?: number; deliverAfter?: Date; scheduledAt?: Date }): Promise<{ id: string; organizationId: string; endpointId: string; eventId: string; eventType: string; payload: string; signatureHeader?: string; attempt: number; deliverAfter: Date; scheduledAt: Date; createdAt: Date; lastAttemptAt?: Date; httpStatus?: number; lastError?: string; deliveredAt?: Date }> {
    const id = createId('webhookDelivery');
    const now = new Date();
    const payload = {
      organizationId: orgId,
      endpointId: data.endpointId,
      eventId: data.eventId,
      eventType: data.eventType,
      payload: data.payload,
      signatureHeader: data.signatureHeader,
      attempt: data.attempt ?? 0,
      deliverAfter: data.deliverAfter ?? now,
      scheduledAt: data.scheduledAt ?? now,
      createdAt: now,
    };
    return this.create(orgId, SUBCOLLECTIONS.webhookDeliveries, id, payload);
  }

  async getWebhookDelivery(orgId: string, id: string) {
    return this.get(orgId, SUBCOLLECTIONS.webhookDeliveries, id);
  }

  async listWebhookDeliveries(orgId: string, opts?: { limit?: number }) {
    return this.list(orgId, SUBCOLLECTIONS.webhookDeliveries, opts);
  }

  async deleteWebhookDelivery(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.webhookDeliveries, id);
  }

  async createWebhookDeadLetter(orgId: string, data: { deliveryId: string; endpointId: string; eventId: string; eventType: string; payload: string; reason: string; lastError?: string }): Promise<{ id: string; organizationId: string; deliveryId: string; endpointId: string; eventId: string; eventType: string; payload: string; reason: string; lastError?: string; createdAt: Date }> {
    const id = createId('webhookDeadLetter');
    const now = new Date();
    const payload = {
      organizationId: orgId,
      deliveryId: data.deliveryId,
      endpointId: data.endpointId,
      eventId: data.eventId,
      eventType: data.eventType,
      payload: data.payload,
      reason: data.reason,
      lastError: data.lastError,
      createdAt: now,
    };
    return this.create(orgId, SUBCOLLECTIONS.webhookDeadLetters, id, payload);
  }

  async getWebhookDeadLetter(orgId: string, id: string) {
    return this.get(orgId, SUBCOLLECTIONS.webhookDeadLetters, id);
  }

  async listWebhookDeadLetters(orgId: string, opts?: { limit?: number }) {
    return this.list(orgId, SUBCOLLECTIONS.webhookDeadLetters, opts);
  }

  async deleteWebhookDeadLetter(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.webhookDeadLetters, id);
  }

  async createWebhookEvent(orgId: string, data: { type: string; data: any; actor?: string; requestId?: string; idempotencyKey?: string }): Promise<{ id: string; organizationId: string; type: string; data: any; actor?: string; requestId?: string; idempotencyKey?: string; createdAt: Date }> {
    const id = createId('webhookEvent');
    const now = new Date();
    const payload = {
      organizationId: orgId,
      type: data.type,
      data: data.data,
      actor: data.actor,
      requestId: data.requestId,
      idempotencyKey: data.idempotencyKey,
      createdAt: now,
    };
    return this.create(orgId, SUBCOLLECTIONS.webhookEvents, id, payload);
  }

  async getWebhookEvent(orgId: string, id: string) {
    return this.get(orgId, SUBCOLLECTIONS.webhookEvents, id);
  }

  async listWebhookEvents(orgId: string, opts?: { limit?: number; orderBy?: [string, 'asc' | 'desc'] }) {
    return this.list(orgId, SUBCOLLECTIONS.webhookEvents, opts);
  }

  async deleteWebhookEvent(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, SUBCOLLECTIONS.webhookEvents, id);
  }
}

export default FirestorePersistenceBackend;

export class InMemoryPersistenceBackend implements PersistenceBackend {
  db: FirestoreAdminDb | null = null;
  private store = new Map<string, Map<string, any>>();

  private bucketKey(orgId: string | null, sub: SubcollectionName | null): string {
    return orgId && sub ? `${ORG_COLLECTION}/${orgId}/${sub}` : ORG_COLLECTION;
  }

  private getBucket(key: string): Map<string, any> {
    if (!this.store.has(key)) this.store.set(key, new Map());
    return this.store.get(key)!;
  }

  async create<T extends { id: string }>(orgId: string | null, sub: SubcollectionName | null, id: string, data: Omit<T, 'id'>): Promise<T> {
    const bucket = this.getBucket(this.bucketKey(orgId, sub));
    if (bucket.has(id)) {
      throw new ApiError(409, 'DUPLICATE_ID', `Document already exists: ${id}`);
    }
    const payload = { ...(data as any), id };
    bucket.set(id, payload);
    return payload as T;
  }

  async get<T>(orgId: string | null, sub: SubcollectionName | null, id: string): Promise<T | null> {
    const bucket = this.getBucket(this.bucketKey(orgId, sub));
    return (bucket.get(id) ?? null) as T | null;
  }

  async list<T>(
    orgId: string | null,
    sub: SubcollectionName | null,
    opts?: { limit?: number; where?: [string, string, any][]; orderBy?: [string, 'asc' | 'desc'] },
  ): Promise<T[]> {
    const bucket = this.getBucket(this.bucketKey(orgId, sub));
    let items = Array.from(bucket.values());
    if (opts?.where) {
      for (const [field, op, val] of opts.where) {
        items = items.filter(doc => {
          const fv = doc[field];
          switch (op) {
            case '==': return fv === val;
            case '!=': return fv !== val;
            case '>': return fv > val;
            case '<': return fv < val;
            case '>=': return fv >= val;
            case '<=': return fv <= val;
            case 'in': return Array.isArray(val) && val.includes(fv);
            default: return true;
          }
        });
      }
    }
    if (opts?.orderBy) {
      const [field, dir] = opts.orderBy;
      items.sort((a, b) => {
        const av = a[field], bv = b[field];
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    if (opts?.limit !== undefined) {
      items = items.slice(0, opts.limit);
    }
    return items as T[];
  }

  async update<T>(orgId: string | null, sub: SubcollectionName | null, id: string, patch: Partial<T>): Promise<T> {
    const bucket = this.getBucket(this.bucketKey(orgId, sub));
    const existing = bucket.get(id);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', `Document not found: ${id}`);
    }
    const clean: any = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'id') continue;
      if (v === undefined) continue;
      clean[k] = v;
    }
    const updated = { ...existing, ...clean, id, updatedAt: new Date() };
    bucket.set(id, updated);
    return updated as T;
  }

  async delete(orgId: string | null, sub: SubcollectionName | null, id: string): Promise<void> {
    const bucket = this.getBucket(this.bucketKey(orgId, sub));
    bucket.delete(id);
  }
}
