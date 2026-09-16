import { adminDb } from '@/lib/firebase-admin';

export enum SystemEvent {
  VAULT_CREATED = 'vault_created',
  VAULT_UPDATED = 'vault_updated',
  LIVENESS_TRANSITION = 'liveness_transition',
  SYSTEM_LIVENESS_CRON = 'system.liveness_cron',
  CLAIM_INITIATED = 'claim_initiated',
  CLAIM_CREATED = 'claim.created',
  CLAIM_TRANSITION = 'claim.transition',
  CLAIM_GUARDIAN_APPROVAL = 'claim.guardian_approval',
  CLAIM_APPROVED = 'claim_approved',
  CLAIM_COMPLETED = 'claim.completed',
  CLAIM_REJECTED = 'claim.rejected',
  DISPUTE_RAISED = 'dispute_raised',
  CLAIM_DISPUTED = 'claim.disputed',
  ANTI_TAKEOVER_TRIGGERED = 'anti_takeover.triggered',
  SUSPICION_ALERT = 'suspicion_alert',
  ORG_CREATED = 'organization.created',
  CUSTOMER_CREATED = 'customer.created',
  LEGACY_PLAN_CREATED = 'legacy_plan.created',
  BENEFICIARY_ADDED = 'beneficiary.added',
  GUARDIAN_UPDATED = 'guardian.updated',
  LIVENESS_RESET = 'liveness.reset',
  BILLING_CHARGE_ATTEMPTED = 'billing.charge_attempted',
  WEBHOOK_UPDATED = 'webhook.updated',
  API_KEY_CREATED = 'api_key.created',
  API_KEY_REVOKED = 'api_key.revoked',
  OTP_ISSUED = 'otp.issued',
  OTP_VERIFIED = 'otp.verified',
  OTP_INVALID = 'otp.invalid',
  OTP_EXPIRED = 'otp.expired',
}

export type LogEventOptions = {
  organizationId?: string;
  actor?: { type: 'user' | 'api_key' | 'system' | 'cron' | 'guardian'; id: string; email?: string };
  requestId?: string;
  resource?: { type: string; id: string };
  result?: 'success' | 'failure' | 'skipped' | 'disputed';
};

const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'seed',
  'seedPhrase',
  'seed_phrase',
  'privateKey',
  'private_key',
  'privkey',
  'mnemonic',
  'apiKey',
  'api_key',
  'apikey',
  'token',
  'encryptedSecret',
  'encryptedMessage',
  'otp',
  'serverShare',
  'shares',
  'credentialPublicKey',
  'webhookSecret',
  'webhook_secret',
  'signingSecret',
  'signing_secret',
];
const MAX_DEPTH = 8;
const REDACTED_LITERAL = '[REDACTED]';
const REDACTED_RECURSIVE = '[REDACTED_RECURSIVE]';

export function redact<T = any>(input: T, depth = 0): T {
  if (input === null || input === undefined) return input;
  if (depth > MAX_DEPTH) return REDACTED_RECURSIVE as unknown as T;
  if (Array.isArray(input)) {
    return input.map((v, i) => {
      // If array element index 0-n parent key was in sensitive keys, caller would have caught it already. Safe recurse.
      return redact(v, depth + 1);
    }) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input as Record<string, any>)) {
      const keyLower = k.toLowerCase();
      if (SENSITIVE_KEYS.some(s => keyLower.includes(s.toLowerCase()))) {
        out[k] = REDACTED_LITERAL;
        continue;
      }
      out[k] = redact(v, depth + 1);
    }
    return out as T;
  }
  return input;
}

export function safeEventId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return 'evt_' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
}

export class EventService {
  static async logEvent(userId: string, event: SystemEvent, details: any, opts?: LogEventOptions) {
    const redacted = redact(details);
    const id = safeEventId();
    const eventData = {
      id,
      userId,
      event,
      details: redacted,
      timestamp: new Date(),
      organizationId: opts?.organizationId,
      actor: opts?.actor,
      requestId: opts?.requestId,
      resource: opts?.resource,
      result: opts?.result,
    };
    try {
      if (adminDb) {
        await adminDb.collection('users').doc(userId).collection('audit_trail').add(eventData);
        await adminDb.collection('SystemLogs').add(eventData);
        if (opts?.organizationId) {
          await adminDb
            .collection('organizations')
            .doc(opts.organizationId)
            .collection('auditEvents')
            .add(eventData);
        }
      }
    } catch (e: any) {
      console.error('[EventService] DB write failed:', e?.message ?? e);
    }
    // Never log redacted values to stdout even via console.
    console.log(`[EventService] ${event} user=${userId} org=${opts?.organizationId ?? 'none'} req=${opts?.requestId ?? 'none'}`);
  }
}
