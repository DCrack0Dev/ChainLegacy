import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import {
  ApiKey,
  ApiKeyCreate,
  ApiKeyEnv,
  ApiKeyScope,
  ApiScopes,
  Organization,
  OrganizationCreate,
} from '@/types/enterprise';

const SANDBOX_PREFIX = 'clsbox_';
const PROD_PREFIX = 'clprod_';

export function hashKeySecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
export function isKeyPrefix(s: string): boolean {
  return s.startsWith(SANDBOX_PREFIX) || s.startsWith(PROD_PREFIX);
}
export function hasScope(granted: readonly ApiKeyScope[], required: ApiKeyScope | '*'): boolean {
  if (granted.includes('*' as ApiKeyScope)) return true;
  if (required === '*') return granted.includes('*' as ApiKeyScope);
  return granted.includes(required);
}
export function generateSigningSecret(bytes = 32): string {
  return 'whsec_' + randomBytes(bytes).toString('hex');
}
function apiKeyPrefix(env: ApiKeyEnv): string {
  return env === 'production' ? PROD_PREFIX : SANDBOX_PREFIX;
}

type ApiKeyRow = Omit<ApiKey, 'keyHash'> & { keyHash: string };

export const ApiKeyService = {
  create(params: ApiKeyCreate & { organizationId: string; existingIds?: Set<string> }): { row: ApiKeyRow; secret: string } {
    const prefix = apiKeyPrefix(params.env);
    const id = 'k_' + randomBytes(6).toString('base64url');
    if (params.existingIds?.has(id)) {
      throw new Error('KEY_ID_CONFLICT');
    }
    const secret = prefix + id + '.' + randomBytes(24).toString('base64url');
    const keyHash = hashKeySecret(secret);
    const scopes = params.scopes?.length ? params.scopes : [...ApiScopes] as ApiKeyScope[];
    return {
      row: {
        id,
        organizationId: params.organizationId,
        name: params.name,
        env: params.env,
        prefix,
        keyHash,
        scopes: scopes as ApiKeyScope[],
        expiresAt: params.expiresAt ? new Date(params.expiresAt) : undefined,
        disabled: false,
        createdAt: new Date(),
      },
      secret,
    };
  },
  verify(secret: string, rows: ApiKeyRow[]): ApiKeyRow | null {
    if (!isKeyPrefix(secret)) return null;
    const h = hashKeySecret(secret);
    const b = Buffer.from(h, 'hex');
    for (const r of rows) {
      if (r.prefix && !secret.startsWith(r.prefix)) continue;
      try {
        if (timingSafeEqual(Buffer.from(r.keyHash, 'hex'), b)) {
          if (r.disabled) return null;
          if (r.revokedAt) return null;
          if (r.expiresAt && new Date() > r.expiresAt) return null;
          return r;
        }
      } catch {
        /* length mismatch */
      }
    }
    return null;
  },
  revoke(row: ApiKeyRow): ApiKeyRow {
    return { ...row, revokedAt: new Date(), disabled: true };
  },
  rotate(row: ApiKeyRow, rows: ApiKeyRow[]): { row: ApiKeyRow; secret: string; previousRevoked: ApiKeyRow } {
    const created = this.create({
      organizationId: row.organizationId,
      name: row.name,
      env: row.env,
      scopes: row.scopes,
      expiresAt: row.expiresAt,
      existingIds: rows?.reduce<Set<string>>((acc, r) => acc.add(r.id), new Set([row.id])),
    });
    return { row: created.row, secret: created.secret, previousRevoked: this.revoke(row) };
  },
  listByOrg(rows: ApiKeyRow[], organizationId: string): Omit<ApiKeyRow, 'keyHash'>[] {
    return rows.filter(r => r.organizationId === organizationId).map(({ keyHash, ...rest }) => rest);
  },
};

export const OrganizationService = {
  create(input: OrganizationCreate & { id?: string; ownerUid: string; existingSlugs?: Set<string> }): { organization: Organization; defaultSandboxKey: { row: ApiKeyRow; secret: string } } {
    const slug = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (input.existingSlugs?.has(slug)) throw new Error('ORG_SLUG_CONFLICT');
    const id = input.id ?? `org_${randomBytes(8).toString('hex')}`;
    const now = new Date();
    const organization: Organization = {
      id,
      name: input.name,
      slug,
      ownerUid: input.ownerUid,
      status: 'active',
      webhookSecret: generateSigningSecret(),
      country: input.country,
      createdAt: now,
      updatedAt: now,
    };
    const defaultSandboxKey = ApiKeyService.create({
      organizationId: id,
      name: 'Default Sandbox Key',
      env: ApiKeyEnv.SANDBOX,
      scopes: [...ApiScopes] as ApiKeyScope[],
    });
    return { organization, defaultSandboxKey };
  },
  rotateWebhookSecret(org: Organization): Organization {
    return { ...org, webhookSecret: generateSigningSecret(), updatedAt: new Date() };
  },
};
