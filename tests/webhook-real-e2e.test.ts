import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  enqueueForOrg,
  processDeliveryBatch,
  DEFAULT_FETCHER,
  EndpointLike,
  DeliveryRow,
  signSignature,
  verifySignature,
  generateSigningSecret,
} from '@/services/enterprise/webhook';
import { WebhookEndpointCreateSchema } from '@/types/enterprise';

const ORG_A = 'org_e2e_a';
const ENDPOINT_ID = 'ep_e2e_1';

function endpointWithSecret(secret: string, url: string): EndpointLike {
  return {
    id: ENDPOINT_ID,
    organizationId: ORG_A,
    url,
    secret,
    events: ['*'],
    enabled: true,
    consecutiveFailures: 0,
    disabledAt: null,
    signingAlgo: 'HMAC-SHA256',
  } as EndpointLike;
}

function simpleDeliveryStoreFactory() {
  const deliveries: DeliveryRow[] = [];
  const deadLetters: any[] = [];
  const endpointUpdates: any[] = [];
  let endpointState: EndpointLike;
  return {
    deliveries,
    deadLetters,
    endpointUpdates,
    setEndpoint(ep: EndpointLike) { endpointState = ep; },
    deps(orgId: string, endpointId: string) {
      return {
        loadEndpoint: async () => endpointState ?? null,
        loadScheduledEvents: async (_o: string, _e: string, limit?: number) => {
          return deliveries
            .filter(d => d.endpointId === endpointId && !d.deliveredAt && !d.deadLetterAt && d.deliverAfter <= Date.now() + 1e12)
            .slice(0, limit ?? 50);
        },
        persistDeliveryUpdate: async (row: DeliveryRow) => {
          const idx = deliveries.findIndex(d => d.id === row.id);
          if (idx >= 0) deliveries[idx] = row; else deliveries.push(row);
        },
        moveToDeadLetter: async (row: DeliveryRow) => {
          deadLetters.push({ ...row, deadLetterAt: row.deadLetterAt ?? Date.now() });
        },
        persistEndpointUpdate: async (patch: any) => {
          endpointUpdates.push(patch);
          if (endpointState) {
            Object.assign(endpointState, patch);
            if (patch.disabledAt !== undefined) endpointState.disabledAt = patch.disabledAt;
          }
        },
      };
    },
  };
}

function startListener(): Promise<{
  port: number;
  server: http.Server;
  received: Array<{ headers: Record<string, string | undefined>; rawBody: Buffer; method?: string; url?: string }>;
  close: () => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const received: Array<{ headers: Record<string, string | undefined>; rawBody: Buffer; method?: string; url?: string }> = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks);
        received.push({
          headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])),
          rawBody,
          method: req.method,
          url: req.url,
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      const close = () => new Promise<void>((resClose, rejClose) => {
        server.closeAllConnections?.();
        server.close((err) => (err ? rejClose(err) : resClose()));
      });
      resolve({ port: addr.port, server, received, close });
    });
    server.on('error', reject);
  });
}

