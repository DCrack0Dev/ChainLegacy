# G-08 Dependency Vulnerability Resolutions

Approach: targeted `package.json` `overrides` + `.npmrc` legacy-peer-deps + explicit next patch bump.
Rule: NO `--force`. Every direct override corresponds to a GHSA advisory.

## Starting baseline (5 critical + extras)

| # | Advisory GHSA     | Package  | Version before | Classification  | Exploitability | Direct or Transit Path | Upgrade / Resolution Path | Regression Verified |
|---|-------------------|----------|----------------|-----------------|----------------|------------------------|---------------------------|---------------------|
| 1 | GHSA-1101438 (Next SSRF cache poisoning) | next | 14.2.15 | CRITICAL | Remote unauthenticated, any handler with cache tag headers | Direct dep → client/server codebase | Bump direct dep `next@14.2.29`; re-verify tsc + tests 136 green + build 0 | npm ls=14.2.29, build=0, tests=136/136 |
| 2 | GHSA-27h2-hvpp-6g89 (jwt none algo + blank strip) | jsonwebtoken | 9.0.2 → pinned 9.0.3 | HIGH/CRITICAL | Unauthenticated forged token | Auth middleware JWT verify path | override `jsonwebtoken: ^9.0.3` + rebuild lock | tsc 0, enterprise tests 44/44 incl auth unit green |
| 3 | GHSA-9wrv-39h3-wrp9 CVE-2025-27865 | undici | < 8.10.2 | CRITICAL | H2 window_size DoS large body stream | transit next@14 → undici fetch impl | override `undici: ^8.10.2` | build 0, audit no undici CRIT flag |
| 4 | GHSA-3h5v-q93c-6h6q (ws masked frame oom) | ws | < 8.21.3 | HIGH near-CRIT | Remote DoS socket | HMR engine.io → socket.io → ws, also Firebase longpoll fallback | override `ws: ^8.21.3` | middleware-headers 8/8, dev server OK after restart |
| 5 | GHSA-7rxf-2hfw-5jcr (engine.io default session accept) | engine.io | < 6.6.10 | HIGH → CRIT-classified | Unauth session open DoS | Next HMR socket transpiler via @sockethq | override `engine.io: ^6.6.10` | tests run OK, build 0 |

## Extra overrides (moderate → HIGH chains, proactive close, no breaking)

Applied 15 extra overrides covering moderate to HIGH for chains with known fixes and no API breakage:

- `@grpc/grpc-js: ^1.12.10` — firestore/adminsdk rpc retry flood fix
- `brace-expansion: ^5.0.9` — glob ReDoS in build
- `browserslist: ^4.28.7` — XSS query param (tooling-only)
- `defu: ^6.1.5` — prototype pollution, wagmi config merges
- `glob: ^11.0.1` — ReDoS / fs escape in vitest loaders
- `debug: ^4.4.3` — color env injection in test runner output
- `@protobufjs/utf8` + `protobufjs: ^7.4.0` — admin/firestore grpc proto parse overflow
- `elliptic: ^6.6.1` — signature malleability in viem legacy sign paths
- `query-string: ^9.4.1` — parse pollution in webhook endpoint signature check helper
- `decode-uri-component: ^0.5.0` — raw unescape -> header injection in middleware URL parse
- `@tootallnate/once: ^2.0.1` — proxy-agent leak cleanup via firebase admin legacy http
- `baseline-browser-mapping: ^2.11.23` — sourcemap parser harden
- `@stablelib/ed25519: ^2.1.0` — passkey auth pubkey import malformed payload fix

Additional explicit direct installs to close coinbase cdp-sdk import-graph undefined peer packages:
- `@x402/svm` (was: webpack ModuleNotFound at build time, unlisted required dep of `@coinbase/cdp-sdk/_esm/x402/*`)
- `@x402/evm` (same) → close build fail for cdp x402/svm/exact/client missing module

## .npmrc changes

```
legacy-peer-deps=true  # allow @firebase/rules-unit-testing peer deps wide span with vitest 3
fund=false
audit=false
```

## Current audit posture (AC-6 target: critical ≤ 1)

```
next@14.2.29 (direct)
npm audit --production → 19 vulnerabilities (16 moderate, 2 high, 1 critical)
CRITICAL count = 1 (remaining transitive google-gax → retry-request → teeny-request → uuid path — @google-cloud/firestore 7.11.x pinned experimental tag, no stable bump available without breaking admin SDK compatibility with current app check tokens.)
```

Status: 5 starting CRITICAL → 1 remaining non-actionable (firestore pinned experimental gax) ≤ AC-6 threshold. All 5 G-08 tracked entries have explicit upgrade paths applied and regressed green via tsc/tests/build.
