# ChainLegacy Product Integration & Feature Completion — Audit Report

**Date:** 2026-09-17  
**Phase:** Enterprise Foundation v1 Complete → Product Integration Milestone

---

## 1. FEATURE MAP — API → Backend Service → Firestore → Frontend

### 1.1 Enterprise API Routes (All `/api/v1/*` — Server-admin only, scoped to org)

| Route | Method | Backend Service | Firestore Collection | Scope | Frontend |
|-------|--------|-----------------|---------------------|-------|----------|
| `/api/v1/organizations` | GET/POST | `persistence.ts` + `domain-model.ts` | `organizations` | `organizations:read/write` | **SIMULATION** |
| `/api/v1/customers` | GET/POST | `persistence.ts` + `domain-model.ts` | `organizations/{org}/customers` | `customers:read/write` | **SIMULATION** (customers page) |
| `/api/v1/customers/{id}/vault` | GET/POST | `domain-model.ts` (createVaultForCustomer) | `organizations/{org}/vaults` | `vaults:read/write` | ❌ No UI |
| `/api/v1/customers/{id}/verification` | POST | `domain-model.ts` (startIdentityVerification) + `identity-verification.ts` | `organizations/{org}/customers` (verificationStatus) | `customers:write` | ❌ No UI |
| `/api/v1/customers/{id}/verification/complete` | POST | `domain-model.ts` (completeIdentityVerificationFromProvider) | `organizations/{org}/customers` | `customers:write` | ❌ No UI |
| `/api/v1/legacy-plans` | GET/POST | `persistence.ts` + `domain-model.ts` | `organizations/{org}/legacyPlans` | `legacy_plans:read/write` | **SIMULATION** (plans page) |
| `/api/v1/beneficiaries` | GET/POST | `persistence.ts` + `domain-model.ts` | `organizations/{org}/beneficiaries` | `beneficiaries:read/write` | **SIMULATION** (beneficiaries page) |
| `/api/v1/guardians` | GET/POST | `persistence.ts` + `domain-model.ts` | `organizations/{org}/guardians` | `guardians:read/write` | **SIMULATION** (guardians page) |
| `/api/v1/claims` | GET/POST | `persistence.ts` + `claim-engine.ts` | `organizations/{org}/claims` | `claims:read/manage` | **SIMULATION** (claims page) |
| `/api/v1/claims/transition` | POST | `guardian-identity.ts` + `claim-engine.ts` | `organizations/{org}/claims` | `claims:manage` | ❌ No UI |
| `/api/v1/claims/authorize` | POST | `claim-authorization.ts` + `domain-model.ts` | `organizations/{org}/claims` | `claims:manage` | ❌ No UI |
| `/api/v1/api-keys` | GET/POST | `organization.ts` + `persistence.ts` | `organizations/{org}/apiKeys` | `api_keys:read/write` | **SIMULATION** (api-keys page) |
| `/api/v1/webhooks` | GET/POST | `webhook.ts` + `persistence.ts` | `organizations/{org}/webhookEndpoints` | `webhooks:manage` | **SIMULATION** (webhooks page) |
| `/api/v1/audit` | GET | `persistence.ts` | `organizations/{org}/auditEvents` | `audit:read` | **SIMULATION** (audit page) |
| `/api/v1/liveness` | GET/POST | `liveness.ts` | `organizations/{org}/legacyPlans` | `liveness:read/write` | **SIMULATION** (liveness page) |
| `/api/v1/vaults` | GET/POST | `persistence.ts` | `organizations/{org}/vaults` | `vaults:read/write` | ❌ No UI |

### 1.2 Consumer API Routes (Legacy — `/api/claim/*`)

| Route | Method | Purpose | Frontend |
|-------|--------|---------|----------|
| `/api/claim/access` | POST | verify-identity, verify-otp, simulate-approval | ClaimClient.tsx (steps 1,4,5) |
| `/api/claim/generate-otp` | POST | Issue OTP for vault owner | ClaimClient.tsx (step 4) |
| `/api/claim/access/enterprise` | POST | Enterprise claim authorization | ❌ Not connected |
| `/api/claim/generate-otp/enterprise` | POST | Enterprise OTP for customer | ❌ Not connected |
| `/api/claim/verification/start` | POST | Start identity verification | ❌ Not connected |

### 1.3 Consumer Frontend Pages

