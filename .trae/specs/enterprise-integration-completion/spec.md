# ChainLegacy Enterprise Integration Completion — Product Requirements Document

## Overview
- **Summary**: Convert the Enterprise v1 API scaffold (20/23 STUBs) into a functioning multi-tenant backend: every endpoint runs the full chain (Auth → Org authz → Scope authz → Zod → Rate limit → Idempotency → Firestore transaction → Audit event → Webhook event → Response). Close all 9 Hard Gates (G-01 → G-09) from the verification report.
- **Purpose**: Transition ChainLegacy from "impressive enterprise prototype" to infrastructure a second African Web3 company can plug into for a signed 60-90 day controlled technical pilot.
- **Target Users**: Integrators at wallets / exchanges / fintechs / banks / insurers / estate firms in Africa consuming the `/api/v1` surface; ChainLegacy operators running the enterprise dashboard; an independent security reviewer.

## Goals
- G-01 Guardian identity proof: reject unauthenticated guardian quorum votes at `POST /claims/transition`.
- G-05 Multi-tenant isolation: universal `body.orgId == auth.organizationId` guards; 10+ Firestore emulator rules integration tests proving Org A/Org B separation at the DB layer.
- G-06 Webhook end-to-end: enqueue → queue persistence → fetch delivery → exponential backoff (8 attempts capped 24h) → consecutiveFailures auto-disable → dead-letter.
- G-08 Dependency vulnerabilities: direct dep → vulnerable → exploitability → upgrade path → regression test for each of the 5 critical npm audit entries (no `--force`).
- G-02 Rate limiting: org + API key + IP + endpoint with RESOURCE_EXHAUSTED 429 and per-endpoint tiers.
- G-03 CSP + HSTS: strict nonce-CSP, HSTS max-age 63072000 includeSubDomains preload; extra security headers.
- G-04 Protect `/enterprise/**`: server-side Firebase session cookie check + 302 to `/login?redirect=...` + role claim `enterprise_owner` onboarding guard.
- G-07 Cron schedule: `vercel.json` `"crons"` array firing `/api/cron/check-status` hourly.
- G-09 README scrub: real Firebase NEXT_PUBLIC_* + CRON_SECRET example → placeholders.
- Every enterprise v1 POST/PUT endpoint persists its entity to Firestore under `/organizations/{orgId}/...` using the Admin SDK inside a transaction.
- Every v1 mutation emits a redacted audit event to the org's `auditEvents` sub-collection and a signed webhook to enabled endpoints.
- Org A vs Org B HTTP integration tests (Firestore emulator) prove every collection cross-read returns empty and cross-write returns 403.
- Zero net-new STUB endpoints; all 20 current STUB rows in Section 3 of the verification report reach PARTIAL or IMPLEMENTED status.

## Non-Goals
- No new consumer UI, pages, dashboards, skeletons, or marketing work.
- No mobile app, React Native, APK, native builds.
- No new feature surface beyond the 9 Hard Gates and STUB → REAL wiring.
- No Stripe live-mode activation; billing stays mocked with `tok_simulated_*` prod rejection gate added.
- No "production ready" claims or PRODUCTION environment activations.
- No enterprise sales decks, pitch collateral, or pricing updates.
- No removal of existing B2C consumer routes or UI (leave as-is).

## Background & Context
Verification gate completed 2026-09-13 (ENTERPRISE_VERIFICATION_REPORT.md) with FINAL DECISION = CONDITIONALLY READY FOR CONTROLLED PILOT and 9 explicit Hard Gates before any external partner touches the system. Current code ships: Firestore rules correctly server-only for entire `/organizations/{orgId}/**` tree; EventService.redact 16 sensitive keys + MAX_DEPTH=8 recursion guard; v1Route plumbing (auth/scope/Zod/parse idempotency/pagination/structured errors) wired; ClaimEngine FSM + quorum pure functions working; Cron engine (9-min lock, 100-row batches, startAfter, lastCronLockId, UTC-only, suspicion>=80 freeze, enterprise collectionGroup legacyPlans) actually runs writes; webhook HMAC-SHA256 t/v1 + 5-min replay + 8× exp backoff cap 24h primitives implemented; 44/44 vitest unit tests pass; TypeScript strict and Next.js production build exit 0. BUT: 20 of 23 v1 routes return hardcoded `[]` and never call adminDb, no endpoint integration tests exist, guardian auth trivially spoofable, 5 critical npm vulns unpinned, no rate limiter, no CSP, enterprise pages unauthenticated, no cron schedule JSON, real config in README.

