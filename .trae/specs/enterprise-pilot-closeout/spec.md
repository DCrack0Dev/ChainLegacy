# ChainLegacy Enterprise Pilot — Final Security Close-Out
## SPECIFICATION PHASE (Spec Mode, v1.0) — 2026-09-14

### 1. Problem
Previous 15-phase independent validation classified ChainLegacy as **CLASS C — READY FOR CONTROLLED ENTERPRISE PILOT** subject to closing 5 remaining explicitly enumerated blocker items. Validation flagged concrete code defects and missing integration evidence in B-1 through B-8. Before contacting the first African Web3 enterprise pilot prospect, all 5 items must be closed, tested, the full regression suite run, and a new honest readiness classification produced. No fake success, no weakened controls, no mock-only evidence.

### 2. Users & Goals
- **Users:** Senior security/backend/QA engineers (us) validating pre-pilot infrastructure; then the first African Web3 pilot partner engineering team (sandbox clsbox_ only).
- **Goals:** Close all 5 blockers; add tests that exercise real pipelines not just unit fixtures; run full 19-gate regression; produce honest final classification A/B/C/D; produce top-5 pre-pilot actions.
- **Non-goals:** Consumer features / UI / mobile / pricing / marketing; force-upgrade breaking admin SDK; remove valid variable names to make secret greps look clean; weaken Firestore rules to pass tests.

### 3. Scope — The Five Required Close-Out Items
```
B-8 REAL WEBHOOK DELIVERY E2E           ← missing real-HTTP proof (10/10 unit only)
B-1 GUARDIAN CROSS-TENANT ISOLATION    ← collectionGroup('guardians') without orgId in query, only post-load check
B-3 REMOVE ownerUid BODY TRUST         ← (body as any).ownerUid ?? 'unknown-onboard' when auth != firebase
B-2 WEBHOOK URL MUST REQUIRE HTTPS     ← Zod url() accepts http://example.com
B-4 DEPENDENCY SECURITY                ← 19 vulns (1 crit uuid trans firestore-admin; 2 high gaxios, retry-request)
```

### 4. Functional Requirements (FR)

#### FR-B-2 Webhook HTTPS-only URL schema validation
- FR-B-2.1 At Zod boundary `WebhookEndpointCreateSchema.url`:
  - ACCEPT `https://*` always.
  - ACCEPT `http://localhost:*` and `http://127.0.0.1:*` (local dev/E2E tests only).
  - REJECT any other `http://` (including 10.x, 172.16.x, 192.168.x, hostname example.com without TLS).
  - REJECT malformed URLs cleanly; never expose internal stack.
- FR-B-2.2 Add unit tests covering at least: 4 PASS URLs, 5 FAIL URLs.

#### FR-B-3 Organization onboarding ownerUid from authenticated identity only
- FR-B-3.1 POST /api/v1/organizations handler:
  - IF `auth.method !== 'firebase'` → throw `ApiError(401, 'AUTH_REQUIRED', 'Organization onboarding requires authenticated owner session')`.
  - ELSE derive `ownerUid = auth.uid` ALWAYS.
  - NEVER read `request.body.ownerUid`. Value in body (if present) MUST be ignored.
- FR-B-3.2 Mapping `ownerUidToOrgId/<uid>` uses `auth.uid`; batch writes remain identical structure but with ownerUid = auth.uid.
- FR-B-3.3 clsbox_ default sandbox key generation and lifecycle preserved unchanged.
- FR-B-3.4 Add onboarding tests:
  - (a) firebase uid=A + body.ownerUid=B → organization.ownerUid === A (B ignored)
  - (b) api_key auth → 401
  - (c) no auth → 401
  - (d) normal firebase onboarding → success
  - (e) after success, ownerUidToOrgId mapping points to new org for uid A
  - (f) default sandbox key returned with clsbox_ prefix onetime-show secret

#### FR-B-1 Guardian & GuardianNonce cross-tenant isolation (explicit org-scoped lookup)
- FR-B-1.1 GuardianStore implementations must accept organizationId as a parameter in load:
  - New interface `GuardianStore.load(guardianId: string, orgId: string): Promise<Guardian | null>`
  - Implementations MUST query tenant-scoped collection `organizations/{orgId}/guardians` with where id==guardianId and limit 1.
  - MUST NOT use global `collectionGroup` query for guardian lookup in real Firestore implementations.
- FR-B-1.2 GuardianNonceStore similarly:
  - New interface `load(guardianId, nonce, orgId)`; `markConsumed(guardianId, nonce, orgId)`
  - Query path: `organizations/{orgId}/guardianNonces` + where clauses.
  - MUST NOT use collectionGroup for nonces.
  - In-memory implementations (tests) also take orgId and scope internally.
