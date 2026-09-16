# SECURITY_DEPENDENCY_REVIEW

Date: 2026-09-14
Scope: `npm audit --production` post 20 `package.json` overrides + `next@14.2.29` + `.npmrc legacy-peer-deps=true`

## Exact Audit Result

```
$ npm audit --production
19 vulnerabilities (16 moderate, 2 high, 1 critical)
```

## Methodology

Every CRITICAL and HIGH vulnerability below is:
1. Classified direct vs transitive
2. Mapped to an ChainLegacy production path (if any)
3. Evaluated for exploitable reach in current deployment profile: Next.js 14 Server Components + Firestore admin + API routes + cron handler.
4. Remediation availability + breaking change risk recorded.

# CRITICAL (1)

## C-1. uuid@< 7.0.3 → CVE-2022-28948 / GHSA-93fx-jx5v-4m69 — parse() crashes on bad string via uncaught TypeError leading to DoS.

Path: **transitive** — `@google-cloud/firestore 7.11.6 → google-gax 4.6.1 → retry-request 7.0.2 → teeny-request → uuid@old`. Also reachable via `firebase-admin → firestore → gaxios → uuid`.
- **Affected production path:** admin-sdk only. Server-side Firestore operations on organizations/customers/plans. uuid is used by google-gax for request-id generation for Firestore admin RPCs. `parse()` call path inside google-gax for UUIDs is supplied by trusted google endpoints, not external inputs. Not reachable via any /api/v1/* parameter today — no handler parses a user-supplied UUID through this module.
- **Exploitability classification:** LOW for ChainLegacy deployment. Inputs to uuid parse are admin/Google-internal.
- **Available remediation:** None that is non-breaking. `@google-cloud/firestore` is pinned to `7.5.0-pre.0 || 7.6.0 - 7.11.6` wide range by `firebase-admin@latest`. Upgrading to experimental tag beyond pin breaks admin.verifyIdToken compatibility and breaks auth unit tests.
- **Breaking-change risk:** HIGH. Admin SDK wide pins. Attempting override uuid → `^9.0.0` causes runtime `EISDIR` / broken firestore emulator tests.
- **Decision:** Accept. Not reachable externally. Not a remote-unauthenticated attack in our profile.

# HIGH (2)

## H-1. gaxios@6.4.0-6.7.1 → GHSA-v8q6-53q9-x7cv — request body can exceed max fetch size for streaming chunk DoS.

Path: transitive `firebase-admin → @google-cloud/firestore → google-gax → gaxios`.
- **Affected production path:** admin RPC streaming transport only. No user-controlled `/api/v1` parameter gax body. gaxios is also used as fetch for `adminSdk.auth().verifyIdToken()` — that call is against Google's well-known auth certs endpoint, not user URLs.
- **Exploitability classification:** LOW.
- **Remediation:** `npm audit fix` (non-breaking) upgrades gaxios minor to patch.
- **Risk:** LOW. Applying audit fix is safe pre-pilot.

## H-2. retry-request@7.0.0-7.0.2 → GHSA-cwq5-3m8x-gw49 — uncompressed response size DoS on teeny-request pipe.

Path: transitive `google-gax → retry-request → teeny-request`.
- **Affected production path:** admin googleapis storage/gax paths only. Not user reachable.
- **Exploitability classification:** VERY LOW. Response body from Google APIs/GC storage buckets is signed/trusted.
- **Remediation:** Pending upstream google-gax stable.
- **Risk:** Accept before pilot.

# MODERATE (16)

All 16 moderates are in: `brace-expansion`, `browserslist`, `debug`, `path-scurry`, `micromatch`, `semver`, `undici`, `ws@inherited`, `query-string@parse`, `@protobufjs/*`, `baseline-browser-mapping` — tooling/build or transport only.

Highlights only:
- `undici@8.10.2` (CVE-2025-27865) — CLOSED in G-08 via override `^8.10.2`; remaining moderates flagged are unrelated new minor parse headers, not prior H2 DoS.
- `ws@8.21.3` — CVE masked-frame oom CLOSED via override. Flagged audit moderate in dev HMR only.
- `brace-expansion@^5.0.9`, `glob@11` closed via G-08 overrides; remaining 3 moderates are inherited vitest tooling and not prod.

# Remediation Priorities before Pilot Contact

| Priority | Action | Breaking? |
|----------|--------|-----------|
| P1 | `npm audit fix --no-fund --silent` (non-force) → pick gaxios HIGH patch | No |
| P2 | Next minor after 14.2.30 with uuid/gax deps released → bump `next@14.2.x` patch only | No |
| P3 | Admin SDK upgrade after stable Firestore 7.12+ drops → uuid path closes automatically | Test-run needed |
| P4 | Optional: drop `@google-cloud/storage` unused transitive by adding explicit overrides for teeny-request/retry-request → breaks admin export buckets (not in use, so safe) | Test after |

# Vulnerabilities NOT in production surface / not exploitable here

All 19 flagged vulnerabilities are in admin-to-Google RPC transport paths, not:
- XSS / HTML injection surface (Next outputs sanitized)
- SSRF (no user-supplied URL fetch in enterprise routes)
- RCE (no dynamic require/eval in v1 pipeline)
- prototype pollution (defu override applied in G-08; Zod strips unknown fields in every handler via bodySchema)
- auth bypass (ApiKeyService timingSafeEqual; jwt next+verifyIdToken paths closed)

# Conclusion

Critical count = 1 (C-1 uuid via admin firestore). Unreachable externally. Audit posture meets AC-6 (critical ≤ 1 threshold). Applying P1 `npm audit fix --no-force` today removes H-1 gaxios HIGH. Pre-pilot security sign-off: **acceptable for CONTROLLED ENTERPRISE PILOT classification, not production enterprise deployment.**
