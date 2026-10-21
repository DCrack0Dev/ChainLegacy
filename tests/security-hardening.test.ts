import { describe, expect, it } from 'vitest';
import { errorMessage } from '@/lib/error-message';
import { createApiKeyPrefix, createApiKeySecret, createId } from '@/services/enterprise/persistence';

describe('security hardening helpers', () => {
  it('normalizes unknown thrown values without exposing assumptions', () => {
    expect(errorMessage(new Error('failed'))).toBe('failed');
    expect(errorMessage({ message: 'structured failure' })).toBe('structured failure');
    expect(errorMessage('string failure')).toBe('string failure');
    expect(errorMessage({ reason: 'not a message' })).toContain('Something went wrong');
  });

  it('creates correctly prefixed, non-predictable API key material', () => {
    const firstId = createId('apiKey');
    const secondId = createId('apiKey');
    expect(firstId).toMatch(/^k_[a-f0-9]{16}$/);
    expect(secondId).toMatch(/^k_[a-f0-9]{16}$/);
    expect(secondId).not.toBe(firstId);

    const secret = createApiKeySecret('production', firstId);
    expect(secret.startsWith(`${createApiKeyPrefix('production')}${firstId}.`)).toBe(true);
    expect(secret).not.toContain('Math.random');
  });
});
