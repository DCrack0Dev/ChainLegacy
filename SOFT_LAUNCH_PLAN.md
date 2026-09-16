# ChainLegacy V3: Enterprise-Grade Soft Launch Strategy

## Phase 1: Internal "Alpha" (Weeks 1-2)
**Goal:** Verify core V3 infrastructure stability.
- **Participants:** Core development and security team.
- **Testing:** 
  - **AES-GCM Integrity**: Verify that tampering with ciphertext triggers decryption failure.
  - **Argon2id Benchmarking**: Ensure derivation time is < 2s on target devices.
  - **Event Sourcing**: Verify all transitions are logged in `SystemLogs`.

## Phase 2: Invite-Only "Beta" (Weeks 3-6)
**Goal:** Test User Trust UX and Passkey adoption.
- **Participants:** 50-100 Web3 power users.
- **Features:**
  - Passkey-only login options.
  - Guardian Network (Multi-party approval).
- **Limits:** 
  - Maximum 3 beneficiaries per vault.
  - Suspicion scoring set to "Warning" mode (no auto-freeze).

## Phase 3: Regional "Soft Launch" (Weeks 7-12)
**Goal:** Test 4-tier monetization and AI liveness checks.
- **Participants:** EU and North American markets.
- **Features:**
  - Full AI selfie liveness verification.
  - Stripe recurring billing for PREMIUM and LEGACY ELITE tiers.
- **Dispute Monitoring:** Manual review of any "Suspicion Score > 70" alerts.

---

## Risk Assessment (V3 Enterprise Stage)

| Risk | Impact | Probability | Mitigation |
| :--- | :--- | :--- | :--- |
| **Passkey Device Loss** | High | Medium | Fallback to Shamir Secret Sharing (User Share + Server Share). |
| **AI Liveness False Reject** | Medium | Medium | Manual override via Guardian Network approval. |
| **GCM Tag Mismatch** | Critical | Low | Failsafe error handling in UI with "Secure Recovery" instructions. |
| **Account Takeover** | Critical | Low | 24-hour delay on Guardian/Beneficiary changes + Suspicion Engine. |

---

## Final Go/No-Go Checklist
1. [ ] **Security Audit**: Third-party review of `EncryptionService` V3.
2. [ ] **Compliance**: GDPR/CCPA review of behavioral tracking data.
3. [ ] **Reliability**: Load testing of `EventService` under high volume.
4. [ ] **Trust**: 100% success rate on 2-of-3 Shamir reconstruction tests.
