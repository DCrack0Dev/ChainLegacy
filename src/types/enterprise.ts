import { z } from 'zod';

export const OrganizationStatus = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  TRIAL: 'trial',
} as const;
export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

export const ApiKeyEnv = {
  SANDBOX: 'sandbox',
  PRODUCTION: 'production',
} as const;
export type ApiKeyEnv = (typeof ApiKeyEnv)[keyof typeof ApiKeyEnv];

export const ClaimStatus = {
  PENDING: 'pending',
  VERIFICATION: 'verification',
  GUARDIAN_REVIEW: 'guardian_review',
  GRACE_PERIOD: 'grace_period',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISPUTED: 'disputed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;
export type ClaimStatus = (typeof ClaimStatus)[keyof typeof ClaimStatus];

export const WebhookEvent = {
  ORG_CREATED: 'organization.created',
  CUSTOMER_CREATED: 'customer.created',
  LEGACY_PLAN_CREATED: 'legacy_plan.created',
  BENEFICIARY_ADDED: 'beneficiary.added',
  GUARDIAN_UPDATED: 'guardian.updated',
  LIVENESS_RESET: 'liveness.reset',
  CLAIM_CREATED: 'claim.created',
  CLAIM_TRANSITION: 'claim.transition',
  CLAIM_GUARDIAN_APPROVAL: 'claim.guardian_approval',
  CLAIM_COMPLETED: 'claim.completed',
  CLAIM_REJECTED: 'claim.rejected',
  CLAIM_DISPUTED: 'claim.disputed',
  WEBHOOK_UPDATED: 'webhook.updated',
  API_KEY_CREATED: 'api_key.created',
  API_KEY_REVOKED: 'api_key.revoked',
  ANTI_TAKEOVER_TRIGGERED: 'anti_takeover.triggered',
  BILLING_CHARGE_ATTEMPTED: 'billing.charge_attempted',
  SYSTEM_LIVENESS_CRON: 'system.liveness_cron',
} as const;
export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent];

export const API_SCOPES = [
  'customers:read',
  'customers:write',
  'legacy_plans:read',
  'legacy_plans:write',
  'beneficiaries:read',
  'beneficiaries:write',
  'guardians:read',
  'guardians:write',
  'liveness:read',
  'liveness:write',
  'claims:read',
  'claims:manage',
  'billing:write',
  'audit:read',
  'webhooks:manage',
  'api_keys:read',
  'api_keys:write',
] as const;
export type ApiKeyScope = (typeof API_SCOPES)[number];
export const ApiScopes = API_SCOPES as unknown as ApiKeyScope[];

export const PaginationParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  nextCursor: z.string().optional(),
  status: z.string().optional(),
});
export type PaginationParams = z.input<typeof PaginationParamsSchema>;

export const CustomerSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  partnerCustomerId: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  walletAddress: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Customer = z.infer<typeof CustomerSchema>;
export const CustomerCreateSchema = CustomerSchema.omit({ id: true, organizationId: true, createdAt: true, updatedAt: true });
export type CustomerCreate = z.infer<typeof CustomerCreateSchema>;

export const BeneficiarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  customerId: z.string().min(1),
  legacyPlanId: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  walletAddress: z.string().optional(),
  share: z.number().min(0).max(100),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Beneficiary = z.infer<typeof BeneficiarySchema>;
export const BeneficiaryCreateSchema = BeneficiarySchema.omit({ id: true, organizationId: true, createdAt: true, updatedAt: true });
export type BeneficiaryCreate = z.infer<typeof BeneficiaryCreateSchema>;

export const GuardianSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  customerId: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  firebaseUid: z.string().optional(),
  walletAddress: z
    .string()
    .refine((v) => /^0x[a-fA-F0-9]{40}$/.test(v), { message: 'EVM address invalid' })
    .optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Guardian = z.infer<typeof GuardianSchema>;
export const GuardianCreateSchema = GuardianSchema.omit({ id: true, organizationId: true, createdAt: true, updatedAt: true }).refine(
  (g) => (typeof g.firebaseUid === 'string' && g.firebaseUid.length > 0) || (typeof g.walletAddress === 'string' && g.walletAddress.length > 0),
  { message: 'Guardian must provide a firebaseUid or walletAddress for identity proofs' },
);
export type GuardianCreate = z.infer<typeof GuardianCreateSchema>;

