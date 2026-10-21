# Security Dependency Review

Date: 2026-10-21

## Current result

`npm audit --omit=dev --audit-level=high` is intentionally run as a CI gate. Against the committed lockfile it reports 23 production-path advisories: 15 moderate, 6 high, 1 critical, and 1 low.

The high/critical findings are currently transitive or framework-major-version blockers:

- `next@14.2.x` is affected by advisories whose first available fix requires Next 15.5.24 or later.
- `firebase-admin@12.7.0` pulls vulnerable Google Cloud transport packages; the first available npm fix is the Firebase Admin 14.x major line.
- `@grpc/grpc-js`, `follow-redirects`, and `source-map-js` have fixes available through dependency-tree updates or overrides, but must be validated against the Firestore emulator and Web3 client bundle.
- `node-forge` is pulled by Firebase Admin and has no newer npm version beyond the currently resolved 1.4.0 release in this dependency graph.
- PostCSS is pulled by the framework toolchain and is resolved through Next's dependency tree.

## Why the major upgrades are not included in this change

A trial upgrade to Next 15 and Firebase Admin 14 was reverted because it broke the existing route-handler contracts and Firebase Admin typings across the application. Shipping that upgrade would have made the clean-clone typecheck and production build fail. The repository therefore keeps the known-good Next 14/Firebase Admin 12 baseline while CI exposes the audit failure instead of suppressing it.

## Required follow-up

1. Migrate route handlers to the Next 15 async `RouteContext` contract and update dynamic page `params` types.
2. Migrate Firebase Admin initialization and Firestore types to Firebase Admin 14.
3. Re-run the default suite, emulator suite, and production build after those upgrades.
4. Remove any remaining high/critical findings, then keep `npm run audit:production` as a blocking CI step.

No audit failure is hidden with `continue-on-error`, and no real credentials are stored in the repository.
