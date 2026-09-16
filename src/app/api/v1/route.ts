import { structuredJson } from '@/lib/api-auth';
export const dynamic = 'force-dynamic';
const endpoints = [
  { method: 'GET', path: '/api/v1/', auth: 'none' },
  { method: 'POST', path: '/api/v1/organizations', auth: 'firebase-jwt' },
  { method: 'GET', path: '/api/v1/customers', auth: 'api-key || firebase-jwt', scope: 'customers:read' },
  { method: 'POST', path: '/api/v1/customers', auth: 'api-key || firebase-jwt', scope: 'customers:write' },
  { method: 'GET', path: '/api/v1/legacy-plans', auth: 'api-key || firebase-jwt', scope: 'legacy_plans:read' },
  { method: 'POST', path: '/api/v1/legacy-plans', auth: 'api-key || firebase-jwt', scope: 'legacy_plans:write' },
  { method: 'GET', path: '/api/v1/beneficiaries', auth: 'api-key || firebase-jwt', scope: 'beneficiaries:read' },
  { method: 'POST', path: '/api/v1/beneficiaries', auth: 'api-key || firebase-jwt', scope: 'beneficiaries:write' },
  { method: 'GET', path: '/api/v1/guardians', auth: 'api-key || firebase-jwt', scope: 'guardians:read' },
  { method: 'POST', path: '/api/v1/guardians', auth: 'api-key || firebase-jwt', scope: 'guardians:write' },
  { method: 'GET', path: '/api/v1/liveness', auth: 'api-key || firebase-jwt', scope: 'liveness:read' },
  { method: 'POST', path: '/api/v1/liveness', auth: 'api-key || firebase-jwt', scope: 'liveness:write' },
  { method: 'GET', path: '/api/v1/claims', auth: 'api-key || firebase-jwt', scope: 'claims:read' },
  { method: 'POST', path: '/api/v1/claims', auth: 'api-key || firebase-jwt', scope: 'claims:manage' },
  { method: 'POST', path: '/api/v1/claims/transition', auth: 'api-key || firebase-jwt', scope: 'claims:manage' },
  { method: 'GET', path: '/api/v1/audit', auth: 'api-key || firebase-jwt', scope: 'audit:read' },
  { method: 'GET', path: '/api/v1/webhooks', auth: 'api-key || firebase-jwt', scope: 'webhooks:manage' },
  { method: 'POST', path: '/api/v1/webhooks', auth: 'api-key || firebase-jwt', scope: 'webhooks:manage' },
  { method: 'POST', path: '/api/v1/webhooks/deliver', auth: 'CRON_SECRET Bearer' },
  { method: 'GET', path: '/api/v1/api-keys', auth: 'api-key || firebase-jwt', scope: 'api_keys:read' },
  { method: 'POST', path: '/api/v1/api-keys', auth: 'api-key || firebase-jwt', scope: 'api_keys:write' },
  { method: 'DELETE', path: '/api/v1/api-keys', auth: 'api-key || firebase-jwt', scope: 'api_keys:write' },
];
export function GET(_request: Request) {
  return structuredJson({
    api: 'ChainLegacy Enterprise v1',
    version: '1.0.0',
    docs: 'https://chainlegacy.example.com/docs/api/v1',
    idempotency: 'Pass Idempotency-Key header for safe POST/PUT retries (up to 64 chars).',
    authentication: 'Either Authorization: Bearer <cl*_api_key_or_firebase_jwt> OR X-API-Key header for keys.',
    endpoints,
  });
}
