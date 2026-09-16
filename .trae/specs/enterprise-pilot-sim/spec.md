# ChainLegacy Enterprise Pilot Simulation - Product Requirements Document

## Overview
- **Summary**: Execute a complete end-to-end enterprise pilot simulation against the CURRENT ChainLegacy codebase (Next.js 14, NestJS-ready endpoints, Firestore via `@firebase/rules-unit-testing` emulator, Vitest test runner, webhook real HTTP listener). Simulate 3+ real enterprise organizations, full customer lifecycle, complete claim state machine, 3-tenant isolation attack surface, liveness cron time-compressed, real HTTP webhook delivery with independent HMAC verify, and Firestore rules server-only enforcement.
- **Purpose**: Establish objective, reproducible evidence that the current codebase is safe to expose to 1-2 trusted design-partner enterprise customers in a controlled pilot.
- **Target Users**: Release manager, security reviewer, enterprise pilot partner success, external Web3 company performing integration.

## Goals
- Baseline: Record objective `tsc`, full `vitest run` (12 files + emulator project), `next build`, `npm audit --production` outputs.
- Lifecycle: Create 1 full enterprise (Org-A) walking the entire: `Org → API Key → Webhook → Customer → LegacyPlan → Beneficiary → 2 Guardians → Liveness Check-In → Simulated Inactivity → Claim OPEN → Verification → Guardian Quorum (2/2) → Grace Period → Approval → Audit + Webhook events`.
- Tenant Isolation: Org-A / Org-B / Org-C. All cross-tenant GET/POST/UPDATE/DELETE on every route DENIED. Forged body IDs overridden by auth-derived organization/ownerUid.
- Claims: Discover actual ClaimStatus enum from `src/types/enterprise.ts`; produce complete transition matrix. Test every valid transition + invalid attempt + terminal state restart + duplicate approvals + zero quorum.
- Guardian Security: Nonce org-scoped, nonce replay DENY, forged proof DENY, cross-tenant nonce DENY, failed verification does not consume nonce when not intended.
- Liveness Cron: Run `api/cron/check-status` multiple times with time-compressed lastCheckInAt values. Verify 9-min lock TTL, pagination, idempotency, no duplicate transitions.
- Webhooks: Real Node `http.createServer` on 127.0.0.1:0. Independently HMAC-SHA256 verify signatures in the receiver. Prove: delivery, tamper reject, expired ts reject, retry backoff, 8-attempt deadletter, 5-consecutive-failure auto-disable.
- Audit Events: Org-scoped. Confirm secrets (OTP, API key plaintext, webhook secret, signing keys) do not leak through API responses or audit logs.
- Firestore Rules: Run emulator `--project emulator` rules unit tests. All `/organizations/*/**` → `read,write: if false`.
- API Reality: 25 endpoints. Classify each REAL / PARTIAL / STUB.
- Security Attack Matrix: Invalid auth, forged guardian proof, replayed nonce, duplicate approval, zero quorum, claim skip state, terminal manip, webhook tamper/expired/replay, unauthorized cron.
- Integration Guide: External Web3 company POV — exact step-by-step onboarding, required env vars, first 5 API calls to get to first claim.

## Non-Goals
- Not changing the Next.js/Nest architecture. Not introducing new external services.
- Not modifying stable working systems for stylistic reasons.
- Not force-upgrading dependencies with breaking changes.
- Not running against a real production GCP project; emulator + in-memory + local HTTP receiver only.

