# ChainLegacy Enterprise Pilot — Tasks

## Task 1: Baseline Check Verification
**Priority**: high  
**Status**: pending  
**Maps ACs**: F1 (all 4 rules)

### Test Requirements (TR)
- rule: `npx tsc --noEmit` exit code == 0 — evidence: terminal stdout
- rule: `npx vitest run` (default+emulator) pass count == total, fail count == 0 — evidence: vitest summary line
- rule: `npm run build` exit code == 0 — evidence: terminal stdout
- rule: `npm audit --production` vuln count recorded (17 expected: 15 moderate 1 high 1 critical) — evidence: audit summary

### Completion Evidence
Record 4 results in final report.

---

## Task 2: Gap-Filling Test Suite (pilot-sim-gaps.test.ts)
**Priority**: high  
**Status**: pending  
**Maps ACs**: F2, F3, F5 (zero quorum, cron auth), F7 (cron locks), F8 (retry/backoff/deadletter)

### Test Requirements (TR)

#### F3 API Keys (service-level)
- rule: `EnterpriseApiKeyService.createKey` returns secret with correct prefix (clsbox_/clprod_) + keyId segment + base64url random
- rule: `verifySecretAgainstHash(secret, storedHash)` returns true for correct secret, false for bit-flipped secret
- rule: `rotateKey` sets `revokedAt+disabled=true` on previous; returns new row+secret; `revokeKey` same disable semantics
- rule: `authenticateKey` with revoked key throws UNAUTHORIZED; with non-existent prefix throws UNAUTHORIZED

#### F5 zero quorum regression
- rule: `registerGuardianApproval` with `plan.guardianQuorum=0` still uses `quorum = Math.max(1, 0) = 1`; 0 approvals → quorumMet=false; 1 approval → quorumMet=true

#### F5 cron auth
- rule: Simulated cron handler with `NODE_ENV=production` and `Authorization != Bearer ${secret}` returns 401 body `{code:'CRON_AUTH_REQUIRED'}`

#### F8 webhook retries + deadletter
- rule: `retryDelayMs(0)` < retryDelayMs(1) < ... < retryDelayMs(7); retryDelayMs(7) <= 24h
- rule: 5 consecutive `processDeliveryFailure` calls → endpoint.enabled=false && endpoint.disabledAt set
- rule: 8th failed delivery → deliveryRow.deadLetterAt set

### Completion Evidence
vitest pass for pilot-sim-gaps.test.ts with 10+ assertions all passing.

---

## Task 3: Run Full Simulation Suite + Classify Every Feature
**Priority**: high  
**Status**: pending  
**Maps ACs**: F1–F11 inclusive

### Test Requirements (TR)

- rule: Run `npx vitest run`; capture pass/fail/total per file
- rubric: Classify each F1–F11 feature as VERIFIED / SIMULATED / NOT IMPLEMENTED / FAIL / NOT TESTED with evidence
  - VERIFIED: real implementation with passing test
  - SIMULATED: logic correct in pure/memory layer but no real Firestore/HTTP integration
  - NOT IMPLEMENTED: AC references no code path
  - FAIL: real test fails
  - NOT TESTED: code exists but no test
  - Scale: pass threshold = 0 FAILs in critical path (F1 F2 F3 F4 F5 F6 F8 F9)

### Completion Evidence
Final report with PASS/FAIL/NOT TESTED counts + classification table.

---

## Task 4: Generate Final Pilot Readiness Report
**Priority**: high  
**Status**: pending  
**Maps ACs**: All + F11 integration

### Test Requirements (TR)
- rubric: Report contains (scale 0–2; threshold ≥ 1.5):
  - 0: missing critical sections
  - 1: all sections present but cursory
  - 2: actionable, copy-pasteable, every assertion cites file/line evidence
- rule: Final recommendation is either SHIP TO CONTROLLED PILOT or DO NOT SHIP — FIX THESE ITEMS FIRST
- rule: Partner integration steps documented with exact curl/ts per endpoint, auth, scopes, HMAC verify
- rule: Pilot blockers enumerated with concrete file references

### Completion Evidence
Report file with sections enumerated in user request.

---

## Task 5: Bug Fix + Regression Test Cycle
**Priority**: critical  
**Status**: pending  
**Trigger**: Any FAIL discovered during Task 3

### Test Requirements (TR)
- rule: Every genuine bug → minimal source fix + new regression test in pilot-sim-gaps.test.ts
- rule: After fix, full `npx vitest run` passes with 0 failures
- rule: tsc --noEmit still 0

### Completion Evidence
`git diff` of fix files + new test cases passing.