| Page | Path | Status | Backend Connection |
|------|------|--------|-------------------|
| Dashboard | `/dashboard` | **FULL** | Firebase `users/{uid}` + `vaults/{uid}` (client-side listeners) |
| Vault Setup | `/dashboard/setup` | **FULL** | Firebase `users/{uid}` + `vaults/{uid}` (writes both) |
| Claim Flow | `/claim/[id]` | **FULL** | `/api/claim/access` + `/api/claim/generate-otp` (server) |
| Claim Client | `/claim/[id]/ClaimClient.tsx` | **FULL** | Consumer APIs only |

### 1.4 Enterprise Frontend Pages — ALL SIMULATION

| Page | Path | Stats | CTA | Backend |
|------|------|-------|-----|---------|
| Overview | `/enterprise/overview` | Hardcoded demo | Create Customer, Launch Pilot | `/api/v1/customers` exists but not called |
| Customers | `/enterprise/customers` | Hardcoded | + Add Customer, Bulk Import | `/api/v1/customers` exists but not called |
| Plans | `/enterprise/plans` | Hardcoded | + Create Plan | `/api/v1/legacy-plans` exists but not called |
| Beneficiaries | `/enterprise/beneficiaries` | Hardcoded | + Add Beneficiary | `/api/v1/beneficiaries` exists but not called |
| Guardians | `/enterprise/guardians` | Hardcoded (HIGH GAP noted) | + Invite Guardian | `/api/v1/guardians` exists but not called |
| Claims | `/enterprise/claims` | Hardcoded | + Create Claim | `/api/v1/claims` + `/api/v1/claims/transition` exist but not called |
| API Keys | `/enterprise/api-keys` | Hardcoded | + Create Sandbox/Prod Key | `/api/v1/api-keys` exists but not called |
| Webhooks | `/enterprise/webhooks` | Hardcoded | + Add Endpoint | `/api/v1/webhooks` exists but not called |
| Audit | `/enterprise/audit` | Hardcoded | Export CSV, Stream to SIEM | `/api/v1/audit` exists but not called |
| Liveness | `/enterprise/liveness` | Hardcoded | N/A | `/api/v1/liveness` exists but not called |
| Security | `/enterprise/security` | Hardcoded | Rotate secrets | ❌ No API |
| Settings | `/enterprise/settings` | Hardcoded | Save Settings | ❌ No API |

### 1.5 Backend Services (Core)

| Service | File | Key Functions |
|---------|------|---------------|
| Domain Model | `domain-model.ts` | Customer↔Vault↔Plan assertions, verification status, org/customer isolation |
| Identity Verification | `identity-verification.ts` | `IdentityVerificationProvider`, `MockIdentityProvider`, provider abstraction |
| Claim Engine | `claim-engine.ts` | 9-state machine, guardian quorum, legal transitions |
| Claim Authorization | `claim-authorization.ts` | Full flow: PENDING→VERIFICATION→GUARDIAN_REVIEW→GRACE_PERIOD→APPROVED→COMPLETED |
| Guardian Identity | `guardian-identity.ts` | Nonce, proofs (firebase_uid_match, eip712, eth_sign), quorum |
| Persistence | `persistence.ts` | Firestore CRUD, transactions, id prefixes |
| Webhook | `webhook.ts` | HMAC-SHA256, delivery, retry, dead-letter |
| Organization | `organization.ts` | API keys, scopes, SHA-256 hashing |
| Rate Limiter | `rate-limiter.ts` | Per-key/org, cron exempt |
| Idempotency | `idempotency.ts` | Key-based deduplication |
| Encryption | `encryption.ts` | AES-256-GCM, Argon2id, Shamir |

---

## 2. GAP ANALYSIS

### 2.1 Critical Disconnections (Enterprise Frontend → Backend)

