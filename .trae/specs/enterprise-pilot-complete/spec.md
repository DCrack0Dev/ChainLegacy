# ChainLegacy Enterprise Pilot Complete Simulation — Spec

## Problem
Validate the CURRENT ChainLegacy enterprise codebase end-to-end for a controlled pilot launch. No assumptions from prior sessions; every feature must be classified via evidence from the real implementation.

## Users / Goals
- Enterprise pilot customer: validates tenant isolation, lifecycle, security, audit
- Engineering leadership: needs PASS/FAIL classification per feature + pilot blockers
- Partner integrator: needs exact API integration steps

## Non-Goals
- New feature work outside bug fixes and regression tests
- UI/UX changes
- Deployment or infrastructure setup

## Functional Requirements

### F1 Baseline
- rule: `npx tsc --noEmit` exits 0
- rule: `npx vitest run` reports 0 failing tests (default + emulator projects)
- rule: `npm run build` exits 0
- rule: `npm audit --production` report captured; vulnerability count recorded

### F2 Enterprise Lifecycle Simulation (one real org)
- rule: In-memory service layer creates Organization → API Key → Webhook → Customer → LegacyPlan → Beneficiary → 2 Guardians
- rule: Liveness check-in recorded; simulated inactivity advances plan to claim_in_progress
- rule: Claim created with status PENDING; full transition chain PENDING→VERIFICATION→GUARDIAN_REVIEW→GRACE_PERIOD→APPROVED→COMPLETED
- rule: Guardian quorum Math.max(1, threshold) enforced; zero-quorum plans still require 1 approval
- rule: Every state change produces an audit event scoped to the correct organizationId
- rule: Webhook event enqueued for claim.completed

### F3 API Keys
- rule: POST create returns prefix+secret; only keyHash persisted (never plaintext)
- rule: HMAC-SHA256 salted hash comparison with timingSafeEqual passes on correct secret and fails on wrong secret
- rule: PATCH rotate revokes old key (revokedAt set, disabled=true) and returns new plaintext once
- rule: DELETE revoke sets revokedAt + disabled=true
- rule: Invalid key (wrong prefix, tampered bytes, revoked, expired) fails authentication

### F4 Tenant Isolation (≥3 orgs)
- rule: Forged organizationId in GET / POST / UPDATE / DELETE body returns 4xx
- rule: Forged ownerUid, customerId, planId, guardianId, beneficiaryId cross-tenant all return 4xx or 404 with no data leakage
- rule: assertPayloadOrgMatchesAuth rejects payload orgId != auth orgId
- rule: CollectionGroup-style cross-org reads filter explicitly by organizationId

### F5 Security Attacks
- rule: Missing / malformed Authorization returns 401
- rule: Forged guardian proof (wrong signature / wrong nonce / mismatched firebaseUid) rejects
- rule: Replayed nonce for guardian proof rejects
- rule: Duplicate guardian approval does not double-count in quorum tally
- rule: Zero quorum cannot auto-approve (quorum = Math.max(1, plan.guardianQuorum || 0))
- rule: Claim state skip (e.g. PENDING→APPROVED directly) throws ILLEGAL_TRANSITION
- rule: Terminal COMPLETED / REJECTED / CANCELLED state mutations all reject except CANCELLED→PENDING, REJECTED→PENDING
- rule: Webhook payload tampering (bit flip after sign) fails verifySignature
- rule: Webhook timestamp outside 5-min tolerance fails verifySignature
- rule: Replayed webhook idempotency via dedupeKey drops duplicate
- rule: Cron without CRON_SECRET Bearer returns 401 in production env

### F6 Claim Transition Matrix
- rule: Complete 9×9 matrix: every ClaimStatus pair tested for legality
- rule: CLAIM_LEGAL_TRANSITIONS matches the code predicate isLegalClaimTransition
- rule: Terminal states COMPLETED[] (no exits) and CANCELLED→[PENDING], REJECTED→[PENDING,CANCELLED]
- rule: Duplicate transition request on same from→to pair is idempotent (no extra transition row when already in state `to`)

### F7 Liveness Cron
- rule: stageFromTimestamp advances active→warning_email→warning_sms→push→ai→wallet_sign→grace→triggered using UTC arithmetic
- rule: 9-minute lock (CRON_LOCK_TTL_MS) causes concurrent runs to return LOCKED
- rule: Idempotent repeated cron runs do not duplicate claims or notifications
- rule: Pagination with DEFAULT_BATCH_SIZE + cursor completes without missing rows

### F8 Webhooks (real local HTTP receiver)
- rule: Local Node HTTP server receives POST with body + `ChainLegacy-Signature` header
- rule: Independent HMAC-SHA256 recomputation matches the header signature
- rule: Bit-flipped body causes verifySignature to return false
- rule: Timestamp 6 minutes old returns false (5-min tolerance)
- rule: 8-attempt exponential backoff: retryDelayMs(0..7) strictly increases up to 24h cap
- rule: 5 consecutive failures → endpoint auto-disabled (consecutiveFailures ≥ threshold)
- rule: DeadLetter: MAX_ATTEMPTS reached sets deadLetterAt on delivery row

### F9 Audit + No-Leakage
- rule: Major actions (org create, key create/revoke, claim create/transition, customer create) produce organization-scoped audit events
- rule: Audit responses never contain keyHash, secret, OTP code, or private key material
- rule: API key GET list omits the plaintext secret; only prefix + keyHash fields returned

### F10 Firestore Rules
- rule: Enterprise subcollections under organizations/{orgId}/ are server-write-only (client get/set/list rejected)
- rule: Client without admin SDK cannot read or write organizations/*/customers, *legacyPlans, *guardians, *claims, *apiKeys, *auditEvents

### F11 Partner Integration
- rubric: Integration guide includes exact steps with 0,1,2 score; threshold ≥ 1.5
  - 0: missing steps or stub-only
  - 1: mostly complete but 1+ manual intervention required
  - 2: copy-paste curl/ts example, auth scheme, scopes, error codes, webhook verify recipe

## Constraints
- Stack: Next.js 14, TypeScript strict, Firebase Auth/Admin, vitest
- camelCase variables, PascalCase components; no unnecessary comments
- No faked PASS results; every feature classified VERIFIED / SIMULATED / NOT IMPLEMENTED / FAIL / NOT TESTED
- Bug fixes discovered during simulation are fixed + regression test added before rerun
- Final recommendation: SHIP TO CONTROLLED PILOT or DO NOT SHIP — FIX THESE ITEMS FIRST

## Dependencies
- Existing vitest config with default + emulator projects
- InMemoryPersistenceBackend + FirestorePersistenceBackend
- Node crypto (createHmac, timingSafeEqual, createHash, randomBytes)
- Node http module for webhook E2E receiver

## Assumptions
- Firebase emulator not required for in-memory service-layer tests (default project)
- NODE_ENV=test disables CRON auth (production-only gate)
- Existing 17 production vulns in next/firebase-admin are tracked separately as known, requiring breaking changes per project memory

## Open Questions
- (Resolved by implementer): No user questions; per user mandate proceed directly.
