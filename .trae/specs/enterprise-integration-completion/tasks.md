# ChainLegacy Enterprise Integration Completion — Implementation Plan

## Dependency Ordering Legend
Tasks run from top → bottom in listed priority. Predecessors are explicit; when two tasks share no Depends On they may be run concurrently ONLY if file paths are disjoint. Concurrent writes to same file are forbidden.

---

## Task 1: G-08 Dependency vulnerability remediation (5 critical)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - For each of the 5 critical vulns reported by `npm audit --json`: identify direct dep → transitive path → CVE/GHSA → exploitability in this codebase → upgrade path → regression test.
  - Apply targeted upgrades (no `--force`). Use `package.json` `"overrides"` if needed for conflicting resolution trees.
  - After each upgrade rerun `npm run typecheck && npm test`.
  - Target: critical drops from 5 → ≤ 1 with documented justifications.
- **Acceptance Criteria Addressed**: AC-6, AC-17
- **Test Requirements**:
  - `rule` TR-1.1: Run `npm run typecheck && npm test` after each targeted upgrade or batch; exit codes both 0. Evidence: shell commands + captures.
  - `rule` TR-1.2: Run `npm audit --json` and compute `metadata.vulnerabilities.critical`; result ≤ 1; if 1, an explicit written justification for each remaining critical (why NOT exploitable here, or can't upgrade without breaking Next 14).
  - `rule` TR-1.3: For each of the 5 original critical items, a 1-line written record: direct dep, vulnerable path, GHSA, exploitability (Active / Passive / Theoretic for ChainLegacy), resolution applied (npm update X, overrides Y, deferred), regression test executed.
- **Notes**: Scope only direct dependency changes needed for 5 critical. Avoid touching 27 moderate unless upgrades come for free in semver ranges.

---

## Task 2: G-09 README scrub + new .env.example
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - In `README.md`, replace concrete NEXT_PUBLIC_FIREBASE_* values (6 lines: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId) with `your-firebase-api-key`, `your-project-id`, `your-auth-domain.firebaseapp.com`, `your-storage-bucket.appspot.com`, `your-sender-id`, `your-app-id`, `your-measurement-id` placeholders.
  - Replace `CRON_SECRET=chainlegacy_secret_123` with text: `CRON_SECRET=<generate with: openssl rand -hex 32>` and a one-line "Never commit real CRON_SECRET values or examples."
  - Create `.env.example` at repo root with those same placeholders + empty SENDGRID/PRIVATE_KEY entries.
  - Re-grep for the removed literal patterns to confirm clean.
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `rule` TR-2.1: `rg -F "AIzaSyDUhsOS9_vdVrxOnHtXzNHBEI7iw1JLwJc" README.md` returns no matches; `rg -F "chainlegacy_secret_123" README.md` no matches.
  - `rule` TR-2.2: `ls -la .env.example` exists; file contains all required env key names with placeholder values (at least NEXT_PUBLIC_FIREBASE_API_KEY, FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY_BASE64, SENDGRID_API_KEY, CRON_SECRET, NEXT_PUBLIC_APP_URL, RP_ID, ORIGIN).
- **Notes**: No code logic changes; file hygiene only.

---

## Task 3: G-03 CSP + HSTS middleware headers
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In `src/middleware.ts`, add CSP header generator with per-request nonce (`crypto.randomUUID()` or 16-byte hex). Set:
    - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
    - `X-Permitted-Cross-Domain-Policies: none`
    - `X-DNS-Prefetch-Control: off`
    - `Content-Security-Policy`: strict directives that work for Next App Router (use `'nonce-${nonce}'` for script-src if feasible; if RainbowKit scripts require 'unsafe-inline' then document fallback: keep frame-ancestors, object-src, base-uri, form-action, connect-src strict; explicitly justify inline fallback).
  - Inject nonce into a response header `x-csp-nonce` so Server Components can read it for later.
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-3.1: 3 middleware-response tests verify headers: `/` (landing), `/api/v1/customers` (via Next test mock), `/enterprise/overview` all have STS + CSP + nosniff + X-Frame-Options set.
  - `rubric` TR-3.2: Strictness of CSP; scale 1–5; anchors 1=no CSP, 3=frame-ancestors/object-src/base-uri strict but script-src has unsafe-inline with justification, 5=nonce everywhere and no unsafe-inline for scripts. Threshold ≥ 3.
- **Notes**: No external deps. File scope: `src/middleware.ts` only. Tests: `tests/middleware-headers.test.ts` (new file).

---

## Task 4: G-07 Vercel cron schedule JSON
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - Create `vercel.json` at repo root with structure:
    ```json
    {
      "crons": [{ "path": "/api/cron/check-status", "schedule": "0 * * * *" }],
      "headers": [{ "source": "/api/cron/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "none" }] }]
    }
    ```
  - Confirm `next.config.mjs` doesn't conflict.
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**:
  - `rule` TR-4.1: Node eval `JSON.parse(fs.readFileSync('vercel.json','utf8')).crons[0]` returns `{ path:'/api/cron/check-status', schedule:'0 * * * *' }`.
  - `rule` TR-4.2: `tsc --noEmit` still passes (vercel.json is pure data; no build impact expected).

---

## Task 5: Install Firestore rules-unit-testing + test infra expansion + new vitest projects
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - `npm i -D @firebase/rules-unit-testing@latest firebase@latest firebase-admin@latest`.
  - Extend `vitest.config.ts` with a second test project (or single `setupFiles` entry) that initializes `initializeTestEnvironment` only when `process.env.FIREBASE_EMULATOR=1`. Non-integration vitest runs keep running without emulator.
  - Add new npm scripts: `test:emulator` (runs `firebase emulators:exec --only firestore,auth --project chainlegacy-test 'vitest run tests/*{rules,tenant-isolation,guardian-identity,org-onboarding,webhook-delivery,rate-limiter,idempotency}.test.ts'`); keep plain `npm test` 44+ tests working WITHOUT emulator for fast dev.
  - Update `.gitignore` for emulator build artifacts.
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-9, AC-12, AC-14, AC-15
- **Test Requirements**:
  - `rule` TR-5.1: Plain `npm test` still exits 0 with 44 tests.
  - `rule` TR-5.2: `test:emulator` boots emulator and at least 3 new test files run to completion (may pass or fail on content for now — Task 10 fills in).

---

## Task 6: G-05 Tenant guard — universal `body.orgId === auth.organizationId` assertion
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In `src/lib/api-auth.ts` / `src/lib/v1-route.ts`, add a helper `assertOrgMatches(ctxAuth, payloadKeys)` that for every POST/PUT handler:
    - Scans body and URL params for any `organizationId`, `orgId`, nested `customer.organizationId`, `legacyPlan.organizationId`, etc.; compares each to `auth.organizationId`.
    - If mismatch → throw ApiError(403, 'TENANT_MISMATCH', 'resource belongs to another organization'); never accept orgId from body as truth for ownership.
  - Apply helper to all 20 POST/PUT v1 endpoints.
  - Confirm GET endpoints already scope to orgs/{orgId}/... not collectionGroup.
- **Acceptance Criteria Addressed**: AC-2, AC-14
- **Test Requirements**:
  - `rule` TR-6.1: Add 2 unit tests for assertOrgMatches — pass case returns true; mismatch case throws TENANT_MISMATCH.
  - `rubric` TR-6.2: Coverage of helper across endpoints; scale 1–5; anchors 1=1 endpoint, 3=10 endpoints wired, 5=all 20 POST/PUT v1 endpoints invoke helper; threshold ≥ 4 (≥ 16 endpoints wired).

---

## Task 7: G-02 Rate limiter (Firestore bucket) integration
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create `src/services/enterprise/rate-limiter.ts` with:
    - `shouldAllow({ orgId, apiKeyId, clientIp, method, path, opts: { limitPerMin, tier } })`: reads/writes `/organizations/{orgId}/rateLimitBuckets/{bucketId}` with TTL-sharded counter (61-second server timestamp fields); atomically increment by 1 with FieldValue.increment; if > limit return false + retry-after seconds.
    - Default tier map: get=300/min write=60/min claims_transition=20/min apiKeys_write=20/min webhooksDeliver_cron=UNLIMITED_with_cronSecret_match.
  - Plug limiter into `src/lib/v1-route.ts` between `method check` and `auth`.
  - Returns 429 `RESOURCE_EXHAUSTED` body + `Retry-After: 61` header.
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `rule` TR-7.1: Unit test for 61st write returns false; 61st call in a route context response=429 code=RESOURCE_EXHAUSTED + Retry-After header = 61.
  - `rule` TR-7.2: Cron endpoint (cronSecret present) bypasses limit counter; increment never called.
- **Notes**: No external Upstash/Redis.

---

## Task 8: G-04 Protect /enterprise/** pages (Firebase auth middleware redirect)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3 (shares middleware.ts)
- **Description**:
  - Extend `src/middleware.ts` with Firebase session cookie check for routes matching `config.matcher` narrowed to include `/enterprise/:path*` (or check pathname starts with `/enterprise` inline).
  - Use a lazy import of `firebase-admin` verifySessionCookie or standard JWT verifyIdToken depending on cookie name used by AuthProvider (research existing session cookie from `src/components/auth/AuthProvider.tsx` / sign-in flow; may require installing session cookie write on signIn success first — if not present add minimal version).
  - Invalid session → 302 to `/login?redirect=${encodeURIComponent(pathname+search)}`.
  - Valid session UID → Server Component `/enterprise/overview` also guards: fetch `adminDb.collection('organizations').where('ownerUid','==',uid).limit(1).get()`; if no org → generic 403 page (no sidebar leaks).
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-8.1: Middleware test: unauthenticated GET /enterprise/overview returns 302 Location header starts with `/login?redirect=`.
  - `rule` TR-8.2: Server component test (emulator auth) — valid ownerUid session gets 200, valid non-owner UID session (stranger) returns 403 page.
- **Notes**: Coordinate with Task 3 to not double-import admin into middleware edge runtime — lazy import guarded by NODE_ENV==='server' only inside enterprise branch if admin SDK needed; alternatively verifyIdToken works from firebase/auth not admin (avoid protobuf edge issues).

---

## Task 9: Organizations onboarding persistence (POST org → Firestore + custom claims + default sandbox key)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5 (emulator setup), Task 6 (org guard helper), Task 8 (enterprise overview ownerUid guard prerequisite)
- **Description**:
  - In `src/app/api/v1/organizations/route.ts`, rewrite POST handler:
    - Auth source: Firebase JWT auth.uid (not body).
    - Slug sanitize + slug uniqueness transaction: check collection('organizations').where('slug','==',slugLower).limit(1) → if exists 409 ORG_SLUG_CONFLICT.
    - `OrganizationService.create` returns objects; call `adminDb.runTransaction(async tx => { tx.set(organizations.doc(id), orgDoc); tx.set(organizations.doc(id).collection('apiKeys').doc(keyRow.id), keyRow); await adminAuth.setCustomUserClaims(ownerUid, { ...existingClaims, [`enterprise_owner:${id}`]: true }); });`
    - Return { code:'OK', organization:{ id, name, slug, status }, apiKeyShowOnceSecret: secret, requestId }. NEVER return keyHash.
  - Also wire v1AuthFromRequest to actually load organization-scoped key rows from Firestore: `orgs/{auth.organizationId}/apiKeys/` when X-API-Key matches a keyId prefix, read all rows where disabled!==true && revokedAt===undefined, hash incoming secret candidate, timingSafeEqual with DB row's keyHash.
- **Acceptance Criteria Addressed**: AC-12, AC-13
- **Test Requirements**:
  - `rule` TR-9.1: emulator org onboarding test → POST returns clsbox_ secret; Firestore query returns org doc matching UID; customClaims contain enterprise_owner:{id} = true; apiKeys collection row exists with keyHash not equal to plaintext secret.
  - `rule` TR-9.2: Duplicate slug → HTTP 409, code=ORG_SLUG_CONFLICT; no document written.
  - `rubric` TR-9.3: Overall STUB→REAL progress AC-13; endpoint persists org + key + custom claims (contributes 1 of ≥ 16 rows needed; threshold met via accumulation).

---

## Task 10: Firestore rules integration tests (10+) + Tenant isolation HTTP tests
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5, Task 6
- **Description**:
  - Create `tests/firestore-rules.test.ts` — use `@firebase/rules-unit-testing` and load `firestore.rules` from repo root. Test each sub-collection: customers, plans, beneficiaries, guardians, claims, apiKeys, webhooks, auditEvents, webhookEvents, deadLetters = 10 sub-collections. Within each: correct-org read = ALLOW, correct-org write = ALLOW, cross-org read = DENY, cross-org write = DENY → 4 assertions each but only need ≥ 10 distinct passing cases.
  - Create `tests/tenant-isolation.test.ts` — run Next server (or use node-mocks-http to call route handlers directly with in-memory auth) and perform HTTP-level Org A vs B for 8 entity POSTs plus 8 GET enumerates → 16 HTTP tests total proving cross-org returns 403 and enumeration cross-read returns empty.
- **Acceptance Criteria Addressed**: AC-3, AC-14
- **Test Requirements**:
  - `rule` TR-10.1: ≥ 10 rules tests PASS, each individually asserting allow/deny per spec.
  - `rule` TR-10.2: ≥ 8 POST cross-forgery return 403 AND ≥ 8 GET cross-read return empty arrays.

---

## Task 11: G-01 Guardian identity proof implementation
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 9 (orgs persists guardians with fields), Task 10 (emulator tests running)
- **Description**:
  - Update Guardian schema + `POST /guardians` to accept optional `firebaseUid` (string) and `walletAddress` (checksum 0x…). Both nullable but at least one required per guardian row (enforced Zod).
  - Server-side nonce store: `/organizations/{orgId}/guardianNonces/{guardianId}` with 5-minute TTL; endpoint `GET /api/v1/claims/guardian-nonce?claimId=&guardianId=` issues single-use nonce (crypto.randomUUID) and stores it; subsequent calls rotate.
  - Rewrite `POST /api/v1/claims/transition`:
    - When `guardianId` + `guardianApproved` body fields set:
      - Fetch guardian doc.
      - Case firebaseUid set: require `auth.sub === guardian.firebaseUid` (meaning the caller JWT's Firebase user IS that guardian).
      - Case walletAddress set (and no firebaseUid, or both): require a body `guardianProof` = `{ signature, nonce, scheme='eip712'|'eth_sign' }`; recover address from signature over a typed data hash `keccak256(claimId + '|' + approved + '|' + nonce)` and verify recovered === guardian.walletAddress.
      - Nonce single-use consumption: after verify pass delete nonce doc; if nonce missing 5-min expired → reject 403 GUARDIAN_NONCE_EXPIRED.
      - Failure any case: 403 GUARDIAN_IDENTITY_PROOF_REQUIRED + increment securityEvents counter (document at `/organizations/{orgId}/securityEvents/{ts_uuid}`).
    - When identity passes → call existing `registerGuardianApproval` pure function; write claim back to Firestore via transaction (race-safe on concurrent approvals).
    - On quorum met → auto-transition claim from GUARDIAN_REVIEW → GRACE_PERIOD (legal per map) with actor=guardian-tally.
- **Acceptance Criteria Addressed**: AC-1, AC-15
- **Test Requirements**:
  - `rule` TR-11.1: 403 returned if guardianId=G1 firebaseUid=callerUB but caller's JWT sub=UB_OTHER (no match).
  - `rule` TR-11.2: Success path: firebaseUid match caller → approval recorded; claim.approvals[G1]=true.
  - `rubric` TR-11.3: Proof variants scale 1–5; 1=no variants, 3=firebaseUid only fully proven + wallet signatures schemas/nonces wired with at least 1 positive test; 5=both firebaseUid + wallet proofs have positive + negative tests. Threshold ≥ 3.

---

## Task 12: G-06 Webhook queue + delivery worker + dead letter
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 9, Task 5 (emulator)
- **Description**:
  - Add to `src/services/enterprise/webhook.ts`:
    - `enqueueForOrg(orgId, event, payload)`: writes webhookEvent doc to orgs/{orgId}/webhookEvents/ with `scheduledAt=now()`, `dedupeKey`, endpointId for each enabled endpoint subscribing to event.
    - `processDeliveryBatch(orgId, endpointId, {fetchImpl})`: fetches webhookEndpoint enabled flag + consecutiveFailures disable threshold; for pending events: fetches N (max 50 per run); for each attempts `fetch(url, {headers:{'ChainLegacy-Signature': signSignature(secret,JSON.stringify(body),t)}, ...})`; on success writes deliveredAt; on failure increments attempts, writes lastAttemptAt + httpStatus, schedules next with retryDelayMs; on 8th attempt moves doc to /webhookDeadLetters/ collection; after 5 consecutive fails for same endpoint sets endpoint.enabled=false + disabledAt.
  - Rewrite `POST /api/v1/webhooks/deliver` route (cron secret gated) to run processDeliveryBatch for every org-endpoint pair (paginate all orgs with endpoints).
  - Wire enqueueForOrg calls into each mutation endpoint: organizations, customers, plans, beneficiaries, guardians, liveness resets, claims create, claims transition, api keys create/revoke, webhooks updated.
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `rule` TR-12.1: mock fetch server returns 500 × 8; after 9th cron delivery run, webhookEvent in deadLetters, endpoint.enabled=false.
  - `rule` TR-12.2: Success 200 path → ChainLegacy-Signature header present and passes independent verifySignature call; tamper payload → verify returns false.
- **Notes**: Use `node-fetch`-compatible globalThis.fetch or Next built-in node fetch; no new packages.

---

## Task 13: Customer / Legacy Plans / Beneficiaries / Guardians / Liveness reset POSTs persistence + audit + webhook enqueue
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 9, Task 6, Task 12
- **Description**:
  - For each of 5 entity POST routes (customers, legacy-plans, beneficiaries, guardians, liveness reset POST):
    - Zod body schema parse.
    - assertOrgMatches (Task 6).
    - Idempotency check — see Task 15 first (wire idempotency after its implementation).
    - Firestore `adminDb.runTransaction`: generate id (`cust_`, `plan_`, `ben_`, `guard_`), set document under orgs/{orgId}/subcollection/{id} with server timestamps.
    - Beneficiaries additional: within a plan compute sum(shares) across existing + new; if > 100 return 400 BENEFICIARY_SHARES_OVERFLOW.
    - After write, EventService.logEvent(orgId, corresponding SystemEvent, { id, requestId, actor }) with redacted payload.
    - enqueueForOrg for corresponding webhook event.
    - Return structuredJson response with `data: { ...full entity without secrets }` + pagination meta.
  - GET endpoints: actually read from Firestore, apply status/customerId filters, return real docs (not hardcoded []).
- **Acceptance Criteria Addressed**: AC-13, AC-17
- **Test Requirements**:
  - `rule` TR-13.1: For each entity type, POST returns 200 with id matching stored document; GET returns array length 1 after insert.
  - `rubric` TR-13.2: Entity wiring breadth; scale 1–5 (1=1, 3=3, 5=5 all 5). Threshold = 5.
  - `rule` TR-13.3: Beneficiary sum shares >100 → 400 code BENEFICIARY_SHARES_OVERFLOW.

---

## Task 14: Claims create / transition / API keys create·list·revoke·rotate / Webhook endpoints POST·LIST → persistence + audit + webhook enqueue
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 11 (claims transition), Task 12 (enqueue), Task 6 (org guard), Task 9 (key rows from DB)
- **Description**:
  - Claims create → transactional create via ClaimEngine, audit = CLAIM_CREATED, enqueue = claim.created.
  - Claims transition → apply + identity proof (Task 11), audit CLAIM_TRANSITION / CLAIM_GUARDIAN_APPROVAL, enqueue claim.transition / claim.guardian_approval.
  - API keys create → ApiKeyService.create → persist row to org/apiKeys; audit API_KEY_CREATED; enqueue api_key.created; return secret only once.
  - API keys list → read from org/apiKeys, omit keyHash (already via listByOrg helper), return array.
  - API keys revoke (DELETE) → set revokedAt + disabled=true on doc; audit API_KEY_REVOKED; enqueue api_key.revoked; return {revoked:true, keyId}.
  - API keys rotate (if endpoint exists; else use PUT /api/v1/api-keys) → previousRevoked + new show-once secret per ApiKeyService.rotate; both docs written transactionally.
  - Webhook endpoints POST → create WebhookEndpoint; generate whsec_ signing secret show-once; audit WEBHOOK_UPDATED; enqueue (no webhook event about webhooks — avoid recursion).
  - Webhook endpoints GET → list org/webhooks; never return the signing secret.
  - Audit GET → actually query org/auditEvents paginated; apply EventService.redact to each raw doc before returning.
- **Acceptance Criteria Addressed**: AC-13
- **Test Requirements**:
  - `rule` TR-14.1: For each of 8 routes (claims create, claims transition, keys create, keys list, keys revoke, keys rotate, webhooks create, webhooks list + audit GET) a round-trip persistence test proves data stored/looked up correctly.
  - `rubric` TR-14.2: Routes passing; 1 = 1, 3 = 5, 5 = 9 all passing; threshold 4 (≥ 7 routes passing).
  - `rule` TR-14.3: api_keys list never contains keyHash; create response secret prefix matches clsbox_/clprod_ prefix environment.

---

## Task 15: Idempotency enforcement (stored + reused)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 9, Task 13, Task 14 (plugs into same handler chain)
- **Description**:
  - In `src/lib/v1-route.ts` handle flow, after rate-limiter (Task 7) before auth: if method ∈ {POST, PUT, PATCH} and `Idempotency-Key` header present ≤64 chars:
    - Compute storage id `sha256(auth.organizationId + '|' + idempotencyKey).hex`.
    - In transaction: read org/{orgId}/idempotency/{id} → if present with `createdAt > now-24h` → return cached.response (serialize original body + status + headers from cache JSON).
    - If absent → placeholder lock doc (prevents double-write race), proceed to handler; on response commit cache the response JSON.
    - If lock exists but handler running (race concurrent attempt) → 409 IDEMPOTENCY_CONFLICT (retry after short).
    - TTL field TTL 25h so stale records garbage collect.
- **Acceptance Criteria Addressed**: AC-16
- **Test Requirements**:
  - `rule` TR-15.1: 2 POSTs same key → same returned id; Firestore count == 1.
  - `rule` TR-15.2: 2 simultaneous in-flight with same non-cached key → 1 succeeds, 1 returns 409 IDEMPOTENCY_CONFLICT.

---

## Task 16: Final plumbing sweep + new test count ≥ 88 + typecheck + build clean
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1–15
- **Description**:
  - Sweep all 23 v1 endpoints and confirm for each: rate-limit runs, idempotency runs (if mutating), org guard runs (if mutating), scope validates, Zod body validates (if mutating), Firestore persistence runs (POST/PUT), logEvent runs, enqueueForOrg runs if event defined.
  - Patch any missing calls; fix leftover hardcoded `data: []` returns (should query Firestore; if truly empty still return [] from real query not literal).
  - Rerun `npm run typecheck && npm test && npx next build`.
  - Count vitest passing tests; if < 88 tests, add more coverage for routes skipped to push total up.
- **Acceptance Criteria Addressed**: AC-17, AC-18
- **Test Requirements**:
  - `rule` TR-16.1: `npm run typecheck → 0`, `npm test → PASS, ≥ 88 tests`, `next build → exit 0`.
  - `rubric` TR-16.2: Logging + middleware hygiene AC-18; scale 1–5 anchors per AC-18. Threshold ≥ 4. No plaintext otp in console lines at info level; EventService.redact applied to all structured detail objects; middleware.ts still zero firebase-admin top-level imports.
- **Notes**: Final comprehensive gate. Prepares repo for independent Review phase.
