# ChainLegacy Enterprise API — Enterprise Integration Guide
v1.0 — 2026-09-14

Target audience: African Web3 company (exchange/wallet/fintech/bank/insurer/estate-firm) integration
technical team.

Tagline: Don't build an inheritance system. Integrate one.

---

## 1. Overview

ChainLegacy Enterprise provides a Web3 digital inheritance infrastructure you plug into.
Multi-tenant REST API → your org → API keys → your customers → legacy plans → beneficiaries → guardians → claims → shared engine (liveness / webhooks / audit) → Firestore.

Base URLs:
- Sandbox (pilot-sandbox.chainlegacy.example.com/api/v1
- Production — by invite only after pilot: enterprise.chainlegacy.example.com/api/v1

Authentication is bearer tokens. Idempotency via `Idempotency-Key: <up to 64 chars> header for POST/PATCH.
Pagination via `?page=1&pageSize=25`.

---

## 2. Create Organization (pilot onboarding only)

```
curl -X POST https://SANDBOX_BASE/api/v1/organizations \
  -H "Authorization: Bearer YOUR_FIREBASE_ADMIN_OR_JWT_OR_DEMO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '
    "name": "Example Fintech Uganda Ltd",
    "slug": "example-fintech-ug",
    "country": "UGA",
    "ownerUid": "firebase_uid_of_your_admin_user_123",
    "contactEmail": "engineering+chainlegacy@example-fintech.com",
    "webhookSecret": null,
    "website": "https://example-fintech.ug",
    "status": "trial"
  }'
```

Response 201:

```json
{
  "organizationId": "org_xxx",
  "organization": { ... },
  "defaultSandboxKey": {
    "id": "k_xxx",
    "name": "Default sandbox key",
    "scopes": ["...11 scopes"],
    "secret": "clsbox_xxxxxxxxxxxx_SHOW_ONCE_xxxxxxxxxx",
    "note": "Store the secret now. It will never be returned again."
  }
}
```

Prefix rules:
- `clsbox_` = sandbox. Usepilot-sandbox only. Not accepted on production.
- `clprod_` = production. Not issued after enterprise contract signing.

Scope list: `customers:read`, `customers:write`, `legacy_plans:read`, `legacy_plans:write`, `beneficiaries:read`, `beneficiaries:write`, `guardians:read`, `guardians:write`, `liveness:read`, `liveness:write`, `claims:read`, `claims:manage`, `webhooks:manage`, `audit:read`, `api_keys:read`, `api_keys:write`.

---

## 3. Auth with API Key

```
curl -X GET https://SANDBOX_BASE/api/v1/customers?pageSize=10 \
  -H "Authorization: Bearer clsbox_xxxxxxxxxxxxxx"
```

OR:

```
-H "X-API-Key: clsbox_xxxxxxxxxx"
```

---

## 4. Create Customer

```
curl -X POST https://SANDBOX_BASE/api/v1/customers \
  -H "Authorization: Bearer clsbox_xxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: my-tx-2026-09-14-A" \
  -d '{
    "organizationId": "org_xxxx",
    "partnerCustomerId": "your-platform-user-id-42",
    "customerEmail": "client@example.ug",
    "fullName": "Nnalub",
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "phone": "+256700xxxx"
  }'
```

Returns customer object with `id: cust_...`. Customer is the main identity object you map your partnerCustomerId against.

---

## 5. Create Legacy Plan

```
curl -X POST https://SANDBOX_BASE/api/v1/legacy-plans \
  -H "Authorization: Bearer clsbox_xxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: plan-42" \
  -d '{
    "organizationId": "org_xxxx",
    "customerId": "cust_xxxx",
    "name": "Primary Multisig Vault Plan",
    "description": "Primary cold wallet inheritance for client 42",
    "intervalDays": 45,
    "guardianQuorum": 2,
    "walletSignatureRequired": true
  }'
```

intervalDays=45 → client must check in every 45 days.
guardianQuorum=2 → claims require 2 distinct guardian approvals.

---

## 6. Add Beneficiary

```
curl -X POST https://SANDBOX_BASE/api/v1/beneficiaries \
  -H "Authorization: Bearer clsbox_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org_xxxx",
    "customerId": "cust_xxxx",
    "legacyPlanId": "plan_xxxx",
    "fullName": "Kirabo",
    "share": 50,
    "walletAddress": "0xAbCDef..."
  }'
```

Sum of shares per customer+plan is validated server-side.
`> 100% → BENEFICIARY_SHARES_OVERFLOW 400.

---

## 7. Add Guardian

```
curl -X POST https://SANDBOX_BASE/api/v1/guardians \
  -H "Authorization: Bearer clsbox_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org_xxxx",
    "customerId": "cust_xxxx",
    "legacyPlanId": "plan_xxxx",
    "fullName": "Auntie J",
    "relationship": "Family Lawyer",
    "firebaseUid": "firebase:person_uid_or_wallet:
    "walletAddress": "0xWALLET_ADDR",
    "email": "auntiej@example.ug"
  }'
```

Guardian identity proof schemes:
- `firebase_uid_match` — Firebase user session
- `eth_sign`/`eip712` — wallet

