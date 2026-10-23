# Contributing to ChainLegacy

## Before opening a pull request

Run the same gates used by CI from a clean install:

```bash
npm ci
npm run audit:production
npm run lint
npm run typecheck
npm test
npm run test:emulator
npm run test:coverage
npm run build
```

Do not commit `.env` files, credentials, generated `.next` output, coverage output, or TypeScript build metadata. Keep changes focused, preserve tenant isolation, and add or update tests for behavior changes.

## Review expectations

Pull requests should explain the behavior change, data/security impact, migration or rollback concerns, and test evidence. API changes must include request validation, typed error responses, request IDs, authorization scope, and tenant-boundary checks where applicable. Dependency upgrades must include the audit result and a clean production build.

## Branches and releases

Use short-lived branches from `main`. Use conventional commit prefixes (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Maintainers create a tagged release after the full CI suite passes and the changelog is updated.