## Functional Requirements

### Core Hard Gates (must complete first)
- **FR-1 G-01 Guardian identity proof at claims transition**
  - `POST /api/v1/claims/transition` when `guardianId` is set and `guardianApproved` boolean present must reject unless identity proof verifies: proof must be one of (a) Firebase UID matching a stored guardian.firebaseUid link written at guardian creation, or (b) ECDSA/Secp256k1 signature over `sha256(claimId + ':' + approved + ':' + nonce)` verifiable against a guardian.walletAddress stored field with server-issued single-use nonce consumed within 5 minutes.
  - Quorum injection attempts (claims:manage scope caller without matching guardian proof) return 403 GUARDIAN_IDENTITY_PROOF_REQUIRED and increment an `orgs/{orgId}/securityEvents` counter.
  - Guardian creation endpoint persists a Firebase UID OR walletAddress on the guardian document so proofs can be verified.
- **FR-2 G-05 Multi-tenant isolation**
  - Every v1 POST/PUT handler accepting any resource identifier in the body or URL asserts body/URL orgId equals `auth.organizationId` from the server context (never the payload).
  - `GET /api/v1/{collection}` queries are always scoped to `adminDb.collection('organizations').doc(auth.organizationId).collection(...)` — never a collectionGroup on a read endpoint.
  - Firestore emulator test suite (package `@firebase/rules-unit-testing` installed and configured in `vitest.config.ts`) with 10+ rules tests covering every enterprise sub-collection cross-org access.
- **FR-3 G-06 Webhook pipeline**
  - A `WebhookEvent` document (`type, payload, orgId, dedupeKey, scheduledAt, attempts, lastAttemptAt, endpointId`) persists to `/organizations/{orgId}/webhookEvents/` for every route mutation that names a webhook event.
  - `POST /api/v1/webhooks/deliver` (CRON_SECRET protected) iterates scheduled events, performs real `fetch` to endpoint URL with `ChainLegacy-Signature` header matching current HMAC scheme, records attempt, increments consecutiveFailures on endpoint, disables endpoint at consecutiveFailures ≥ 5, after 8 attempts moves event to `/organizations/{orgId}/webhookDeadLetters/`.
  - Retry timing uses existing `retryDelayMs(2^attempt * 60s, cap 24h)`.
- **FR-4 G-08 Targeted dependency remediation**
  - For each of the 5 critical npm audit entries produce: direct dep name, path to vulnerable transitive dep, CVE or GHSA, a reasonable best-effort remote-code/exploitability classification (Active / Passive / Theoretic for this codebase), upgrade path, and a targeted resolution: (a) `npm update` specific package, (b) `package.json` `"overrides"` pin, or (c) explicit risk acceptance note with justification if upgrade breaks Next.js.
  - Run each upgrade through build + 44 unit tests as regression gate.
- **FR-5 G-02 Rate limiting**
  - Middleware or v1Route wrapper before auth resolves a rate-limit key: `rl:{orgId}:{apiKeyId}:{clientIp}:{method}:{routePath}`.
  - Default limits: read endpoints 300/min, write 60/min, claims/transition + api-keys write 20/min, webhooks/deliver cron exempt with secret.
  - Store counters in Firestore `/organizations/{orgId}/rateLimitBuckets/` with TTL 61-second server timestamps; return `429 RESOURCE_EXHAUSTED` with `Retry-After: 61`.