---

## 8. Liveness Check-In (Customer

```
curl -X POST https://SANDBOX_BASE/api/v1/liveness \
  -H "Authorization: Bearer clsbox_xxx" \
  -H "Content-Type: application/json" \
  -d '{ "legacyPlanId": "plan_xxx" }'
```

24hr before nextEscalationAt is pushed forward by intervalDays automatically.
Check every customer.
Check GET /api/v1/liveness?legacyPlanId=plan_xxx for status.

---

## 9. Claim Flow

9.1 Initiate claim:

```
curl -X POST https://SANDBOX_BASE/api/v1/claims \
  -H "Authorization: Bearer clsbox_xxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: claim-42" \
  -d '{
    "organizationId": "org_xxxx",
    "customerId": "cust_xxxx",
    "legacyPlanId": "plan_xxxx",
    "initiator": "system:trigger or guardianId",
    "reason": "Client deceased per death cert ref ZZ9"
  }'
```

9.2 Guardian issues nonce:

```
curl -X GET https://SANDBOX_BASE/api/v1/guardians/<guardianId>/nonce \
  -H "Authorization: Bearer clsbox_xxx"
```

Returns nonce, issuedAt, expiresAt (ttlMs=300,000) (5 minutes TTL).

9.3 Guardian signs: construct proof:

```
curl -X POST https://SANDBOX_BASE/api/v1/claims/transition \
  -H "Authorization: Bearer clsbox_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org_xxxx",
    "claimId": "claim_xxxx",
    "to": "grace_period",
    "guardianId": "g_xxx",
    "guardianApproved": true,
    "guardianProof": {
      "scheme": "eth_sign",
      "nonce": "<nonce-from-issue>",
      "signature": "0xSIG_HASHED_NONCE",
      "signedAt": "2026-09-14T09:00:00.000Z"
    }
  }'
```

Missing/invalid proof → `GUARDIAN_IDENTITY_PROOF_REQUIRED 403.
Approval counter met → auto status GUARDIAN_REVIEW → GRACE_PERIOD when approvalsCount >= guardianQuorum.

---

## 10. Webhooks

10.1 Create endpoint:

```
curl -X POST https://SANDBOX_BASE/api/v1/webhooks \
  -H "Authorization: Bearer clsbox_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org_xxxx",
    "url": "https://your-platform.example.ug/webhooks/chainlegacy",
    "events": ["*"],
    "description": "Main webhook",
    "signingAlgo": "HMAC-SHA256",
    "enabled": true
  }'
```

Returns secret `whsec_... — SHOW-ONCE. Store it. Verify signatures: header = `t=<unix ts>,v1=<hmac hex>`

Verifier (pseudocode):
```
ts, sig = split(x-signature-header. split(',')
payload_ts = ts.substring(2)
sig = v.substring(3)
expected = hmac_sha256(whsec_..., f"{payload_ts}.{body}")
timing_safe_equal(sig, expected)
now - ts < 5*60 → reject replay
```

---

## 11. API Keys: Create / List / Revoke / Rotate

```
# List (strips secrets/keyHash):
curl https://SANDBOX_BASE/api/v1/api-keys \
  -H "Authorization: Bearer clsbox_xxx"

# Create new (returns secret once
curl -X POST .../api-keys -d '{"organizationId":"org_xxx","name":"Eng Ops","env":"sandbox"}'

# Revoke by id:
curl -X DELETE .../api-keys -d '{"keyId":"k_xxx"}'

# Rotate (returns new secret once, revokes old):
curl -X PATCH .../api-keys -d '{"keyId":"k_xxx"}'
```

---

## 12. Errors + Audit Events

All errors:
```json
{ "error": { "code": "TENANT_MISMATCH|GUARDIAN_IDENTITY_PROOF_REQUIRED|CLAIM_NOT_FOUND",
  "message": "...", "requestId":"req_..." }
```

Status codes:
- 400 VALIDATION / overflow 401 UNAUTHENTICATED
- 403 TENANT scope / authz
- 404 NOT_FOUND
- 409 Idempotency concurrent conflict
- 429 RESOURCE_EXHAUSTED + Retry-After (rate 61 seconds default tier buckets)
- 5xx server errors redacted

Audit trail GET /api/v1/audit?event=CUSTOMER_CREATED&start=2026-09-01&end=2026-09-30 returns events. maxDepth=8 + SENSITIVE_KEYS redacted server side for all logs.

---

## 13. Security checklist before Go-Live Checklist CONTROLLED PILOT

1. [ ] Rotate sandbox keyclsbox_ on both sides.
2. [ ] Rotate all webhook whsec_ signed.
3. [ ] Idempotency-Key header for all mutations.
4. [ ] All organizationIds in your bodies match your token org ID (else 403 TENANT_MISMATCH).
5. [ ] Guardian quorum reviewed in contract.
6. [ ] Liveness check-in cadence scheduled in your client app.
7. [ ] Webhook delivery failures ≥ 5 auto disabled endpoint; monitor your endpoint 2xx.

---

## Integration errors. Do NOT commit real secrets anywhere.

Sandbox only: all prefixes `clsbox_`. No production keys during pilot.
