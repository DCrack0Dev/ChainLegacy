import { IdentityVerificationStatus } from '@/types/enterprise';
import { ApiError } from '@/lib/api-errors';

const IVS = IdentityVerificationStatus;

export interface IdentityVerificationProvider {
  readonly name: string;
  startVerification(params: StartVerificationParams): Promise<VerificationResult>;
  getVerificationStatus(params: GetStatusParams): Promise<VerificationResult>;
}

export interface StartVerificationParams {
  organizationId: string;
  customerId: string;
  firebaseUid: string;
  email: string;
  fullName: string;
  phone?: string;
  metadata?: Record<string, unknown>;
}

export interface GetStatusParams {
  organizationId: string;
  customerId: string;
  verificationId: string;
}

export interface VerificationResult {
  verificationId: string;
  status: IdentityVerificationStatus;
  providerData?: Record<string, unknown>;
  completedAt?: Date;
  error?: string;
}

export const VERIFICATION_PROVIDER_ERROR_CODES = {
  VERIFICATION_ALREADY_IN_PROGRESS: 'VERIFICATION_ALREADY_IN_PROGRESS',
  VERIFICATION_NOT_FOUND: 'VERIFICATION_NOT_FOUND',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
} as const;

export class MockIdentityProvider implements IdentityVerificationProvider {
  readonly name = 'mock';

  private verifications = new Map<string, {
    status: IdentityVerificationStatus;
    params: StartVerificationParams;
    createdAt: Date;
    completedAt?: Date;
    providerData?: Record<string, unknown>;
  }>();

  async startVerification(params: StartVerificationParams): Promise<VerificationResult> {
    const existing = Array.from(this.verifications.values()).find(
      v => v.params.customerId === params.customerId && v.params.organizationId === params.organizationId
    );
    if (existing && (existing.status === IVS.PENDING || existing.status === IVS.NOT_STARTED)) {
      throw new ApiError(
        409,
        VERIFICATION_PROVIDER_ERROR_CODES.VERIFICATION_ALREADY_IN_PROGRESS,
        'Verification already in progress for this customer',
        { customerId: params.customerId }
      );
    }

    const verificationId = `ver_mock_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date();

    this.verifications.set(verificationId, {
      status: IVS.PENDING,
      params,
      createdAt: now,
      providerData: { provider: 'mock', autoApprove: true },
    });

    return {
      verificationId,
      status: IVS.PENDING,
      providerData: { provider: 'mock', autoApprove: true },
    };
  }

  async getVerificationStatus(params: GetStatusParams): Promise<VerificationResult> {
    const record = this.verifications.get(params.verificationId);
    if (!record) {
      throw new ApiError(
        404,
        VERIFICATION_PROVIDER_ERROR_CODES.VERIFICATION_NOT_FOUND,
        'Verification not found',
        { verificationId: params.verificationId }
      );
    }

    if (record.status === IVS.PENDING && record.providerData?.autoApprove) {
      record.status = IVS.VERIFIED;
      record.completedAt = new Date();
      record.providerData = { ...record.providerData, approvedAt: record.completedAt.toISOString() };
    }

    return {
      verificationId: params.verificationId,
      status: record.status,
      providerData: record.providerData,
      completedAt: record.completedAt,
    };
  }

  async simulateProviderOutcome(
    verificationId: string,
    outcome: IdentityVerificationStatus,
    reason?: string
  ): Promise<VerificationResult> {
    const record = this.verifications.get(verificationId);
    if (!record) {
      throw new ApiError(
        404,
        VERIFICATION_PROVIDER_ERROR_CODES.VERIFICATION_NOT_FOUND,
        'Verification not found',
        { verificationId }
      );
    }

    const allowedFromPending: IdentityVerificationStatus[] = [
      IVS.VERIFIED,
      IVS.REJECTED,
      IVS.MANUAL_REVIEW,
    ];

    if (record.status !== IVS.PENDING) {
      throw new ApiError(
        400,
        VERIFICATION_PROVIDER_ERROR_CODES.INVALID_TRANSITION,
        `Cannot transition from ${record.status} to ${outcome}: verification already completed`,
        { from: record.status, to: outcome }
      );
    }

    if (!allowedFromPending.includes(outcome)) {
      throw new ApiError(
        400,
        VERIFICATION_PROVIDER_ERROR_CODES.INVALID_TRANSITION,
        `Invalid outcome: ${outcome}`,
        { from: record.status, to: outcome }
      );
    }

    record.status = outcome;
    record.completedAt = new Date();
    record.providerData = { ...record.providerData, outcomeReason: reason };

    return {
      verificationId,
      status: record.status,
      providerData: record.providerData,
      completedAt: record.completedAt,
    };
  }

  clear(verificationId?: string): void {
    if (verificationId) {
      this.verifications.delete(verificationId);
    } else {
      this.verifications.clear();
    }
  }
}

let mockProviderInstance: MockIdentityProvider | null = null;

export function getMockIdentityProvider(): MockIdentityProvider {
  if (!mockProviderInstance) {
    mockProviderInstance = new MockIdentityProvider();
  }
  return mockProviderInstance;
}

export function resetMockIdentityProvider(): void {
  mockProviderInstance = new MockIdentityProvider();
}