- FR-B-1.3 verifyGuardianProof signature accepts `orgId` (already does) and passes orgId to `guardians.load(id, orgId)`.
  - Additionally add explicit assertion: after load → `if (guardian.organizationId !== orgId)` → code TENANT_MISMATCH / GUARDIAN_IDENTITY_PROOF_REQUIRED 403. This becomes redundant defense-in-depth after FR-B-1.1 but still required.
- FR-B-1.4 All routes instantiating FsGuardians / FirestoreGuardianStore / FsGuardianNonces / FirestoreGuardianNonceStore must pass organizationId:
  - claims/transition/route.ts FsGuardians.FsGuardianNonces
  - guardians/[guardianId]/nonce/route.ts FirestoreGuardianStore.FirestoreGuardianNonceStore
- FR-B-1.5 Add attack tests (B-1 Test1-5):
  - T1: Org A creates Guardian A-id. Org B uses same guardianId string → verifyGuardianProof returns ok=false TENANT_MISMATCH/GUARDIAN_IDENTITY_PROOF_REQUIRED 403 equivalent.
  - T2: Org B uses valid nonce issued for Org A → fails with nonce invalid / org mismatch.
  - T3: Org A's valid guardian proof → success.
  - T4: Identical guardianId strings created under 2 different orgs — each org sees only its own; cross-org use fails.
  - T5: Replayed nonce across orgs fails.

#### FR-B-8 Real Webhook Delivery E2E via actual local Node HTTP listener
- FR-B-8.1 New integration test `tests/webhook-real-e2e.test.ts` using only Node built-ins (`import * as http from 'node:http'`, `createHmac/timingSafeEqual from node:crypto`) — NO new dependencies.
- FR-B-8.2 Architecture:
  - Start local HTTP server on random free port.
  - Use persistence layer to create a real `WebhookEndpoint` with url `http://127.0.0.1:<port>/webhook` (this is local test ONLY — B-2 policy allows 127.0.0.1 http).
  - Enqueue a real `DeliveryRow` via `enqueueForOrg` with payload + signed header.
  - Call `processDeliveryBatch` with `DEFAULT_FETCHER` (real fetch, no mock).
  - Listener captures raw body Buffer, exact headers, status 200 returned by listener.
- FR-B-8.3 Test assertions (independent, NOT using verifySignature helper):
  - HTTP 2xx received by listener
  - Raw body preserved exactly (byte-for-byte compare)
  - Header `chainlegacy-signature` present, format `t=<ts>,v1=<hex>`
  - Independently compute expected HMAC = `HMAC-SHA256(whsec_secret, \`${t}.${rawBodyAsString}\`)` → compare using `timingSafeEqual` → PASS
  - Event IDs, org IDs, payload object fields match
  - Tamper 1 byte in raw body → expected signature no longer matches → REJECT
  - Old timestamp ts beyond tolerance → our verify code rejects (unit within test)
- FR-B-8.4 Always close listener and server in afterEach/finally even on test throw. Never leave open port.
- FR-B-8.5 Print explicit banner PASS lines:
  ```
  REAL WEBHOOK DELIVERY: PASS
  HTTP RECEIVED: PASS
  SIGNATURE INDEPENDENTLY VERIFIED: PASS
  TAMPER REJECTED: PASS
  EXPIRED TIMESTAMP REJECTED: PASS
  ```
  via `console.log` inside test (allowed in test fixtures).

#### FR-B-4 Dependency security — safe non-breaking remediation with documentation
- FR-B-4.1 Execute `npm audit fix --no-force --no-fund` exactly once at start of implement phase.
  - NEVER `--force`.
- FR-B-4.2 After fix, run full `npm audit --production` → capture new exact counts.
- FR-B-4.3 For every remaining HIGH/CRITICAL:
  - package, vulnerable version, full dependency chain.
  - production runtime code? path reachable from API user input?
  - patched upstream version available?
  - why can't we upgrade (compatibility pins)?
  - concrete mitigation (inbound firewall rule / reach-denied evidence).
  - planned upgrade milestone/tag
- FR-B-4.4 Update `SECURITY_DEPENDENCY_REVIEW.md` with new counts and evidence; classify remaining unreachable vulns as `UPSTREAM / NOT REMEDIATED` never as `FIXED`; never falsely "safe because inconvenient".

