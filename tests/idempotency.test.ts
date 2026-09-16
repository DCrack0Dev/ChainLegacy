import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryIdempotencyBackend,
  resolveIdempotency,
  apiErrorConflict409,
  IDEMPOTENCY_TTL_MS,
  computeIdempotencyDocId,
  cachedResponseToHttp,
  CachedResponse,
} from '@/services/enterprise/idempotency';

describe('Idempotency service (Task 15 AC-16)', () => {
  let backend: InMemoryIdempotencyBackend;
  let clock: number;
  beforeEach(() => { clock = 1700000000000; backend = new InMemoryIdempotencyBackend(() => clock); });

  it('resolve returns new.lock for first call with same key', async () => {
    const r = await resolveIdempotency('orgA', 'key_abc', 'req1', clock, backend);
    expect(r.kind).toBe('new');
    const lock = (r as any).lock;
    expect(lock.id).toBeTruthy();
    expect(lock.status).toBe('LOCK');
    expect(lock.expiresAt).toBeGreaterThan(clock);
  });

  it('resolve returns conflict when lock fresh <60s with diff requestId', async () => {
    await resolveIdempotency('orgA', 'key_abc', 'req1', clock, backend);
    clock += 10 * 1000;
    const r = await resolveIdempotency('orgA', 'key_abc', 'req2', clock, backend);
    expect(r.kind).toBe('conflict');
    const resp = apiErrorConflict409('rq_x');
    expect(resp.status).toBe(409);
  });

  it('after finalize(DONE) returns hit doc + cachedResponseToHttp returns body/status', async () => {
    const r1 = await resolveIdempotency('orgA', 'k1', 'rq1', clock, backend);
    expect(r1.kind).toBe('new');
    const lock = (r1 as any).lock;
    const cached: CachedResponse = {
      status: 201,
      body: JSON.stringify({ ok: true, id: 'x' }),
      headers: { 'x-foo': 'bar' },
      requestId: 'rq1',
    };
    const finalExp = clock + IDEMPOTENCY_TTL_MS;
    await backend.finalize(lock.id, 'DONE', cached, null, 'rq1', finalExp);
    clock += 1000;
    const r2 = await resolveIdempotency('orgA', 'k1', 'rq999', clock, backend);
    expect(r2.kind).toBe('hit');
    const doc = (r2 as any).doc;
    expect(doc.response.status).toBe(201);
    expect(doc.expiresAt).toBeGreaterThan(clock + IDEMPOTENCY_TTL_MS - 10_000);
    const resp = cachedResponseToHttp(doc);
    expect(resp.status).toBe(201);
    const json = await resp.json();
    expect(json).toEqual({ ok: true, id: 'x' });
    expect(resp.headers.get('x-idempotency')).toBe('hit');
  });

  it('diff orgs independent: orgB same key returns new not hit', async () => {
    const r1 = await resolveIdempotency('orgA', 'k1', 'rq1', clock, backend);
    const lock = (r1 as any).lock;
    const cached: CachedResponse = { status: 200, body: 'hello', headers: {}, requestId: 'r1' };
    await backend.finalize(lock.id, 'DONE', cached, null, 'r1', clock + IDEMPOTENCY_TTL_MS);
    const r2 = await resolveIdempotency('orgB', 'k1', 'rq2', clock, backend);
    expect(r2.kind).toBe('new');
    expect(computeIdempotencyDocId('orgA', 'k1')).not.toBe(computeIdempotencyDocId('orgB', 'k1'));
  });

  it('stale lock older than 60s cleared returns new', async () => {
    await resolveIdempotency('orgA', 'k_stale', 'rq1', clock, backend);
    clock += 61 * 1000;
    const r2 = await resolveIdempotency('orgA', 'k_stale', 'rq2', clock, backend);
    expect(r2.kind).toBe('new');
  });
});
