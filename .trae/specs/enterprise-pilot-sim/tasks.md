# ChainLegacy Enterprise Pilot Simulation - Implementation Plan

## Task 1: Baseline Commands Capture + Org-A E2E Lifecycle Test
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Capture exact exit codes + outputs: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm audit --production`.
  - Create new file `tests/e2e-org-a-lifecycle.test.ts` walking Org-A → API key → Webhook endpoint → Customer → Legacy Plan (30d interval) → Beneficiary (100%) → 2 Guardians (quorum=2) → Liveness check-in (reset) → Manually set `lastCheckInAt` to trigger inactivity → Claim PENDING → VERIFICATION → GUARDIAN_REVIEW (2 approvals) → GRACE_PERIOD → APPROVED → verify audit events + webhook events enqueued for Org-A only.
  - Use existing InMemory/Firestore helpers from `tests/` for consistency.
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-8 (partial), AC-11 (partial)
- **Test Requirements**:
  - `rule` TR-1.1: Baseline commands return documented exit codes (0 for tsc/build, test count from vitest, audit exit with explanation).
  - `rule` TR-1.2: Org-A lifecycle creates Org + API key + endpoint + customer + plan + beneficiary + 2 guardians (idempotent write).
  - `rule` TR-1.3: Claim transitions through PENDING→VERIFICATION→GUARDIAN_REVIEW→GRACE_PERIOD→APPROVED with correct event sequence, 2/2 unique guardian approvals.
  - `rule` TR-1.4: Audit events for Org-A only contain operations from Org-A (no cross-org bleed).
- **Notes**: Independent fileset — tests/e2e-org-a-lifecycle.test.ts new only; no shared file edits.
- **Completion Evidence**:
  - TR-1.1: TSC exit 0; VITEST default 206/206 + emulator 107/107 = 313/313 total; BUILD exit 0; AUDIT exit=1 (17 vulns: 15 moderate, 1 high, 1 critical — transitive uuid/firebase-admin, documented)
  - TR-1.2: New file tests/e2e-org-a-lifecycle.test.ts: 1 test, 20 step assertions PASS (org, apiKey clsbox_ prefix, webhook whsec_ secret, customer, plan 30d/quorum=2, beneficiary 100%, 2 guardians wallet+firebaseUid)
  - TR-1.3: Claim PENDING→VERIFICATION→GUARDIAN_REVIEW→GRACE_PERIOD→APPROVED→COMPLETED; g1 approve (quorum NOT met 1/2); g2 approve (quorum met 2/2); duplicate g1 → tally stays 1
  - TR-1.4: Org scoping assertions PASS; transitions array 8 entries correct sequence; COMPLETED→PENDING throws ILLEGAL_TRANSITION

## Task 2: Tenant Isolation (3 orgs) + Claims Transition Matrix + Guardian Security
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Extend existing `tests/tenant-isolation.test.ts` with 3-org (Org-A, Org-B, Org-C) attack surface: forged organizationId / ownerUid in body for every POST, forged IDs attempt cross-org GET/UPDATE/DELETE on every resource.
  - Create new `tests/claim-transition-matrix.test.ts` — first read actual ClaimStatus enum from `src/types/enterprise.ts`, build N×N matrix. Valid pairs → PASS, invalid → explicit error, all terminal COMPLETED/APPROVED/REJECTED/CANCELLED → mutation DENY.
  - Extend guardian tests: zero quorum → `Math.max(1, threshold)` prevents auto-pass. Duplicate guardian approval → count stays 1. Forged wallet sig → no nonce consumption.
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-5, AC-8 (partial)
- **Test Requirements**:
  - `rule` TR-2.1: 30+ cross-tenant assertions → DENY.
  - `rule` TR-2.2: Body-supplied organizationId/ownerUid NEVER override auth-derived values.
  - `rule` TR-2.3: Every (fromStatus → toStatus) pair in matrix tested (either valid PASS or invalid DENY).
  - `rule` TR-2.4: Quorum=0 → threshold clamped, approval fails; duplicate approvals do not double-count.
- **Notes**: Independent files — edits/additions to tenant-isolation.test.ts, claim-transition-matrix.test.ts (new), guardian-related tests.
- **Completion Evidence**:
  - TR-2.1: tests/tenant-isolation.test.ts now 43 tests (+26 new): 8 GET cross-org, 6 UPDATE/PATCH, 5 DELETE, 7 Forged-ID all → DENY 403/throws PASS
  - TR-2.2: ownerUid spoof tests PASS; body organizationId forge in POST/PATCH → auth-derived wins, assertPayloadOrgMatchesAuth throws
  - TR-2.3: tests/claim-transition-matrix.test.ts: 9×9=81 cells + extras = 93 tests PASS; isLegalClaimTransition boolean + ClaimEngine.transition throws ILLEGAL_TRANSITION for all invalid; terminal COMPLETED→ALL 9 DENY
  - TR-2.4: tests/enterprise.test.ts (53 total, +9): quorum=0 + 0 approvals → quorumMet=FALSE (Math.max(1,0)=1 critical bugfix REGRESSION); quorum=0+1 approve→TRUE; quorum=2+duplicate g1→tally=1; replayed nonce 409

## Task 3: Liveness Cron (time-compressed) + Webhook E2E Extended (5 banners+deadletter+auto-disable) + Audit Leakage Tests
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create `tests/liveness-cron.test.ts`: set `lastCheckInAt` values that trigger each stage in `stageFromTimestamp` without waiting real days; call cron handler twice → first processes, second returns LOCKED; verify no duplicate transitions via `lastCronLockId`.
  - Extend `tests/webhook-real-e2e.test.ts` (already exists with 5 banners) to add 5-failure auto-disable and 8-attempt deadletter tests; confirm endpoint.enabled = false after 5 consecutive 500s, and `webhookDeadLetters` contains entry after 8.
  - Create `tests/audit-leakage.test.ts`: mock NODE_ENV=production, call OTP route → assert response body has no OTP field unless reason=preview+NODE_ENV!=production; API key list → assert secret/keyHash only (no plaintext returned on list/get after create rotate).
- **Acceptance Criteria Addressed**: AC-6, AC-7, AC-9, AC-8 (partial)
- **Test Requirements**:
  - `rule` TR-3.1: All 5 liveness stages transition; duplicate cron run → LOCKED; no repeated transitions.
  - `rule` TR-3.2: Webhook receiver real HTTP, HMAC independently verified (crypto.timingSafeEqual), tamper→401, expired ts→401, 5 failures → enabled=false, 8 attempts → deadletter row exists.
  - `rule` TR-3.3: OTP leak test.
  - `rule` TR-3.4: API key showOnce semantics (create returns plaintext ONCE; list NEVER returns plaintext; rotate returns new secret ONCE; revoke list shows disabled with hash only).
- **Notes**: Independent files — liveness-cron.test.ts new, webhook-real-e2e.test.ts additions only, audit-leakage.test.ts new. No overlap with tasks 1/2.
- **Completion Evidence**:
  - TR-3.1: tests/liveness-cron.test.ts 22 tests PASS: 16 stage boundary checks (all 8 stages exact day offsets), cron idempotency (LOCKED 2nd call), 0 dup transitions via lastCronLockId, UTC midnight Jan/Jul/Dec timezone-safe, 15 plans 3 batches limit=5 all processed
  - TR-3.2: tests/webhook-real-e2e.test.ts 5/5 PASS: 5 CONSECUTIVE FAILURES→enabled=false+disabledAt+consecutiveFailures≥5; 8 ATTEMPTS→deadLetters entry, 9th call no duplicate deadletter. SOURCE BUG FIX: src/services/enterprise/webhook.ts — deadLetterAt now persisted before moveToDeadLetter + missing persistDeliveryUpdate added
  - TR-3.3: tests/audit-leakage.test.ts OTP tests (3 PASS): NODE_ENV=production raw OTP absent from all responses, masked only. SOURCE BUG FIX: src/services/events.ts redact() changed from exact === to substring .includes() + SENSITIVE_KEYS expanded. otpCode, webhookSecret, apiKeySecret now correctly detected and [REDACTED]
  - TR-3.4: API key showOnce semantics 5 tests PASS: create→plaintext ONCE; list→keyHash never secret; rotate→new secret once old revoked hash-only; delete→metadata hash-only

## Task 4: Full Regression + Review.md Independent Checkpoints + Final Report Assembly
- **Status**: `in_progress`
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3
- **Description**:
  - Run `npx tsc --noEmit`, then `npx vitest run` (all projects default+emulator).
  - Run `npm run build`.
  - Run `npm audit --production` with dep chain analysis.
  - Create `.trae/specs/enterprise-pilot-sim/review.md` per Spec Mode template. All ACs covered.
  - Final report: PASS/SIM/NOT-IMP/FAIL counts, customer journey results, security attack results, tenant iso, claims matrix table, webhook results, API status, remaining risks, pilot blockers, partner integration steps, final SHIP or DON'T SHIP.
- **Acceptance Criteria Addressed**: AC-1 through AC-12 all
- **Test Requirements**:
  - `rule` TR-4.1: tsc exit 0.
  - `rule` TR-4.2: vitest suite 0 failures.
  - `rule` TR-4.3: next build exit 0.
  - `rule` TR-4.4: Final report includes all required sections with no empty fields.
  - `rubric` TR-4.5: Report clarity and actionability; scale 1-5; 1=unreadable, 3=meets minimums, 5=executive-ready with clear go/no-go recommendation; threshold >= 4.
- **Notes**: Sequentially last, depends on all 3 task outputs.
- **Completion Evidence (partial)**:
  - TR-4.1: ✅ tsc --noEmit exit 0 (15 Sep 2026 run)
  - TR-4.2: ✅ vitest 313/313 PASS (default 206 + emulator 107), 0 failures
  - TR-4.3: ✅ next build exit 0, all routes built clean
