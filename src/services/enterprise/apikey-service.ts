import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { ApiError } from '@/lib/api-errors';
import {
  ApiKey,
  ApiKeyCreate,
  ApiKeyEnv,
  ApiKeyScope,
  ApiScopes,
} from '@/types/enterprise';
import {
  createId,
  createApiKeyPrefix,
  createApiKeySecret,
  PersistenceBackend,
  FirestorePersistenceBackend,
  InMemoryPersistenceBackend,
} from '@/services/enterprise/persistence';

export const HMAC_ALGORITHM = 'sha256';
export const SALT_BYTES = 16;

export function generateApiKeySalt(): string {
  return randomBytes(SALT_BYTES).toString('hex');
}

export function hashSecretWithHmac(secret: string, salt: string): string {
  const combined = `${secret}${salt}`;
  return createHmac(HMAC_ALGORITHM, salt).update(combined).digest('hex');
}

export function verifySecretAgainstHash(secret: string, storedHashWithSalt: string): boolean {
  const colon = storedHashWithSalt.indexOf(':');
  if (colon === -1) return false;
  const salt = storedHashWithSalt.slice(0, colon);
  const storedHash = storedHashWithSalt.slice(colon + 1);
  if (salt.length === 0 || storedHash.length === 0) return false;
  const candidate = hashSecretWithHmac(secret, salt);
  try {
    return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}

export type ApiKeyWithSecret = {
  row: ApiKey;
  secret: string;
};

export type CreateApiKeyParams = Omit<ApiKeyCreate, 'scopes'> & {
  organizationId: string;
  scopes?: ApiKeyScope[];
  showOnceCallback?: (secret: string) => void;
};

export interface ApiKeyPersistence {
  create<T extends { id: string }>(orgId: string | null, sub: string | null, id: string, data: Omit<T, 'id'>): Promise<T>;
  get<T>(orgId: string | null, sub: string | null, id: string): Promise<T | null>;
  list<T>(orgId: string | null, sub: string | null, opts?: any): Promise<T[]>;
  update<T>(orgId: string | null, sub: string | null, id: string, patch: Partial<T>): Promise<T>;
  delete(orgId: string | null, sub: string | null, id: string): Promise<void>;
}

const SUB = 'apiKeys' as const;

export class EnterpriseApiKeyService {
  private persistence: ApiKeyPersistence;

  constructor(persistence?: ApiKeyPersistence) {
    this.persistence = (persistence as any) ?? new FirestorePersistenceBackend();
  }

  async createKey(params: CreateApiKeyParams): Promise<ApiKeyWithSecret> {
    const { organizationId, name, env, expiresAt, showOnceCallback } = params;
    const scopes: ApiKeyScope[] = params.scopes ?? [...ApiScopes];

    if (!name || name.trim().length === 0) {
      throw new ApiError(400, 'INVALID_KEY_NAME', 'API key name is required');
    }
    if (!Object.values(ApiKeyEnv).includes(env)) {
      throw new ApiError(400, 'INVALID_ENV', `Invalid API key environment: ${env}`);
    }

    const keyId = createId('apiKey', 6);
    const prefix = createApiKeyPrefix(env);
    const secretRaw = createApiKeySecret(env, keyId.replace('k_', ''), 32);

    const salt = generateApiKeySalt();
    const keyHash = hashSecretWithHmac(secretRaw, salt);
    const storedHash = `${salt}:${keyHash}`;

    const finalScopes: ApiKeyScope[] = scopes?.length
      ? scopes
      : ([...ApiScopes] as ApiKeyScope[]);

    const now = new Date();
    const expiresAtDate = expiresAt ? new Date(expiresAt) : undefined;

    const keyRow: Omit<ApiKey, 'id'> = {
      organizationId,
      name: name.trim(),
      env,
      prefix,
      keyHash: storedHash,
      scopes: finalScopes,
      expiresAt: expiresAtDate,
      disabled: false,
      createdAt: now,
    };

    const created = await this.persistence.create<ApiKey>(
      organizationId,
      SUB,
      keyId,
      keyRow,
    );

    params.showOnceCallback?.(secretRaw);

    return {
      row: created,
      secret: secretRaw,
    };
  }

  async getKey(organizationId: string, keyId: string): Promise<Omit<ApiKey, 'keyHash'> | null> {
    const k = await this.persistence.get<ApiKey>(organizationId, SUB, keyId);
    if (!k) return null;
    const { keyHash: _omit, ...safe } = k;
    return safe;
  }

  async getKeyRaw(organizationId: string, keyId: string): Promise<ApiKey | null> {
    return this.persistence.get<ApiKey>(organizationId, SUB, keyId);
  }

  async listKeys(organizationId: string, opts?: { includeDisabled?: boolean }): Promise<Omit<ApiKey, 'keyHash'>[]> {
    const all = await this.persistence.list<ApiKey>(organizationId, SUB, {});
    return all
      .filter(k => opts?.includeDisabled || !k.disabled)
      .map(({ keyHash: _omit, ...safe }) => safe);
  }

  async revokeKey(organizationId: string, keyId: string, reason?: string): Promise<Omit<ApiKey, 'keyHash'>> {
    const existing = await this.persistence.get<ApiKey>(organizationId, SUB, keyId);
    if (!existing) {
      throw new ApiError(404, 'API_KEY_NOT_FOUND', `API key not found: ${keyId}`);
    }
    if (existing.revokedAt) {
      throw new ApiError(400, 'KEY_ALREADY_REVOKED', `API key already revoked: ${keyId}`);
    }
    const now = new Date();
    const updated = await this.persistence.update<ApiKey>(organizationId, SUB, keyId, {
      revokedAt: now,
      disabled: true,
    } as Partial<ApiKey>);
    const { keyHash: _omit, ...safe } = updated;
    return safe;
  }

  async rotateKey(organizationId: string, keyId: string): Promise<{ newKey: ApiKeyWithSecret; previousRevoked: Omit<ApiKey, 'keyHash'> }> {
    const existing = await this.persistence.get<ApiKey>(organizationId, SUB, keyId);
    if (!existing) {
      throw new ApiError(404, 'API_KEY_NOT_FOUND', `API key not found: ${keyId}`);
    }
    if (existing.revokedAt) {
      throw new ApiError(400, 'KEY_ALREADY_REVOKED', `Cannot rotate revoked key: ${keyId}`);
    }

    const newKey = await this.createKey({
      organizationId,
      name: existing.name,
      env: existing.env,
      scopes: existing.scopes,
      expiresAt: existing.expiresAt,
    });

    const revoked = await this.revokeKey(organizationId, keyId, 'rotated');

    return {
      newKey,
      previousRevoked: revoked,
    };
  }

  async verifySecret(secret: string, rows: ApiKey[]): Promise<ApiKey | null> {
    if (!secret || typeof secret !== 'string') return null;
    const isSandbox = secret.startsWith('clsbox_');
    const isProd = secret.startsWith('clprod_');
    if (!isSandbox && !isProd) return null;

    const now = new Date();
    for (const r of rows) {
      if (isSandbox && r.env !== ApiKeyEnv.SANDBOX) continue;
      if (isProd && r.env !== ApiKeyEnv.PRODUCTION) continue;
      if (r.disabled) continue;
      if (r.revokedAt) continue;
      if (r.expiresAt && now > r.expiresAt) continue;
      if (verifySecretAgainstHash(secret, r.keyHash)) {
        return r;
      }
    }
    return null;
  }

  async findByIdAndVerify(organizationId: string, keyId: string, secret: string): Promise<ApiKey | null> {
    const row = await this.getKeyRaw(organizationId, keyId);
    if (!row) return null;
    if (row.organizationId !== organizationId) return null;
    if (row.disabled || row.revokedAt) return null;
    if (row.expiresAt && new Date() > row.expiresAt) return null;
    return verifySecretAgainstHash(secret, row.keyHash) ? row : null;
  }
}

export { FirestorePersistenceBackend as FirestoreApiKeyPersistence, InMemoryPersistenceBackend as InMemoryApiKeyPersistence };
export default EnterpriseApiKeyService;