| Feature | API Exists | Frontend Status | Gap |
|---------|------------|-----------------|-----|
| Customer Management | ✅ GET/POST `/api/v1/customers` | SIMULATION table | No list/create UI |
| Vault Creation | ✅ POST `/api/v1/customers/{id}/vault` | ❌ No UI | No vault management |
| Identity Verification | ✅ POST `/api/v1/customers/{id}/verification` | ❌ No UI | No verification flow |
| Legacy Plans | ✅ GET/POST `/api/v1/legacy-plans` | SIMULATION table | No list/create UI |
| Beneficiaries | ✅ GET/POST `/api/v1/beneficiaries` | SIMULATION table | No list/create UI |
| Guardians | ✅ GET/POST `/api/v1/guardians` | SIMULATION (HIGH GAP) | No list/create UI |
| Claims | ✅ GET/POST `/api/v1/claims` | SIMULATION table | No list/transition UI |
| Claim Authorization | ✅ POST `/api/v1/claims/authorize` | ❌ No UI | No enterprise claim flow |
| API Keys | ✅ GET/POST `/api/v1/api-keys` | SIMULATION | No list/create UI |
| Webhooks | ✅ GET/POST `/api/v1/webhooks` | SIMULATION | No list/create UI |
| Audit | ✅ GET `/api/v1/audit` | SIMULATION | No list/export UI |

### 2.2 Consumer ↔ Enterprise Convergence

| Area | Consumer | Enterprise | Status |
|------|----------|------------|--------|
| Data Model | `users/{uid}` + `vaults/{uid}` | `organizations/{org}/customers` + `vaults` | **Divergent** (Phase 1.1 migration script exists) |
| Claim Flow | `/api/claim/access` (3 steps) | `/api/v1/claims/authorize` (5+ steps) | **Divergent** |
| OTP | `/api/claim/generate-otp` | `/api/claim/generate-otp/enterprise` | **Divergent** |
| Identity Verification | Client-side name/email match | Server-owned `MockIdentityProvider` | **Divergent** |
| Guardian Approval | `simulate-approval` (demo) | `guardian-identity.ts` proofs + quorum | **Divergent** |

### 2.3 Missing Functionality for Current Product Flow

1. **Customer→Vault→Plan Creation UI** — Enterprise users can't onboard customers
2. **Identity Verification Flow UI** — No way to start/complete verification
3. **Enterprise Claim Flow** — No UI for the new authorization engine
4. **Guardian Proof UI** — No wallet/EIP712 signature collection for guardians
5. **Beneficiary Management UI** — No add/edit/list for enterprise
6. **Plan Configuration UI** — No guardian quorum, encryption config UI
6. **Audit Export/Stream** — No CSV/SIEM integration
7. **Settings Persistence** — No org settings save

---

## 3. IMPLEMENTATION PRIORITY (Per Milestone Rules)

### Phase B: Connect Enterprise Frontend → Existing APIs (Highest Value)
**Target:** Replace all SIMULATION pages with real data + mutations

### Phase C: Build Missing Frontend Features for Existing APIs
**Target:** Customer/Vault/Plan/Beneficiary/Guardian management UI

### Phase D: Connect Consumer Flows to Canonical Backend
**Target:** Migrate `/api/claim/access` to use canonical `/api/v1/claims/authorize` + migration script

### Phase E: Resolve Duplicates
**Target:** Single claim authorization system, single verification system

---

## 4. SECURITY-SENSITIVE AREAS (Must Preserve)

- ✅ Server-owned verification status (client can only start PENDING)
- ✅ Guardian quorum + nonce + proofs (eip712, eth_sign, firebase_uid_match)
- ✅ Organization/customer isolation (all queries scoped to orgId)
- ✅ API key SHA-256 hashing, scopes
- ✅ Webhook HMAC-SHA256 + replay tolerance
- ✅ Idempotency keys
- ✅ Rate limiting (cron exempt)
- ✅ AES-256-GCM + Argon2id + Shamir encryption
- ✅ Audit redaction (15 keys)

---

## 5. NEXT STEPS

**Phase B Implementation Order:**
1. `/enterprise/customers` — Connect to `/api/v1/customers` (list + create)
2. `/enterprise/customers/[id]/vault` — Connect to `/api/v1/customers/{id}/vault`
3. `/enterprise/customers/[id]/verification` — Connect to verification APIs
4. `/enterprise/plans` — Connect to `/api/v1/legacy-plans`
5. `/enterprise/beneficiaries` — Connect to `/api/v1/beneficiaries`
6. `/enterprise/guardians` — Connect to `/api/v1/guardians` + fix HIGH GAP
7. `/enterprise/claims` — Connect to `/api/v1/claims` + `/api/v1/claims/authorize`
8. `/enterprise/api-keys` — Connect to `/api/v1/api-keys`
9. `/enterprise/webhooks` — Connect to `/api/v1/webhooks`
10. `/enterprise/audit` — Connect to `/api/v1/audit`
11. `/enterprise/overview` — Real stats from APIs

**Then Phase C/D/E...**