export const LegacyPlanSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  customerId: z.string().min(1),
  name: z.string().min(1),
  intervalDays: z.number().int().min(1).default(30),
  guardianQuorum: z.number().int().min(0).default(0),
  encryptionConfig: z.object({ algorithm: z.literal('AES-256-GCM'), kdf: z.string(), shamirThreshold: z.number().int().min(0), shamirShares: z.number().int().min(0) }),
  walletSignatureRequired: z.boolean().default(false),
  status: z.enum(['draft', 'active', 'warning', 'escalating', 'claim_in_progress', 'completed', 'cancelled']),
  lastCheckInAt: z.coerce.date().optional(),
  nextEscalationAt: z.coerce.date().optional(),
  suspicionScore: z.number().min(0).max(100).default(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type LegacyPlan = z.infer<typeof LegacyPlanSchema>;
export const LegacyPlanCreateSchema = LegacyPlanSchema.omit({ id: true, organizationId: true, status: true, lastCheckInAt: true, nextEscalationAt: true, suspicionScore: true, createdAt: true, updatedAt: true });

export const ClaimSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  customerId: z.string().min(1),
  legacyPlanId: z.string().min(1),
  status: z.nativeEnum(ClaimStatus).default(ClaimStatus.PENDING),
  initiator: z.string().min(1),
  reason: z.string().optional(),
  otpVerifiedAt: z.coerce.date().optional(),
  guardianApprovals: z.record(z.string(), z.boolean()),
  transitions: z.array(z.object({ from: z.string(), to: z.string(), at: z.coerce.date(), actor: z.string() })),
  disputeReason: z.string().optional(),
  completedAt: z.coerce.date().optional(),
  cancelledAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Claim = z.infer<typeof ClaimSchema>;
export const ClaimCreateSchema = ClaimSchema.omit({ id: true, organizationId: true, status: true, guardianApprovals: true, transitions: true, disputeReason: true, otpVerifiedAt: true, completedAt: true, cancelledAt: true, createdAt: true, updatedAt: true });
export type ClaimCreate = z.infer<typeof ClaimCreateSchema>;
export const ClaimTransitionSchema = z.object({
  claimId: z.string().min(1),
  to: z.nativeEnum(ClaimStatus),
  reason: z.string().optional(),
  guardianId: z.string().optional(),
  guardianApproved: z.boolean().optional(),
  guardianProof: z
    .object({
      scheme: z.enum(['eip712', 'eth_sign', 'firebase_uid_match']).default('firebase_uid_match'),
      nonce: z.string().min(1),
      signature: z.string().optional(),
      messageHash: z.string().optional(),
      signedAt: z.coerce.date().optional(),
    })
    .optional(),
});
export type ClaimTransition = z.infer<typeof ClaimTransitionSchema>;

export const OrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(3),
  ownerUid: z.string().min(1),
  status: z.nativeEnum(OrganizationStatus).default(OrganizationStatus.TRIAL),
  webhookSecret: z.string().optional(),
  country: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Organization = z.infer<typeof OrganizationSchema>;
export const OrganizationCreateSchema = OrganizationSchema.omit({ id: true, status: true, webhookSecret: true, createdAt: true, updatedAt: true });
export type OrganizationCreate = z.infer<typeof OrganizationCreateSchema>;

export const ApiKeySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1),
  env: z.nativeEnum(ApiKeyEnv),
  prefix: z.string().min(1),
  keyHash: z.string().min(1),
  scopes: z.array(z.enum(API_SCOPES)),
  expiresAt: z.coerce.date().optional(),
  lastUsedAt: z.coerce.date().optional(),
  revokedAt: z.coerce.date().optional(),
  disabled: z.boolean().default(false),
  createdAt: z.coerce.date(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;
export const ApiKeyCreateSchema = ApiKeySchema.omit({ id: true, organizationId: true, keyHash: true, prefix: true, revokedAt: true, lastUsedAt: true, disabled: true, createdAt: true });
export type ApiKeyCreate = z.infer<typeof ApiKeyCreateSchema>;

export const WebhookEndpointSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  url: z.string().url().refine((value) => {
    try {
      const u = new URL(value);
      const isHttps = u.protocol === 'https:';
      const isLocalHttp = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
      return isHttps || isLocalHttp;
    } catch {
      return false;
    }
  }, {
    message: 'Webhook URL must use HTTPS or localhost/127.0.0.1 HTTP for local testing only',
  }),
  description: z.string().optional(),
  events: z.array(z.string().min(1)),
  secret: z.string().min(1),
  signingAlgo: z.literal('HMAC-SHA256').default('HMAC-SHA256'),
  enabled: z.boolean().default(true),
  consecutiveFailures: z.number().int().min(0).default(0),
  disabledAt: z.coerce.date().optional(),
  lastDeliveredAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
});
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;
export const WebhookEndpointCreateSchema = WebhookEndpointSchema.omit({ id: true, organizationId: true, secret: true, signingAlgo: true, consecutiveFailures: true, disabledAt: true, lastDeliveredAt: true, createdAt: true });