## Background & Context
- Pre-existing 145/145 PASS on baseline. F1/F2/F3/F4 production bug fixes already applied (OTP leak, simulate-approval bypass, .gitignore, sms mock failures).
- All `/api/v1/*` routes route through `v1Route()` in [v1-route.ts](file:///c:/Users/Thiza/Documents/trae_projects/CHainLegacy/src/lib/v1-route.ts) with Auth→Org→Scope→Zod→RateLimit→Idempotency→Audit→Webhook pipeline.

## Functional Requirements
- **FR-1**: Baseline commands run; exact exit codes and last N lines captured.
- **FR-2**: Org-A lifecycle test file creates all enterprise entities end-to-end using the service implementations (not mocks where avoidable) using existing `InMemory*Stores` and Firestore emulator.
- **FR-3**: Tenant isolation 3-org attack file; every cross-tenant operation returns 4xx/403 and zero data leak.
- **FR-4**: Claims transition matrix file. One `describe` block per status. Valid transitions → PASS. Invalid → explicit error. Terminal (COMPLETED/CANCELLED/APPROVED/REJECTED) → DENY on mutation.
- **FR-5**: Guardian/nonce security. Cross-tenant nonce consume returns 403. Replayed nonce 409. Forged sig 401. Zero-quorum approval 400/403.
- **FR-6**: Liveness cron. Call via handler with mocked dates. Verify: correct stage transitions per `stageFromTimestamp`, duplicate cron runs with active lock → LOCKED return, no repeated transitions via `lastCronLockId`.
- **FR-7**: Webhook real HTTP E2E. Real `http` server. `DEFAULT_FETCHER` actual `node-fetch`/`undici` POST. 5 banners proven. Deadletter + auto-disable verified.
- **FR-8**: Security attack matrix. Every row DENY or NO DUPLICATE SIDE EFFECT as specified.
- **FR-9**: Audit leakage test: issue OTP in `NODE_ENV=production` path, assert response body has no OTP. Create API key via service, assert list returns SHA-256 hash not plaintext.
- **FR-10**: Firestore emulator rules tests PASS.
- **FR-11**: External integration steps enumerated in final report.

## Non-Functional Requirements
- **NFR-1**: `tsc --noEmit` exit 0 before and after all changes.
- **NFR-2**: All new tests under `tests/` use Vitest.
- **NFR-3**: All 4 production fixes from previous gate remain intact.
- **NFR-4**: Spec Mode artifact boundaries strictly observed; spec/tasks created during SPECIFY/PLAN; review.md only during REVIEW.
- **NFR-5**: No speculative architecture changes.

## Constraints
- **Technical**: Next.js 14 App Router. TypeScript strict. Vitest. Firestore rules emulator. Real Node `http` module for webhook E2E.
- **Business**: Pilot-ready = zero CRITICAL/HIGH reachable vulnerabilities. Transitive dep CRITICALs (uuid) only accepted if proven unreachable.
- **Dependencies**: No `--force` installs. No breaking major version bumps.

## Assumptions
- Firestore emulator environment (FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST) works as in existing tests.
- Node `http`, `crypto`, `timers` APIs available.
- Test config (`vitest.config.ts`) has path alias `@/*` → `src/*` resolution (already working; 145 tests pass).

## Acceptance Criteria

### AC-1: Baseline Commands Recorded
- **Type**: `rule`
- **Given**: Clean checkout with F1-F4 already applied.
- **When**: Operator runs `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm audit --production`.
- **Then**: Exact exit codes, test counts (pass/fail/skip), last 25 lines each are recorded in final report.
- **Pass Condition**: TSC=0, BUILD=0, VITEST (all files PASS, 0 failures), AUDIT exit code noted with complete dependency chain explanation.
- **Evidence**: Terminal outputs captured, written to final report section "BASELINE COMMAND RESULTS".

### AC-2: Org-A Complete Lifecycle VERIFIED
- **Type**: `rule`
- **Given**: Fresh test context.
- **When**: Sequential create Org + key + webhook → customer → plan → beneficiary → 2 guardians → liveness check-in → inactivity trigger → claim → verification → 2/2 guardian approval → grace-period → audit + webhook fire.
- **Then**: Every step returns success; final entities exist; auditEvents contain the correct sequence for Org-A only.
- **Pass Condition**: 15/15 step assertions PASS. Zero 4xx/5xx on legitimate flow.
- **Evidence**: New test file `tests/e2e-org-a-lifecycle.test.ts` passing.

### AC-3: Tenant Isolation (3 org attack) ALL DENY
- **Type**: `rule`
- **Given**: Org-A, Org-B, Org-C populated with matching IDs across tenants (forged IDs attack).
- **When**: 40+ cross-tenant operations (GET/POST/UPDATE/DELETE on every resource).
- **Then**: Every unauthorized op returns 403/404. Zero resources from another tenant returned. Zero writes to another tenant's subcollections.
- **Pass Condition**: All cross-tenant test cases → DENY.
- **Evidence**: New/updated `tests/tenant-isolation.test.ts` with 3-org assertions PASS.

### AC-4: Claims Complete Transition Matrix
- **Type**: `rule`
- **Given**: ClaimStatus enum discovered from `src/types/enterprise.ts`.
- **When**: Attempt every (from → to) pair.
- **Then**: Valid → success with audit. Invalid → ApiError with status. Terminal statuses → all mutation attempts DENY.
- **Pass Condition**: Transition N×N matrix explicitly covered (either PASS valid or explicit DENY invalid).
- **Evidence**: New `tests/claim-transition-matrix.test.ts`.

### AC-5: Guardian and Nonce Security
- **Type**: `rule`
- **Given**: Org-A guardian with issued nonce. Org-B has different guardian.
- **When**: Attempt: replayed nonce; cross-tenant nonce consume; forged wallet signature; zero-quorum threshold; duplicate approval by same guardian.
- **Then**: Each DENY with correct HTTP 401/403/409. Nonce not marked consumed unless proof valid.
- **Pass Condition**: 8 attack assertions PASS.
- **Evidence**: `tests/guardian-identity.test.ts` assertions + new B-1 cases.

### AC-6: Liveness Cron (time-compressed)
- **Type**: `rule`
- **Given**: Plans with `lastCheckInAt` set to trigger warning/escalating/grace/triggered stages now.
- **When**: Call cron handler twice (simulate concurrent; one should take 9-min lock).
- **Then**: Correct stage transitions; duplicate cron run → LOCKED; repeated runs produce no extra transitions (idempotent via `lastCronLockId`).
- **Pass Condition**: 6 cron assertions PASS.
- **Evidence**: New `tests/liveness-cron.test.ts` PASS.

### AC-7: Real HTTP Webhook E2E 5 Banners + Deadletter + Auto-disable
- **Type**: `rule`
- **Given**: Node `http.createServer` bound to `127.0.0.1:0`.
- **When**: Enqueue event, run delivery batch, tamper test, expired ts test, 5 failure auto-disable test, 8-attempt deadletter test.
- **Then**: 5 banners, deadletter doc written, endpoint.enabled = false after 5 consecutive failures.
- **Pass Condition**: 8/8 webhook assertions PASS.
- **Evidence**: `tests/webhook-real-e2e.test.ts` extended.

### AC-8: Security Attack Matrix 18 Rows
- **Type**: `rule`
- **Given**: Full environment.
- **When**: Execute every row per matrix.
- **Then**: Expected column match.
- **Pass Condition**: 18/18 correct outcomes.
- **Evidence**: Aggregated across all test files; summary table in final report.

### AC-9: Audit Logging Leakage
- **Type**: `rule`
- **Given**: Simulated `NODE_ENV=production`.
- **When**: Issue OTP → list audit events → create/rotate API key → list keys.
- **Then**: OTP never in JSON response, API key plaintext returned only on POST create/PATCH rotate (showOnce), list returns keyHash only, audit events redacted.
- **Pass Condition**: 4 leakage assertions → DENY leak.
- **Evidence**: New `tests/audit-leakage.test.ts` PASS.

### AC-10: Firestore Rules Server-Only for Enterprise
- **Type**: `rule`
- **Given**: Emulator rules context.
- **When**: 21 rule assertions (read/write attempts on all org subcollections as signed-in user != server admin).
- **Then**: All 21 deny. `test:emulator` project exit 0.
- **Pass Condition**: 21/21 PASS.
- **Evidence**: `tests/firestore-rules.test.ts` PASS.

### AC-11: API Reality 25 REAL / 0 PARTIAL / 0 STUB
- **Type**: `rubric`
- **Dimension**: API endpoint implementation completeness for pilot
- **Scale**: 1-5
- **Anchors**: 1 = >10 STUBs; 3 = PARTIALs exist; 5 = every endpoint performs real persistence and returns real data
- **Pass Threshold**: >= 5
- **Evidence**: Manual code review of each of 25 methods against `/api/v1` route files.

### AC-12: Integration Guide Accuracy
- **Type**: `rubric`
- **Dimension**: External Web3 engineer onboarding clarity
- **Scale**: 1-5
- **Anchors**: 1 = guesswork required; 3 = 80% steps documented; 5 = copy-paste exact curl for each step and works
- **Pass Threshold**: >= 4
- **Evidence**: Final report section "EXTERNAL ENTERPRISE INTEGRATION STEP-BY-STEP".

## Open Questions
- None. User explicitly mandates "Do not stop to ask. Proceed concurrently on independent tasks."
