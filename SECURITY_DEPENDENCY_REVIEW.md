# Security Dependency Review

Date: 2026-10-23

## Current result

`npm audit --omit=dev --audit-level=high` is intentionally run as a CI gate. Against the current committed lockfile it reports **0 vulnerabilities** at all severities.

The repaired dependency graph now uses the patched framework and transitive versions:

- `next@15.5.28` removes the previous critical Next.js findings.
- `firebase-admin@14.5.0` removes the vulnerable Firebase Admin/node-forge production chain and is initialized through the modular Admin SDK API.
- `@grpc/grpc-js`, `dompurify`, `follow-redirects`, and `source-map-js` are pinned through safe non-breaking overrides.
- `postcss@8.5.31` and `brace-expansion@5.0.12` are resolved throughout the lockfile, including nested framework dependencies.
- Hono is forced to the patched `4.13.13` release, and npm's `$uuid` override reuses the direct `uuid@11.1.1` dependency for all nested MetaMask/Wagmi copies.

## Validation

The following checks pass from a clean `npm ci`: lint, typecheck, 418 default tests, 107 emulator tests, coverage thresholds, production build, and the blocking production audit. The Next 15 route-context migration, Firebase Admin 14 modular API migration, Hono update, and UUID tree override are covered by those checks.

No audit failure is hidden with `continue-on-error`, and no real credentials are stored in the repository.