### 5. Non-Functional Requirements (NFR)
- NFR-1 Zero STUB endpoints: every 25 v1 endpoints MUST remain REAL after changes. Route reality pass.
- NFR-2 Backward compatibility: no existing test breakage from fixes. If InMemoryGuardianStore interface changes → update guardian-identity.test.ts and tenant isolation tests.
- NFR-3 Full suite green: tsc 0; npm test 136+ PASS; test:emulator 75+ PASS; build exit 0; exact counts recorded.
- NFR-4 Git hygiene: no `.env` secrets committed; no debug logs in prod paths; no clsbox_/whsec_ credentials; `git status --short` should only show src/ + tests/ + docs/ + 3 markdown reports changed.
- NFR-5 Documentation:
  - `ENTERPRISE_PILOT_READINESS_REPORT.md`: update final classification honest; document B-1/B-2/B-3/B-4/B-8 as NOW RESOLVED with evidence; remove from blockers; re-assess.
  - `SECURITY_DEPENDENCY_REVIEW.md`: update post-audit-fix; remaining HIGH/CRIT with UPSTREAM/NOT REMEDIATED classification.
  - `docs/ENTERPRISE_INTEGRATION_GUIDE.md`: add HTTPS webhook URL policy clarification; remove mention of body.ownerUid in onboarding section.

### 6. Constraints, Dependencies, Assumptions, Open Questions
- **Constraints:** No new npm dependencies (B-8 uses Node built-ins http/crypto only); no --force upgrades; never weaken security; never fake success evidence.
- **Dependencies:** Existing vitest, zod, firebase-admin, viem; local firewall allowing 127.0.0.1:random for B-8 listener.
- **Assumptions:** Vitest config allows Node built-ins in tests (webhook-real-e2e.test.ts will run under vitest default project, not emulator project). DEFAULT_FETCHER works with 127.0.0.1 URLs in test environment.
- **Open questions:** None. All 5 items have concrete paths.

### 7. Acceptance Criteria
Every AC below is typed as `rule` (objective binary) or `rubric` (evaluative with threshold).

#### AC-B-2 — Webhook URL HTTPS policy
- AC-B-2.1 `rule`: `WebhookEndpointCreateSchema.safeParse(url=https://example.com/webhook).success === true`
- AC-B-2.2 `rule`: `WebhookEndpointCreateSchema.safeParse(url=http://127.0.0.1:8080/w).success === true`; `localhost:3000` ok
- AC-B-2.3 `rule`: http://example.com/w, http://evil.com, http://192.168.1.10/w, http://10.0.0.1/w, http://172.16.0.1/w → ALL Zod safeParse success === false
- AC-B-2.4 `rule`: tsc exit 0 after schema changes.
- AC-B-2.5 `rule`: Full npm test suite PASS (no regress).

#### AC-B-3 — Organization onboarding ownerUid auth only
- AC-B-3.1 `rule`: Firebase auth uid=A + body.ownerUid=B → returned organization's persisted ownerUid === A; B never stored.
- AC-B-3.2 `rule`: API-key auth hitting POST /api/v1/organizations → ApiError(401, AUTH_REQUIRED) with correct message.
- AC-B-3.3 `rule`: No/anonymous auth → 401.
- AC-B-3.4 `rule`: Normal firebase onboarding still produces organization + defaultSandboxKey.secret starts with `clsbox_`.
- AC-B-3.5 `rule`: ownerUidToOrgId/`${auth.uid}` doc created with correct uid.
- AC-B-3.6 `rule`: All org-onboarding tests + tenant-isolation tests continue PASS.

#### AC-B-1 Guardian cross-tenant isolation
- AC-B-1.1 `rule`: GuardianStore.load interface has `(id, orgId)` signature; FirestoreGuardianStore uses collection `organizations/<orgId>/guardians` NO collectionGroup.
- AC-B-1.2 `rule`: GuardianNonceStore.load/markConsumed signatures accept orgId; Firestore impl queries org-scoped path.
- AC-B-1.3 `rule`: Same guardianId string under org A vs B; org B trying org A's guardian proof → verifyGuardianProof ok=false code GUARDIAN_IDENTITY_PROOF_REQUIRED/TENANT_MISMATCH.
- AC-B-1.4 `rule`: Same for nonces — org B uses org A nonce → nonce invalid/org mismatch.
- AC-B-1.5 `rule`: Explicit defense-in-depth assertion `guardian.organizationId !== orgId → 403` still present and reached.
- AC-B-1.6 `rule`: guardian-identity 10 tests + tenant-isolation 17 tests ALL still PASS after interface signature updates.
- AC-B-1.7 `rule`: claims/transition and guardians/nonce routes compile (tsc 0) and pass.