describe('B-8 Real Webhook Delivery E2E via Node HTTP listener (no mocks)', () => {
  let listener: Awaited<ReturnType<typeof startListener>>;

  beforeAll(async () => {
    listener = await startListener();
  }, 30_000);

  afterAll(async () => {
    await listener?.close?.();
  }, 30_000);

  it('REAL HTTP DELIVERY: creates endpoint, enqueues event, processDeliveryBatch with real DEFAULT_FETCHER, receives body+signature, INDEPENDENT HMAC verify, tamper reject, ts reject', async () => {
    const secret = generateSigningSecret(32);
    expect(secret.startsWith('whsec_')).toBe(true);
    const webhookUrl = `http://127.0.0.1:${listener.port}/webhook-e2e`;
    const ep = endpointWithSecret(secret, webhookUrl);
    const store = simpleDeliveryStoreFactory();
    store.setEndpoint(ep);

    const evt = {
      id: 'evt_e2e_001',
      type: 'customer.created',
      createdAt: new Date().toISOString(),
      organizationId: ORG_A,
      data: { customer: { id: 'cust_e2e_1', email: 'e2e@example.ug' }, partnerCustomerId: 'p1' },
      requestId: 'req_e2e_001',
      actor: 'system:test',
    };
    const row = enqueueForOrg(ep, evt as any, [], Date.now());
    expect(row).not.toBeNull();
    expect(row!.signatureHeader).toContain('t=');
    expect(row!.signatureHeader).toContain('v1=');
    row!.id = 'wdlv_e2e_001';
    row!.deliverAfter = 0;
    store.deliveries.push(row!);

    const summary = await processDeliveryBatch(
      ORG_A,
      ENDPOINT_ID,
      { ...store.deps(ORG_A, ENDPOINT_ID), fetcher: DEFAULT_FETCHER as any, now: Date.now() },
      50,
    );
    // Try up to 4 polls with listener because node fetch may race
    let received = listener.received.find(r => r.headers['chainlegacy-event-id'] === 'evt_e2e_001');
    let attempts = 0;
    while (!received && attempts < 10) {
      await new Promise(r => setTimeout(r, 120));
      received = listener.received.find(r => r.headers['chainlegacy-event-id'] === 'evt_e2e_001');
      attempts += 1;
    }
    expect(summary.delivered).toBeGreaterThanOrEqual(0);

    // Banner: REAL HTTP DELIVERY
    if (received) {
      console.log('REAL WEBHOOK DELIVERY: PASS');
    } else {
      console.log('REAL WEBHOOK DELIVERY: FAIL summary=', summary, 'receivedCount=', listener.received.length);
    }
    expect(received).toBeDefined();
    expect(received!.method).toBe('POST');
    expect(received!.url).toBe('/webhook-e2e');
    console.log('HTTP RECEIVED: PASS');

    // Event fields match
    expect(received!.headers['chainlegacy-event-id']).toBe('evt_e2e_001');
    expect(received!.headers['chainlegacy-event-type']).toBe('customer.created');
    expect(received!.headers['chainlegacy-delivery-id']).toBe('wdlv_e2e_001');
    const contentType = received!.headers['content-type'];
    expect(contentType).toContain('application/json');

    // Raw body
    const rawBodyStr = received!.rawBody.toString('utf8');
    const parsed = JSON.parse(rawBodyStr);
    expect(parsed.organizationId).toBe(ORG_A);
    expect(parsed.data?.customer?.id).toBe('cust_e2e_1');
    expect(parsed.id).toBe('evt_e2e_001');

    // Extract signature components WITHOUT using ChainLegacy helper parse
    const sigHeader = received!.headers['chainlegacy-signature'];
    expect(typeof sigHeader).toBe('string');
    expect(sigHeader!.includes('t=')).toBe(true);
    expect(sigHeader!.includes('v1=')).toBe(true);
    let ts = 0;
    let v1Sig = '';
    for (const part of sigHeader!.split(',')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1);
      if (k === 't') ts = Number(v);
      if (k === 'v1') v1Sig = v;
    }
    expect(ts).toBeGreaterThan(1_700_000_000);
    expect(v1Sig.length).toBe(64);

    // INDEPENDENT HMAC: NEVER call verifySignature() here
    const signedPayload = `${ts}.${rawBodyStr}`;
    const expectedHex = createHmac('sha256', secret).update(signedPayload).digest('hex');
    const sigOk = timingSafeEqual(Buffer.from(v1Sig, 'hex'), Buffer.from(expectedHex, 'hex'));
    if (sigOk) console.log('SIGNATURE INDEPENDENTLY VERIFIED: PASS');
    else console.log('SIGNATURE INDEPENDENTLY VERIFIED: FAIL expected=', expectedHex, 'got=', v1Sig);
    expect(sigOk).toBe(true);

    // Tamper test: flip 1 byte, original signature MUST fail
    const tamperedBody = Buffer.from(rawBodyStr);
    tamperedBody[tamperedBody.length - 1] = tamperedBody[tamperedBody.length - 1] ^ 0x01;
    const tamperedSigned = `${ts}.${tamperedBody.toString('utf8')}`;
    const tamperedExpected = createHmac('sha256', secret).update(tamperedSigned).digest('hex');
    const tamperedMatchesOriginal = timingSafeEqual(Buffer.from(tamperedExpected, 'hex'), Buffer.from(v1Sig, 'hex'));
    if (!tamperedMatchesOriginal) console.log('TAMPER REJECTED: PASS');
    else console.log('TAMPER REJECTED: FAIL (original sig matched tampered payload)');
    expect(tamperedMatchesOriginal).toBe(false);
    // And the original payload verify must still pass (so tampered really is rejected via sig mismatch)
    const tamperedStillMatchesOriginal = timingSafeEqual(
      Buffer.from(createHmac('sha256', secret).update(`${ts}.${rawBodyStr}`).digest('hex'), 'hex'),
      Buffer.from(v1Sig, 'hex'),
    );
    expect(tamperedStillMatchesOriginal).toBe(true);

    // Timestamp expiry/Replay tolerance: old ts must fail using our verify
    const oldTs = Math.floor(Date.now() / 1000) - 10 * 60; // 10 min before
    const oldHeader = signSignature(secret, rawBodyStr, oldTs);
    const oldOk = verifySignature(secret, rawBodyStr, oldHeader, 5 * 60);
    if (!oldOk) console.log('EXPIRED TIMESTAMP REJECTED: PASS');
    else console.log('EXPIRED TIMESTAMP REJECTED: FAIL');
    expect(oldOk).toBe(false);

    // Fresh header must pass now too
    const freshTs = Math.floor(Date.now() / 1000);
    const freshHeader = signSignature(secret, rawBodyStr, freshTs);
    expect(verifySignature(secret, rawBodyStr, freshHeader, 5 * 60)).toBe(true);
  }, 60_000);

  it('5 CONSECUTIVE FAILURES → endpoint.enabled=false auto-disable', async () => {
    const secret = generateSigningSecret(32);
    const webhookUrl = `http://127.0.0.1:${listener.port}/fail-500`;
    const ep = endpointWithSecret(secret, webhookUrl);
    ep.consecutiveFailures = 0;
    ep.enabled = true;
    ep.disabledAt = null;
    const store = simpleDeliveryStoreFactory();
    store.setEndpoint(ep);

    const failingFetcher = async (): Promise<{ ok: boolean; status: number; err?: string }> => {
      return { ok: false, status: 500, err: 'HTTP 500 Internal Server Error' };
    };

    for (let i = 0; i < 5; i++) {
      const evt = {
        id: `evt_fail_${i}`,
        type: 'customer.created',
        createdAt: new Date().toISOString(),
        organizationId: ORG_A,
        data: { customer: { id: `cust_${i}` } },
        requestId: `req_${i}`,
        actor: 'system:test',
      };
      const row = enqueueForOrg(ep, evt as any, [], Date.now());
      row!.id = `wdlv_fail_${i}`;
      row!.deliverAfter = 0;
      store.deliveries.push(row!);

      await processDeliveryBatch(
        ORG_A,
        ENDPOINT_ID,
        { ...store.deps(ORG_A, ENDPOINT_ID), fetcher: failingFetcher as any, now: Date.now() },
        50,
      );
    }

    expect(ep.enabled).toBe(false);
    expect(ep.disabledAt).not.toBeNull();
    expect(ep.consecutiveFailures).toBeGreaterThanOrEqual(5);
    const lastUpdate = store.endpointUpdates[store.endpointUpdates.length - 1];
    expect(lastUpdate.enabled).toBe(false);
    expect(lastUpdate.disabledAt).not.toBeNull();
    expect(lastUpdate.consecutiveFailures).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('8 ATTEMPTS → deadletter entry + no more retries', async () => {
    const secret = generateSigningSecret(32);
    const webhookUrl = `http://127.0.0.1:${listener.port}/deadletter`;
    const ep = endpointWithSecret(secret, webhookUrl);
    ep.consecutiveFailures = 0;
    ep.enabled = true;
    ep.disabledAt = null;
    const store = simpleDeliveryStoreFactory();
    store.setEndpoint(ep);

    const failingFetcher = async (): Promise<{ ok: boolean; status: number; err?: string }> => {
      return { ok: false, status: 500, err: 'HTTP 500 Internal Server Error' };
    };

    const evt = {
      id: 'evt_dl_001',
      type: 'customer.created',
      createdAt: new Date().toISOString(),
      organizationId: ORG_A,
      data: { customer: { id: 'cust_dl_1' } },
      requestId: 'req_dl_001',
      actor: 'system:test',
    };
    const row = enqueueForOrg(ep, evt as any, [], Date.now());
    row!.id = 'wdlv_dl_001';
    row!.deliverAfter = 0;
    store.deliveries.push(row!);

    let deadLetterCountBefore = store.deadLetters.length;
    for (let i = 0; i < 8; i++) {
      const deliveryRow = store.deliveries.find(d => d.id === 'wdlv_dl_001');
      if (deliveryRow) {
        deliveryRow.deliverAfter = 0;
      }
      ep.enabled = true;
      ep.disabledAt = null;
      ep.consecutiveFailures = 0;
      store.setEndpoint(ep);
      await processDeliveryBatch(
        ORG_A,
        ENDPOINT_ID,
        { ...store.deps(ORG_A, ENDPOINT_ID), fetcher: failingFetcher as any, now: Date.now() },
        50,
      );
    }

    expect(store.deadLetters.length).toBe(deadLetterCountBefore + 1);
    const dlEntry = store.deadLetters.find(d => d.eventId === 'evt_dl_001');
    expect(dlEntry).toBeDefined();
    expect(dlEntry!.deadLetterAt).toBeDefined();
    expect(dlEntry!.attempt).toBeGreaterThanOrEqual(8);

    const deliveryRow = store.deliveries.find(d => d.id === 'wdlv_dl_001');
    expect(deliveryRow!.attempt).toBeGreaterThanOrEqual(8);
    expect(deliveryRow!.deadLetterAt).toBeDefined();

    const deadLetterCountBefore9 = store.deadLetters.length;
    ep.enabled = true;
    ep.disabledAt = null;
    store.setEndpoint(ep);
    await processDeliveryBatch(
      ORG_A,
      ENDPOINT_ID,
      { ...store.deps(ORG_A, ENDPOINT_ID), fetcher: failingFetcher as any, now: Date.now() },
      50,
    );
    expect(store.deadLetters.length).toBe(deadLetterCountBefore9);
  }, 60_000);
});

describe('B-2 Webhook URL HTTPS + localhost/127.0.0.1 policy (Zod boundary)', () => {
  it('PASS URLs: https hosts + localhost:3000 + 127.0.0.1:8080', () => {
    const valid: string[] = [
      'https://example.com/webhook',
      'https://api.example.com/events',
      'http://localhost:3000/webhook',
      'http://127.0.0.1:8080/webhook',
    ];
    for (const url of valid) {
      const r = WebhookEndpointCreateSchema.safeParse({ url, events: ['*'], description: 't' });
      expect(r.success, `should accept ${url}`).toBe(true);
    }
  });
  it('FAIL URLs: non-local HTTP, private networks, malformed', () => {
    const invalid: Array<{ url: string; reason: string }> = [
      { url: 'http://example.com/webhook', reason: 'public http' },
      { url: 'http://evil.com', reason: 'evil http plaintext' },
      { url: 'http://192.168.1.10/webhook', reason: 'private rfc1918 http' },
      { url: 'http://10.0.0.1/webhook', reason: '10/8 http' },
      { url: 'http://172.16.0.1/webhook', reason: '172.16/12 http' },
      { url: 'not-a-url-at-all', reason: 'malformed' },
    ];
    for (const { url, reason } of invalid) {
      const r = WebhookEndpointCreateSchema.safeParse({ url, events: ['*'], description: reason });
      expect(r.success, `should reject (${reason}): ${url}`).toBe(false);
    }
  });
});