- **FR-6 G-03 CSP + HSTS**
  - Middleware sets: `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-${nonce}' ...` with strict directives compatible with Next.js App Router, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Permitted-Cross-Domain-Policies: none`, `X-DNS-Prefetch-Control: off`.
  - CSP nonce passed via `headers()` to the root layout so Next injected scripts carry matching nonce (or fall back to 'unsafe-inline' only for Next/RainbowKit bootstrap if nonce breaks wallet connect, with explicit justification).
- **FR-7 G-04 Protect /enterprise/** pages
  - Middleware matcher narrowed so `/enterprise/**` runs a Firebase session cookie check (decrypt session from cookie name, verifyIdToken against admin auth); if invalid → `302 /login?redirect=${originalPath}`.
  - Secondary role check on first `/enterprise/overview` Server Component render: require org owner claim (`enterprise_owner:{orgId}` custom claim on the Firebase user profile matching a document in `/organizations/{orgId}.ownerUid`).
  - Unauthorized Firebase user whose UID does not match any org ownerUid → generic 403 page (not a redirect) with no enterprise sidebar leakage.
- **FR-8 G-07 Vercel cron schedule**
  - `vercel.json` committed at repo root with `{ "crons": [{ "path": "/api/cron/check-status", "schedule": "0 * * * *" }] }` (hourly, per documentation) and matching rewrite/bypass headers for Vercel's cron IPs or bearer.
- **FR-9 G-09 README cleanup**
  - Replace all real concrete `NEXT_PUBLIC_FIREBASE_*` values with placeholders (`your-firebase-api-key`, `your-project-id`, `your-auth-domain`, `your-messaging-sender-id`, `your-app-id`, `your-measurement-id`).
  - Replace `CRON_SECRET=chainlegacy_secret_123` with `<32-byte random hex; e.g. openssl rand -hex 32>` and a note never to commit examples.
  - Add `.env.example` generation step referencing generated `.env.example` file created if absent with placeholders.

### STUB → REAL wiring (20 endpoint rows)
- **FR-10 Organizations POST → Firestore**
  - `POST /api/v1/organizations` calls `adminDb.collection('organizations').doc(org.id).set(...)` inside a transaction; rolls back + returns 409 ORG_SLUG_CONFLICT if slug exists.
  - Sets `ownerUid = auth.uid` (from Firebase JWT) — never from body.
  - Sets `customClaim enterprise_owner:{orgId}` via `adminAuth.setCustomUserClaims()` so FR-7 redirect works on next request.
  - Default sandbox API key returned show-once (secret only once); persisted to `/organizations/{orgId}/apiKeys/{keyId}` with sha256-only keyHash.
- **FR-11 Customers / Legacy Plans / Beneficiaries / Guardians / Liveness reset POST → Firestore**
  - Each POST performs transactional `.set()` under correct sub-collection; returns `{ data, requestId, idempotencyKey }`.
  - Beneficiaries tallies within a plan must sum ≤100 or return 400 BENEFICIARY_SHARES_OVERFLOW.
  - Guardian documents optionally accept `firebaseUid` or `walletAddress` so FR-1 proofs can be verified.
- **FR-12 Claims create / transition POST → Firestore**
  - `POST /api/v1/claims` invokes `ClaimEngine.create` output; persists with server timestamps under `/organizations/{orgId}/claims/{claimId}`.
  - `POST /api/v1/claims/transition` invokes `ClaimEngine.transition` + FR-1 identity proofs; persists new claim state.
  - On APPROVED → COMPLETED transition writes `completedAt` = server timestamp.
- **FR-13 API keys create/list/revoke/rotate → Firestore**
  - Routes that create/revoke/rotate keys write to `/organizations/{orgId}/apiKeys/{keyId}` transactionally; list route returns `data: []` from DB (keyHash omitted).
  - v1AuthFromRequest in production routes actually loads key rows from Firestore for the calling org to perform SHA-256 timing-safe verify against persisted `keyHash`.
- **FR-14 Webhook endpoints POST/list → Firestore**
  - Stores user-supplied URL + events list; server generates `whsec_…` signing secret via `generateSigningSecret()` only once at create time (show-once on create response; never returned on list).
- **FR-15 Audit GET → Firestore**
  - `GET /api/v1/audit` returns paginated 20 rows from `/organizations/{orgId}/auditEvents` redacted via `EventService.redact` for raw objects.
- **FR-16 Idempotency enforcement**
  - For each v1 POST/PUT handler: on request, check `/organizations/{orgId}/idempotency/{sha256(key)}` document; if present and ≤ 24h old return prior cached response verbatim; if absent create it transactionally with current response snapshot; if mismatch concurrent attempt return 409 IDEMPOTENCY_CONFLICT.
- **FR-17 Audit + webhook on every mutation**
  - Each POST/PUT route mutation logs to the org's auditEvents via EventService.logEvent and enqueues a webhookEvent via the FR-3 queue if an event type is declared.

### Integration test suite
- **FR-18 HTTP Org A vs Org B integration tests**
  - Run under Firestore emulator (vitest); create Org A (keyA) + Org B (keyB); insert a customer document into each org; 6 separate HTTP-fetch style requests using test routes helper or Next server test-helpers to confirm A GET cannot see B's customer nor B's claim nor B's plan and A POST cannot forge B's orgId (returns 403 TENANT_MISMATCH, body equality assert).

## Non-Functional Requirements
- **NFR-1 TypeScript strict zero**: `tsc --noEmit --pretty false` exit 0.
- **NFR-2 Unit + integration tests all pass**: `vitest run` exit 0, count ≥ 88 tests (44 existing + 44 new minimum).
- **NFR-3 Production build clean**: `NODE_OPTIONS=--max-old-space-size=8192 npx next build` exit 0; build must not regress route count.
- **NFR-4 Security no-weakening**: No test passes because of removed TTL checks, removed tenant checks, or skipped identity proofs. No `@ts-expect-error` / `as any` additions without inline justification on same line.
- **NFR-5 Audit clean logs**: No `console.log` with secrets or raw payloads; only requestId + orgId+route+status in structured log lines.
- **NFR-6 Zero new STUB endpoints**: Every route that declared a webhook event string in this session's skeleton must now actually enqueue; every route that generates an ID must actually persist that document to Firestore with server timestamps.
- **NFR-7 No-STUB rubric for /enterprise UI skeleton pages**: Pages stay skeleton; no dashboard wiring required this phase (explicit non-goal). Leave SIM labels intact.
- **NFR-8 Dependency post-remediation npm audit**: Total critical ≤ 1 after G-08 (with documented justifications). Target: 5 critical → 0 if achievable without breaking Next 14.

## Constraints
- **Technical**: Next.js 14 App Router (no pages router new code). TypeScript strict. Zod input validation only. Firebase Admin for Firestore/auth. WebCrypto/AES-GCM locally, hash-wasm Argon2id, shamir-secret-sharing real library. Prisma/Postgres NOT added this phase (Firestore-only persistence).
- **Business**: No PRODUCTION environment activations. No real customer/PII/wallet data in pilot. No Stripe/SMS/Email provider replacements (email stays SendGrid env-gated; SMS stays MOCKED; billing stays mocked).
- **Dependencies**: Install only necessary packages: `@firebase/rules-unit-testing` for G-05, one rate-limiter compatible with Firestore (no new Redis vendor required if pure Firestore bucket limiter shipped). No Upstash Redis dependencies unless user explicitly approves after plan phase.

## Assumptions
- Firebase Admin SDK credentials (`FIREBASE_PRIVATE_KEY_BASE64` etc.) in `.env.local` continue to work for emulator and live writes.
- Firestore emulator can be launched via `firebase emulators:start --only firestore` in CI or locally without extra GCP billing setup.
- Existing 44 unit tests' expected behaviour (crypto/FSM/HMAC/redaction/tenant/pagination) remains 100% stable; no changes to tests unless an inverted test assertion was already corrected.
- No new ORM (Prisma) this phase — all persistence is admin SDK Firestore transactions.
- RainbowKit/wagmi wallet signatures are available at backend via a payload signing helper we can call for guardian wallet proof verifications (if not, FR-1 falls back to firebaseUid-only proof path without wallet signatures).

## Acceptance Criteria

### AC-1 Guardian identity proof blocks unauthenticated tally injection
- **Type**: `rule`
- **Given**: Org O has 3 guardians G1, G2, G3; quorum 2; claim C1 created with status=GUARDIAN_REVIEW; caller holds a claims:manage scoped API key for O.
- **When**: Caller POSTs to `/claims/transition` with guardianId=G1, guardianApproved=true, and NO firebaseUid/wallet signature proof.
- **Then**: Response status=403, code=GUARDIAN_IDENTITY_PROOF_REQUIRED; tally record for G1 does not appear on claim; org securityEvents count increments by 1.
- **Pass Condition**: Integration test (Firestore emulator) returns status=403 + code and Firestore document `claimC1.guardianApprovals.G1 === undefined` after attempt.
- **Evidence**: Located in tests: tests/enterprise-integration.test.ts cases G01-identity-proof-required, G01-proof-passes-tally-recorded.

### AC-2 Tenant guard universal POST rejection
- **Type**: `rule`
- **Given**: HTTP helper using emulator; Org A key + Org B key; customer custB created inside B.
- **When**: Caller using keyA attempts POST `/customers` with body={organizationId:'B', email:'fake@a', fullName:'X'}.
- **Then**: Response status=403 TENANT_MISMATCH; no new customer document appears in B/customers.
- **Pass Condition**: All 8 entity POSTs (customers, plans, beneficiaries, guardians, claims.create, claims.transition, apiKeys, webhooks) fail identically when payload orgId does not match key orgId.
- **Evidence**: tests/tenant-isolation.test.ts × 8 = 8 POST cross-org tests.

### AC-3 Firestore rules Org A cannot read/write Org B (emulator)
- **Type**: `rule`
- **Given**: `@firebase/rules-unit-testing` env loaded with firestore.rules file; two test contexts (userA and userB).
- **When**: userA context tries collection('organizations').doc(orgB.id).collection('customers').get() or .set() any document.
- **Then**: Every read and every write returns PERMISSION_DENIED.
- **Pass Condition**: ≥ 10 rules tests all return denied for cross-org, and 10 tests allow within correct org for every sub-collection type (customers, plans, beneficiaries, guardians, claims, apiKeys, webhooks, auditEvents, webhookEvents, deadLetters = 10 sub-collections × A read + A write = up to 20 cases minimum, but rule AC accepts ≥ 10 distinct cases pass).
- **Evidence**: tests/firestore-rules.test.ts output 10+ PASS assertions.

### AC-4 Webhook delivery retries and dead-letters
- **Type**: `rule`
- **Given**: Org O webhook endpoint url=https://webhook.example/always-returns-500 events=['claim.created'] enabled=true; one scheduled webhookEvent scheduledAt<=now.
- **When**: `/webhooks/deliver` cron runs 9 times with appropriate time advancement.
- **Then**: After 8 runs: webhookEndpoint.consecutiveFailures=5 and enabled=false, webhookEvent.attempts=8, after run 9 document exists in webhookDeadLetters.
- **Pass Condition**: Firestore emulator tests verify each counter and presence in dead-letter; test performs real fetch via mock server (msw or nock intercept) returning 500.
- **Evidence**: tests/webhook-delivery.test.ts: dead-letter-arrived + endpoint-auto-disabled assertions.

### AC-5 Webhook HMAC signature on real delivery
- **Type**: `rule`
- **Given**: Webhook receiver endpoint (msw) records ChainLegacy-Signature header.
- **When**: Scheduled webhookEvent for a test org fires once.
- **Then**: Recorded signature header has `t=...,v1=...` format; call verifySignature(whsec_secret, recordedPayload, recordedHeader) returns true; timestamp within 5 min tolerance; payload tamper fails verify.
- **Pass Condition**: Sign-verify roundtrip + tamper fail in same test file.
- **Evidence**: tests/webhook-hmac-e2e.test.ts.

### AC-6 Dependency post-remediation critical count ≤ 1
- **Type**: `rule`
- **Given**: `npm audit --json` post-G-08 targeted upgrades.
- **When**: Compute metadata.vulnerabilities.critical.
- **Then**: Critical ≤ 1; any remaining critical has documented justifications line in G-08 remediation notes.
- **Pass Condition**: Command capture shows critical ≤ 1 AND every 5 original criticals individually resolved or explicitly deferred with reason.
- **Evidence**: G-08 section of tasks.md completion evidence with per-vuln actions + final npm audit capture.

### AC-7 Rate limiter 429 on 61st write in minute
- **Type**: `rule`
- **Given**: Clean rate limit bucket for orgO; claims POST endpoint limit 60/min.
- **When**: Issue 61 POST /customers within the same 61-second window.
- **Then**: Request #61 response=429, header Retry-After=61, code=RESOURCE_EXHAUSTED.
- **Pass Condition**: Integration test (fake timers or bucket prefill mutation) actually returns 429 on the overflow call.
- **Evidence**: tests/rate-limiter.test.ts: overflow-429 + retry-after-header cases.

### AC-8 CSP + HSTS headers present on all enterprise responses
- **Type**: `rule`
- **Given**: Any GET or API response under /enterprise/** or /api/v1/**.
- **When**: Inspect response headers.
- **Then**: Strict-Transport-Security present (max-age ≥ 31536000 includeSubDomains); Content-Security-Policy header set (not 'none'); X-Content-Type-Options still nosniff; X-Frame-Options still DENY.
- **Pass Condition**: tests/middleware-headers.test.ts via Next test-helpers on 3 sample routes (landing, api/v1/customers GET, enterprise/overview).
- **Evidence**: Header assertions captured.

### AC-9 Enterprise route redirects anonymous users
- **Type**: `rule`
- **Given**: Anonymous browser (no Firebase session cookie).
- **When**: GET /enterprise/overview.
- **Then**: HTTP 302 Location header starts with `/login?redirect=%2Fenterprise%2Foverview`.
- **Pass Condition**: Response status=302 with exact redirect target format. Middleware test.
- **Evidence**: tests/enterprise-auth-redirect.test.ts.

### AC-10 Cron JSON schedule hourly committed
- **Type**: `rule`
- **Given**: Repo root contains vercel.json.
- **When**: Read `JSON.parse(fs.readFileSync('vercel.json')).crons`.
- **Then**: Array has one object with path=`/api/cron/check-status` and schedule cron expression equivalent to hourly (`0 * * * *`).
- **Pass Condition**: Static file check during build or preflight test that passes.
- **Evidence**: tasks.md task G-07 completion evidence includes vercel.json content.

### AC-11 README real values scrubbed
- **Type**: `rule`
- **Given**: README.md lines 30-43 env section.
- **When**: Grep `AIzaSy` firebase API key + `chainlegacy_secret_123` literal in README.
- **Then**: Zero matches.
- **Pass Condition**: Repository grep for the exact old values returns empty.
- **Evidence**: grep command capture in task G-09.

### AC-12 v1 POST organizations persists to Firestore
- **Type**: `rule`
- **Given**: Valid Firebase user JWT with email verified.
- **When**: POST /organizations name='Demo', slug='demo', country='ZA'.
- **Then**: adminDb.collection('organizations').doc(newOrgId).get().exists == true; ownerUid matches authUid; customClaims on user contain enterprise_owner:orgId; sandbox API key document in orgs/{orgId}/apiKeys/ with sha256 keyHash.
- **Pass Condition**: Integration test (Firestore emulator) reads back every field correctly; show-once response.secret starts with clsbox_ and is never stored plaintext; keyHash stored but not returned.
- **Evidence**: tests/org-onboarding.test.ts.

### AC-13 v1 STUB rows now persist
- **Type**: `rubric`
- **Dimension**: Percentage of 20 Section 3 STUB endpoint rows that actually perform at least one Firestore transactional read/write for their entity and return persisted data.
- **Scale**: 0–100% linear mapping 1→20, 3→60, 5→100.
- **Anchors**: 1 = only organizations persists (5%); 3 = 12 endpoints persist with org guards but no webhook enqueue (60%); 5 = 20 of 20 rows persist + audit + webhookEvent queue (100%).
- **Pass Threshold**: >= 4 (≥ 80% i.e. ≥ 16 of 20 rows persist + audit + queue)
- **Evidence**: Route source file scan for `adminDb.*.set()/update()/transaction()` + audit logs for each POST/PUT; route-level tests verify 200 with persisted ID.

### AC-14 Org A vs B HTTP integration test battery (full tenant matrix)
- **Type**: `rubric`
- **Dimension**: Coverage and correctness of cross-org HTTP integration tests across entity kinds.
- **Scale**: 1–5.
- **Anchors**: 1 = 1 entity tested; 3 = 6 entity types pass both GET-blindness and POST-forgery rejections; 5 = 8 entity × (GET + POST) = 16 test cases pass, plus one rules-unit-test per sub-collection (10 rules tests).
- **Pass Threshold**: >= 4
- **Evidence**: tests/tenant-isolation.test.ts count + pass + tests/firestore-rules.test.ts pass count.

### AC-15 Guardian identity proof coverage (both firebaseUid + wallet variants or fallback)
- **Type**: `rubric`
- **Dimension**: Completeness of FR-1 guardian proof implementations and regression tests.
- **Scale**: 1–5.
- **Anchors**: 1 = firebaseUid-only, no wallet proof path; 3 = firebaseUid implemented + wallet signature method signatures exist but not fully exercised; 5 = firebaseUid + wallet address + nonce store + integration tests for both variants pass + negative tests for wrong signer pass.
- **Pass Threshold**: >= 3 (wallet variant may be stubbed behind feature flag if wagmi signature helper dependency prevents backend-only verifier; but firebaseUid path fully proven).
- **Evidence**: tests/guardian-identity.test.ts.

### AC-16 Idempotency enforcement (stored + reused)
- **Type**: `rule`
- **Given**: Same key `idem_demo_001` on POST /customers first call returns { id:'cust_xxx' }.
- **When**: Second call within 24h uses identical Idempotency-Key header.
- **Then**: Second response id === cust_xxx verbatim (not a new generated id); no second document in Firestore; third concurrent attempt returns 409 IDEMPOTENCY_CONFLICT.
- **Pass Condition**: Integration test performs three calls and asserts IDs equality + count==1 + conflict code.
- **Evidence**: tests/idempotency.test.ts.

### AC-17 Test count ≥ 88, build clean
- **Type**: `rule`
- **Given**: Run npm run typecheck && npm test && npx next build.
- **When**: All three commands complete.
- **Then**: typecheck exit 0, vitest result shows ≥ 88 passed, next build exit 0.
- **Pass Condition**: Command outputs captured verbatim with those exit codes and counts.
- **Evidence**: tasks.md final pre-review step captures.

### AC-18 Middleware self-contained + no secrets in server logs
- **Type**: `rubric`
- **Dimension**: Logging hygiene and middleware coupling.
- **Scale**: 1–5.
- **Anchors**: 1 = secret leaks present in console; 3 = no accidental log leaks observed but ad-hoc console.log still in routes; 5 = middleware has no firebase-admin import (self-contained already passes); all server logs include requestId only; EventService.redact applied to every structured log detail object; no `otp` plaintext in any console line at INFO level (only deliveryStatus flags).
- **Pass Threshold**: >= 4
- **Evidence**: grep for console.log with raw otp/secret/token/private in routes returns zero lines outside test fixtures.

## Open Questions
- [ ] **Wallet signature verifier library choice**: For FR-1 (guardian wallet proof) — does backend import `viem` to verify ECDSA signatures directly against Secp256k1 public keys recovered from `eth_sign` or `EIP-712`? If so, add `viem` as a dependency (already in package.json per wagmi stack, so likely already there). Confirm and record.
- [ ] **Firebase emulator access in TRAE sandbox**: Will `firebase emulators:start --only firestore,auth` start correctly on this Windows box given Java availability? If no, use in-process `@firebase/rules-unit-testing` emulator bootstrap which auto-launches via `initializeTestEnvironment` — document fallback.
- [ ] **Rate limiter implementation**: approve pure-Firestore TTL-bucket rate limiter (no Redis/Upstash dependency) OR require explicit Upstash install? Current default: Firestore-only bucket.
- [ ] **Rate limiter per-IP**: Client IP from `x-forwarded-for` / `x-real-ip` behind Vercel — correct header selection confirmed by user (defaults: Vercel uses `x-vercel-forwarded-for` / `x-forwarded-for`). Use standard parsing.
- [ ] **CSP nonce + RainbowKit**: Will strict nonce CSP break RainbowKit wallet modals (which inject scripts)? If yes, document fallback CSP using hashes or required 'unsafe-inline' for script-src with explicit justification; still ship HSTS + CSP for object-src/base-uri/frame-src etc.
