import { randomBytes } from 'crypto';
import { adminAuth } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/api-errors';
import { EventService, SystemEvent } from '@/services/events';
import {
  Organization,
  OrganizationCreate,
  ApiKey,
  ApiKeyEnv,
  ApiKeyScope,
  ApiScopes,
  OrganizationStatus,
} from '@/types/enterprise';
import {
  createId,
  createApiKeyPrefix,
  createApiKeySecret,
  FirestorePersistenceBackend,
  InMemoryPersistenceBackend,
  PersistenceBackend,
} from '@/services/enterprise/persistence';
import { generateSigningSecret } from '@/services/enterprise/webhook';
import {
  hashSecretWithHmac,
  generateApiKeySalt,
  ApiKeyWithSecret,
} from '@/services/enterprise/apikey-service';

export interface AdminAuthBackend {
  setCustomUserClaims: (uid: string, claims: object) => Promise<void>;
  getUser: (uid: string) => Promise<{ uid: string; customClaims?: any } | null>;
}

export interface EventBackend {
  logEvent: (
    userId: string,
    event: SystemEvent,
    details: any,
    opts?: {
      organizationId?: string;
      actor?: { type: 'user' | 'api_key' | 'system' | 'cron' | 'guardian'; id: string; email?: string };
      requestId?: string;
      resource?: { type: string; id: string };
      result?: 'success' | 'failure' | 'skipped' | 'disputed';
    },
  ) => Promise<void>;
}

export type EnterpriseCustomClaims = {
  enterprise_owner?: string;
  enterprise_orgId?: string;
  enterprise_scopes?: ApiKeyScope[] | '*'[];
};

export type OnboardingResult = {
  org: Organization;
  defaultSandboxKey: ApiKeyWithSecret;
  showOnceWarning: true;
  showOnceSandboxKey: string;
};

export type OnboardOrgInput = OrganizationCreate & {
  ownerUid: string;
  requestId?: string;
};

const FirebaseAdminAuthBackend: AdminAuthBackend = {
  async setCustomUserClaims(uid: string, claims: object): Promise<void> {
    if (!adminAuth) {
      throw new ApiError(500, 'AUTH_UNAVAILABLE', 'Firebase admin auth not initialized');
    }
    await adminAuth.setCustomUserClaims(uid, claims);
  },
  async getUser(uid: string) {
    if (!adminAuth) return null;
    try {
      const u = await adminAuth.getUser(uid);
      return { uid: u.uid, customClaims: u.customClaims };
    } catch {
      return null;
    }
  },
};

const EventServiceBackend: EventBackend = {
  async logEvent(userId, event, details, opts) {
    await EventService.logEvent(userId, event, details, opts);
  },
};

export class EnterpriseOrgService {
  private persistence: PersistenceBackend;
  private auth: AdminAuthBackend;
  private events: EventBackend;

  constructor(opts?: {
    persistence?: PersistenceBackend;
    auth?: AdminAuthBackend;
    events?: EventBackend;
  }) {
    this.persistence = opts?.persistence ?? new FirestorePersistenceBackend();
    this.auth = opts?.auth ?? FirebaseAdminAuthBackend;
    this.events = opts?.events ?? EventServiceBackend;
  }

  async onboardOrganization(input: OnboardOrgInput): Promise<OnboardingResult> {
    const { name, country, ownerUid, requestId } = input;
    const slug = input.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (slug.length < 3) {
      throw new ApiError(400, 'INVALID_SLUG', 'Organization slug must be at least 3 alphanumeric characters');
    }
    if (!ownerUid || typeof ownerUid !== 'string') {
      throw new ApiError(400, 'INVALID_OWNER', 'Organization requires a valid owner UID');
    }

    const existingOrgs = await this.persistence.list<Organization>(null, null, {
      where: [['slug', '==', slug]],
      limit: 1,
    });
    if (existingOrgs.length > 0) {
      throw new ApiError(409, 'ORG_SLUG_CONFLICT', `Organization slug already taken: ${slug}`, { slug });
    }

    const orgId = createId('org');
    const now = new Date();
    const org: Organization = {
      id: orgId,
      name,
      slug,
      ownerUid,
      status: OrganizationStatus.ACTIVE,
      webhookSecret: generateSigningSecret(),
      country,
      createdAt: now,
      updatedAt: now,
    };

    await this.persistence.create<Organization>(null, null, orgId, {
      name: org.name,
      slug: org.slug,
      ownerUid: org.ownerUid,
      status: org.status,
      webhookSecret: org.webhookSecret,
      country: org.country,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    });

    const claims: EnterpriseCustomClaims = {
      enterprise_owner: ownerUid,
      enterprise_orgId: orgId,
      enterprise_scopes: ['*'],
    };
    try {
      await this.auth.setCustomUserClaims(ownerUid, claims);
    } catch (e: any) {
      await this.persistence.delete(null, null, orgId);
      throw new ApiError(500, 'AUTH_CLAIMS_FAILED', `Failed to set owner custom claims: ${e?.message ?? e}`);
    }

    const env = ApiKeyEnv.SANDBOX;
    const keyId = createId('apiKey', 6);
    const prefix = createApiKeyPrefix(env);
    const secret = createApiKeySecret(env, keyId.replace('k_', ''), 32);
    const salt = generateApiKeySalt();
    const keyHash = hashSecretWithHmac(secret, salt);

    const defaultApiKeyScopes: ApiKeyScope[] = [...ApiScopes] as ApiKeyScope[];

    const keyRow: Omit<ApiKey, 'id'> = {
      organizationId: orgId,
      name: 'Default Sandbox Key',
      env,
      prefix,
      keyHash: `${salt}:${keyHash}`,
      scopes: defaultApiKeyScopes,
      disabled: false,
      createdAt: now,
    };

    const persistedKey = await this.persistence.create<ApiKey>(
      orgId,
      'apiKeys',
      keyId,
      keyRow,
    );

    await this.events.logEvent(ownerUid, SystemEvent.ORG_CREATED, {
      orgId,
      slug,
      name,
      defaultKeyId: keyId,
    }, {
      organizationId: orgId,
      actor: { type: 'user', id: ownerUid },
      requestId,
      resource: { type: 'organization', id: orgId },
      result: 'success',
    });

    return {
      org,
      defaultSandboxKey: {
        row: persistedKey,
        secret,
      },
      showOnceWarning: true,
      showOnceSandboxKey: secret,
    };
  }

  async getOrgSlugUnique(slug: string): Promise<{ unique: boolean; conflictOrgId?: string }> {
    const normalized = slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    const matches = await this.persistence.list<Organization>(null, null, {
      where: [['slug', '==', normalized]],
      limit: 1,
    });
    if (matches.length === 0) return { unique: true };
    return { unique: false, conflictOrgId: matches[0].id };
  }

  async getOwnerClaims(uid: string): Promise<EnterpriseCustomClaims | null> {
    const user = await this.auth.getUser(uid);
    if (!user) return null;
    const cc = user.customClaims ?? {};
    return {
      enterprise_owner: cc.enterprise_owner,
      enterprise_orgId: cc.enterprise_orgId,
      enterprise_scopes: cc.enterprise_scopes,
    };
  }

  async getOrganization(orgId: string): Promise<Organization | null> {
    return this.persistence.get<Organization>(null, null, orgId);
  }

  async listMyOrganizations(ownerUid: string): Promise<Organization[]> {
    return this.persistence.list<Organization>(null, null, {
      where: [['ownerUid', '==', ownerUid]],
    });
  }
}

export { FirebaseAdminAuthBackend, EventServiceBackend };
export default EnterpriseOrgService;
