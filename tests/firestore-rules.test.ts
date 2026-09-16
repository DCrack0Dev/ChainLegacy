import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function readRules(): string {
  const p = resolve(process.cwd(), 'firestore.rules');
  return readFileSync(p, 'utf8');
}

const SERVER_ONLY_SUBCOLLECTIONS = [
  'customers',
  'legacyPlans',
  'beneficiaries',
  'guardians',
  'claims',
  'auditEvents',
  'apiKeys',
  'rateLimitBuckets',
  'idempotency',
  'securityEvents',
  'guardianNonces',
  'webhookEvents',
  'webhookDeadLetters',
  'livenessResets',
  'webhooks',
];

describe('Firestore rules server-only enforcement (AC-3 TR-10.1 ≥ 10 deny)', () => {
  it('firestore.rules file exists', () => {
    expect(existsSync(resolve(process.cwd(), 'firestore.rules'))).toBe(true);
  });

  it('rules root contains service cloud.firestore declaration', () => {
    const rules = readRules();
    expect(rules.includes('service cloud.firestore')).toBe(true);
  });

  it('rules match includes /databases/{database}/documents scope', () => {
    const rules = readRules();
    expect(rules.includes('/databases/{database}/documents')).toBe(true);
  });

  it('match /organizations/{orgId} wrapper present', () => {
    expect(readRules().includes('/organizations/{orgId}')).toBe(true);
  });

  SERVER_ONLY_SUBCOLLECTIONS.slice(0, 10).forEach((sub) => {
    it(`${sub} subcollection is server-only (allow read,write: if false present inside org block)`, () => {
      const rules = readRules();
      const idx = rules.indexOf(`/${sub}/{`);
      expect(idx).toBeGreaterThan(-1);
      const block = rules.slice(idx, idx + 600);
      const allowFalse = block.includes('if false');
      expect(allowFalse).toBe(true);
    });
  });

  it('rules denies public read at root level (absent catch-all or explicit false/auth check)', () => {
    const rules = readRules();
    const matchIdx = rules.indexOf('/{document=**}');
    if (matchIdx !== -1) {
      const block = rules.slice(matchIdx, matchIdx + 500);
      expect(block.includes('if false') || block.includes('if request.auth != null')).toBe(true);
    }
  });

  it('organizations wrapper itself is server-only (org itself false write)', () => {
    const rules = readRules();
    const orgStart = rules.indexOf('/organizations/{orgId}');
    expect(orgStart).toBeGreaterThan(-1);
    const head = rules.slice(orgStart, orgStart + 200);
    expect(head.includes('if false')).toBe(true);
  });

  it('at least 10 server-only subcollections under org block present', () => {
    const rules = readRules();
    let count = 0;
    for (const sub of SERVER_ONLY_SUBCOLLECTIONS) {
      const pattern = `/${sub}/{`;
      if (rules.includes(pattern)) count++;
    }
    expect(count).toBeGreaterThanOrEqual(10);
  });

  it('entire org block has NO allow if true statements inside', () => {
    const rules = readRules();
    const orgStart = rules.indexOf('/organizations/{orgId}');
    expect(orgStart).toBeGreaterThan(-1);
    const tail = rules.slice(orgStart, orgStart + 4000);
    const allowTrueCount = (tail.match(/allow\s+[\w,\s]+:\s*if\s+true\s*;/g) || []).length;
    expect(allowTrueCount).toBe(0);
  });

  it('rateLimitBuckets + idempotency + securityEvents + guardianNonces present', () => {
    const rules = readRules();
    expect(rules.includes('/rateLimitBuckets/{')).toBe(true);
    expect(rules.includes('/idempotency/{')).toBe(true);
    expect(rules.includes('/securityEvents/{')).toBe(true);
    expect(rules.includes('/guardianNonces/{')).toBe(true);
  });

  it('webhook subcollections present (webhooks + webhookEvents + webhookDeadLetters)', () => {
    const rules = readRules();
    expect(rules.includes('/webhooks/{')).toBe(true);
    expect(rules.includes('/webhookDeadLetters/{')).toBe(true);
    expect(rules.includes('/webhookEvents/{')).toBe(true);
  });

  it('livenessResets, claims, auditEvents, apiKeys, beneficiaries present', () => {
    const rules = readRules();
    for (const s of ['livenessResets', 'claims', 'auditEvents', 'apiKeys', 'beneficiaries']) {
      expect(rules.includes(`/${s}/{`)).toBe(true);
    }
  });
});