#### AC-B-8 Real Webhook E2E
- AC-B-8.1 `rule`: `tests/webhook-real-e2e.test.ts` exists; uses `import http from 'node:http'` — NO new npm deps.
- AC-B-8.2 `rule`: Test prints/contains banner strings: REAL WEBHOOK DELIVERY: PASS, HTTP RECEIVED: PASS, SIGNATURE INDEPENDENTLY VERIFIED: PASS, TAMPER REJECTED: PASS, EXPIRED TIMESTAMP REJECTED: PASS.
- AC-B-8.3 `rule`: HMAC verification is INDEPENDENT (calls `createHmac` + `timingSafeEqual` directly — does not import `verifySignature` helper to verify itself).
- AC-B-8.4 `rule`: Tamper test — flip 1 byte → independent verify returns boolean false.
- AC-B-8.5 `rule`: Old ts tolerance test → our verify (can use verifySignature here) returns false.
- AC-B-8.6 `rule`: Server always closed in afterEach/finally; no hanging handles.
- AC-B-8.7 `rule`: Process does not leak async handles; vitest run exit clean.

#### AC-B-4 Dependency security
- AC-B-4.1 `rule`: `npm audit fix --no-force --no-fund` successfully ran; package-lock.json updated; tsc 0; tests 211/211 PASS; build exit 0.
- AC-B-4.2 `rule`: post-fix exact audit counts documented; CRITICAL/HIGH paths listed with reachable? y/n + mitigation.
- AC-B-4.3 `rule`: Remaining unreachable CRIT/HIGH marked explicitly `UPSTREAM / NOT REMEDIATED` in SECURITY_DEPENDENCY_REVIEW.md — never `FIXED`.
- AC-B-4.4 `rubric`: Dependency vulnerability reachability review quality (0-2). 2 = every CRIT/HIGH has concrete reachability evidence + upgrade path. 1 = most documented. Pass threshold ≥ 2.

#### AC-REGRESSION Full Validation Suite (19 gates)
- AC-REG-1 `rule`: `npm run typecheck` → exit 0.
- AC-REG-2 `rule`: `npm test` → all PASS (count ≥ 136).
- AC-REG-3 `rule`: `npm run test:emulator` → all PASS (count ≥ 75 including firestore rules 21).
- AC-REG-4 `rule`: `npm run build` → exit 0.
- AC-REG-5 `rule`: `npm audit --production` exact counts recorded.
- AC-REG-6 `rule`: `git status --short` shows only source files, tests, docs, 3 reports; no `.env`, no `*.key`, no credentials.
- AC-REG-7 `rule`: Full tree secret grep for 14 dangerous literal patterns → 0 real credential matches (doc/type references OK, examples in GUIDE with placeholders OK).
- AC-REG-8 `rule`: Route reality recheck → 0 STUB across all enterprise-critical; all routes authenticate→authorize→validate→tenant→persist→audit→enqueue→return real data.
- AC-REG-9 `rule`: Tenant attack matrix all cross-org POST/GET → 403 TENANT_MISMATCH or equiv.
- AC-REG-10 `rule`: API key lifecycle tests show-once; list returns no keyHash/salt; revoked/rotated fail; cross-org fail; clsbox_ prefix sandbox.
- AC-REG-11 `rule`: Idempotency: same-key+same body cached; same-key+diff body 409.
- AC-REG-12 `rule`: Claim lifecycle: quorum=0 → threshold Math.max(1, threshold) prevents auto-approve.
- AC-REG-13 `rule`: Webhook security: HMAC + timestamp; HTTPS enforced prod; real listener E2E PASS.
- AC-REG-14 `rule`: Liveness: interval from persisted plan; missing → 404.
- AC-REG-15 `rule`: Audit GET returns real persisted events; no hardcoded [].
- AC-REG-16 `rule`: Firestore rules 21 emulator assertions ALL denied.
- AC-REG-17 `rule`: Auth (firebase/key/cron) unit + integration green; enterprise pages anon 302→/login.
- AC-REG-18 `rule`: Production config: env-only secrets; vercel.json cron present; CSP/HSTS middleware green.
- AC-REG-19 `rubric`: Final classification honesty (0-2). 2 = classification matches evidence; no overclaim (C without E2E listener closed). 1 = minor overclaim. Pass threshold ≥ 2.

### 8. Evidence Produced
At Close-out end:
1. Final 8 deliverable items per mandate: exact test counts, exact build, exact audit, endpoint table updated (0 STUB), security findings, remaining blockers, final classification A/B/C/D, 5 pre-prospect actions (or empty if all closed).
2. Files: `spec.md` (this), `tasks.md`, `review.md`, updated SECURITY_DEPENDENCY_REVIEW, updated docs/ENTERPRISE_INTEGRATION_GUIDE, updated ENTERPRISE_PILOT_READINESS_REPORT.
3. Source changes in `src/types/enterprise.ts`, `src/app/api/v1/organizations/route.ts`, `src/services/enterprise/guardian-identity.ts`, `src/app/api/v1/claims/transition/route.ts`, `src/app/api/v1/guardians/[guardianId]/nonce/route.ts`, new `tests/webhook-real-e2e.test.ts`, updated guardian-identity.test.ts/org-onboarding.test.ts/webhook-delivery.test.ts as needed for interface signatures.
