ChainLegacy Postman Sandbox Quickstart (Final)

Overview

This repository contains an importable Postman Collection and Environment to run a 5-minute sandbox validation of the real ChainLegacy /api/v1 endpoints. The collection is execution-focused and uses the real route contracts in the codebase.

Files

- chainlegacy-postman-sandbox-final.json — Postman Collection JSON (import into Postman)
- chainlegacy-postman-sandbox-environment.json — Postman Environment (import and fill placeholders)

Quick Start

1. Import the collection: File → Import → choose chainlegacy-postman-sandbox-final.json
2. Import the environment: File → Import → choose chainlegacy-postman-sandbox-environment.json
3. Edit the environment values:
   - baseUrl: e.g., http://localhost:3000 or https://sandbox.chainlegacy.example
   - firebaseWebApiKey: Firebase Web API key for sandbox project (if using real Firebase)
   - firebaseTestUserEmail / firebaseTestUserPassword: test user credentials for Firebase sign-in (or leave blank if operator pre-creates demo org)
   - CRON_SECRET: operator-only secret (do NOT share)
4. Run folders in order (top-down):
   01 - Authentication → 02 - Organization → 03 - Customer → 04 - Legacy Plan → 05 - Guardian → 06 - Liveness → 07 - Claims → 08 - Webhooks → 09 - Audit
5. Operator-only cron/webhook delivery requests are in 10 - Operator Only and require CRON_SECRET. Do not include CRON_SECRET in public exports.

Important notes

- Organization creation requires a Firebase idToken (POST to Firebase Identity signInWithPassword is included). The organization route returns a show-once clsbox_ API key. Copy that secret into the environment variable `apiKey` immediately — it will not be persisted by the server in plaintext.
- The collection's Tests scripts auto-capture IDs and the show-once secrets into your local Postman environment. DO NOT export or publish that environment (it may contain secrets). Treat the environment like credentials.
- Automatic inactivity detection and webhook delivery require a running worker/cron. Operator-only requests are provided to run cron/delivery but require CRON_SECRET.

What success looks like

- You obtain an idToken (Firebase sign-in), create an organization, copy the returned clsbox_ API key, and use it to create a customer, legacy plan, guardian, record liveness, create a claim, transition the claim, register a webhook, and confirm audit events.
- Tests in the Postman collection check expected HTTP status codes and will fail clearly if the API responds unexpectedly.

If you find any failing request during this run, capture the failing request/response (status + body) and server logs and open an issue. Only genuine blockers will be fixed in the backend — all other issues will be tracked separately.

Security

- Never export or publish the environment containing `apiKey`, `webhookSecret`, `idToken`, or `CRON_SECRET`.
- Use a separate Firebase sandbox project and credentials for public tests.

Operator guidance

- Optionally pre-create a demo organization and a sandbox API key and populate those values in a non-exported environment to provide frictionless onboarding to external testers.
- Run the webhook delivery worker and schedule GET /api/cron/check-status periodically (or call the operator-only endpoints in folder 10) to enable automated inactivity and webhook delivery.

