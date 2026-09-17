import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockIdentityProvider,
  getMockIdentityProvider,
  resetMockIdentityProvider,
} from '@/services/enterprise/identity-verification';
import { IdentityVerificationStatus } from '@/types/enterprise';
import { ApiError } from '@/lib/api-errors';

describe('MockIdentityProvider', () => {
  let provider: MockIdentityProvider;

  beforeEach(() => {
    resetMockIdentityProvider();
    provider = getMockIdentityProvider();
  });

  describe('startVerification', () => {
    it('creates a new verification in PENDING status', async () => {
      const result = await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      expect(result.verificationId).toMatch(/^ver_mock_/);
      expect(result.status).toBe(IdentityVerificationStatus.PENDING);
      expect(result.providerData?.provider).toBe('mock');
    });

    it('rejects duplicate verification for same customer', async () => {
      await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      await expect(provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      })).rejects.toMatchObject({
        statusCode: 409,
        code: 'VERIFICATION_ALREADY_IN_PROGRESS',
      });
    });

    it('allows verification for different customer', async () => {
      await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test1@example.com',
        fullName: 'Test User 1',
      });

      const result = await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_2',
        firebaseUid: 'firebase_uid_2',
        email: 'test2@example.com',
        fullName: 'Test User 2',
      });

      expect(result.status).toBe(IdentityVerificationStatus.PENDING);
    });
  });

  describe('getVerificationStatus', () => {
    it('auto-approves on first status check (mock behavior)', async () => {
      const startResult = await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      const status = await provider.getVerificationStatus({
        organizationId: 'org_1',
        customerId: 'cust_1',
        verificationId: startResult.verificationId,
      });

      expect(status.status).toBe(IdentityVerificationStatus.VERIFIED);
      expect(status.completedAt).toBeDefined();
      expect(status.providerData?.approvedAt).toBeDefined();
    });

    it('returns VERIFIED on subsequent calls', async () => {
      const startResult = await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      await provider.getVerificationStatus({
        organizationId: 'org_1',
        customerId: 'cust_1',
        verificationId: startResult.verificationId,
      });

      const status = await provider.getVerificationStatus({
        organizationId: 'org_1',
        customerId: 'cust_1',
        verificationId: startResult.verificationId,
      });

      expect(status.status).toBe(IdentityVerificationStatus.VERIFIED);
    });

    it('throws 404 for unknown verification', async () => {
      await expect(provider.getVerificationStatus({
        organizationId: 'org_1',
        customerId: 'cust_1',
        verificationId: 'ver_mock_unknown',
      })).rejects.toMatchObject({
        statusCode: 404,
        code: 'VERIFICATION_NOT_FOUND',
      });
    });
  });

  describe('simulateProviderOutcome', () => {
    it('allows server to simulate VERIFIED outcome', async () => {
      const startResult = await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      const result = await provider.simulateProviderOutcome(
        startResult.verificationId,
        IdentityVerificationStatus.VERIFIED,
        'manual approval'
      );

      expect(result.status).toBe(IdentityVerificationStatus.VERIFIED);
      expect(result.providerData?.outcomeReason).toBe('manual approval');
    });

    it('allows server to simulate REJECTED outcome', async () => {
      const startResult = await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      const result = await provider.simulateProviderOutcome(
        startResult.verificationId,
        IdentityVerificationStatus.REJECTED,
        'documents invalid'
      );

      expect(result.status).toBe(IdentityVerificationStatus.REJECTED);
    });

    it('allows server to simulate MANUAL_REVIEW outcome', async () => {
      const startResult = await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      const result = await provider.simulateProviderOutcome(
        startResult.verificationId,
        IdentityVerificationStatus.MANUAL_REVIEW,
        'requires human review'
      );

      expect(result.status).toBe(IdentityVerificationStatus.MANUAL_REVIEW);
    });

    it('rejects invalid outcome transition', async () => {
      const startResult = await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      // First complete to VERIFIED
      await provider.simulateProviderOutcome(
        startResult.verificationId,
        IdentityVerificationStatus.VERIFIED
      );

      // Try to transition from VERIFIED to REJECTED - should fail
      await expect(provider.simulateProviderOutcome(
        startResult.verificationId,
        IdentityVerificationStatus.REJECTED
      )).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_TRANSITION',
      });
    });

    it('throws 404 for unknown verification', async () => {
      await expect(provider.simulateProviderOutcome(
        'ver_mock_unknown',
        IdentityVerificationStatus.VERIFIED
      )).rejects.toMatchObject({
        statusCode: 404,
        code: 'VERIFICATION_NOT_FOUND',
      });
    });
  });

  describe('clear', () => {
    it('clears specific verification', async () => {
      const startResult = await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      provider.clear(startResult.verificationId);

      await expect(provider.getVerificationStatus({
        organizationId: 'org_1',
        customerId: 'cust_1',
        verificationId: startResult.verificationId,
      })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('clears all verifications', async () => {
      await provider.startVerification({
        organizationId: 'org_1',
        customerId: 'cust_1',
        firebaseUid: 'firebase_uid_1',
        email: 'test@example.com',
        fullName: 'Test User',
      });

      provider.clear();

      await expect(provider.getVerificationStatus({
        organizationId: 'org_1',
        customerId: 'cust_1',
        verificationId: 'ver_mock_any',
      })).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});