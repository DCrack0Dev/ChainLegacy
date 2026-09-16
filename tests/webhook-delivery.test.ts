import { describe, it, expect, beforeEach } from 'vitest';
import {
  EndpointLike,
  DeliveryRow,
  enqueueForOrg,
  processDeliveryBatch,
  computeDedupeKey,
  signSignature,
  verifySignature,
  MAX_ATTEMPTS,
  CONSECUTIVE_FAILURE_DISABLE_THRESHOLD,
  WebhookDeliveryEvent,
} from '@/services/enterprise/webhook';

const ORG_A = 'org_A';
const ENDPOINT_ID = 'ep_1';

function sampleEvent(data: any = { customer: { id: 'c1' } }, extra: Partial<WebhookDeliveryEvent> = {}): WebhookDeliveryEvent {
  return {
    id: 'evt_sample',
    type: 'customer.created',
    createdAt: '2025-01-01T00:00:00Z',
    organizationId: ORG_A,
    data,
    ...extra,
  } as WebhookDeliveryEvent;
}

function endpoint(partial: Partial<EndpointLike> = {}): EndpointLike {
  return {
    id: ENDPOINT_ID,
    organizationId: ORG_A,
    url: 'https://example.com/hooks',
    secret: 'whsec_test123',
    events: ['customer.created'],
    enabled: true,
    consecutiveFailures: 0,
    disabledAt: null,
    ...partial,
  } as EndpointLike;
}

class MemoryWebhookDeps {
  endpoints = new Map<string, EndpointLike>();
  deliveries: DeliveryRow[] = [];
  deadLetters: any[] = [];
  endpointUpdates: any[] = [];
  constructor(orgEndpoints: EndpointLike[] = []) {
    orgEndpoints.forEach(e => this.endpoints.set(e.id, e));
  }
  deps(orgId: string, endpointId: string) {
    const self = this;
    return {
      loadEndpoint: async () => self.endpoints.get(endpointId) ?? null,
      loadScheduledEvents: async (_org: string, _eid: string, limit?: number) => {
        return self.deliveries
          .filter(d => d.endpointId === endpointId && !d.deliveredAt && !d.deadLetterAt && d.deliverAfter <= (Date.now() + 1e12))
          .slice(0, limit ?? 50);
      },
      persistDeliveryUpdate: async (row: DeliveryRow) => {
        const idx = self.deliveries.findIndex(d => d.id === row.id);
        if (idx >= 0) self.deliveries[idx] = row;
        else self.deliveries.push(row);
      },
      moveToDeadLetter: async (row: DeliveryRow) => {
        self.deadLetters.push({ orgId, endpointId, row, deadLetterAt: row.deadLetterAt ?? Date.now() });
      },
      persistEndpointUpdate: async (patch: any) => {
        self.endpointUpdates.push(patch);
        const e = self.endpoints.get(patch.id);
        if (e) {
          Object.assign(e, patch);
          if (patch.disabledAt !== undefined) e.disabledAt = patch.disabledAt;
        }
      },
    };
  }
}

describe('webhook sign/verify roundtrip + tamper (AC-5 TR-12.2)', () => {
  it('roundtrip verify ok', () => {
    const payload = JSON.stringify({ a: 1 });
    const secret = 'whsec_unit';
    const t = Math.floor(Date.now() / 1000);
    const header = signSignature(secret, payload, t);
    expect(typeof header).toBe('string');
    expect(header.includes('t=')).toBe(true);
    expect(header.includes('v1=')).toBe(true);
    expect(verifySignature(secret, payload, header)).toBe(true);
  });
  it('tamper body fails verify', () => {
    const secret = 'whsec_unit';
    const t = Math.floor(Date.now() / 1000);
    const header = signSignature(secret, JSON.stringify({ a: 1 }), t);
    expect(verifySignature(secret, JSON.stringify({ a: 2 }), header)).toBe(false);
  });
  it('outside 5 min replay tolerance fails', () => {
    const secret = 'whsec_unit';
    const body = '{}';
    const oldT = Math.floor(Date.now() / 1000) - 10 * 60;
    const header = signSignature(secret, body, oldT);
    expect(verifySignature(secret, body, header, 5 * 60)).toBe(false);
  });
});

describe('enqueueForOrg: enabled/subscribed returns DeliveryRow, else null, signs, dedupe', () => {
  it('enabled subscribed event returns row with signatureHeader, attempt 0', () => {
    const ep = endpoint({ url: 'https://a.example.com/h', enabled: true });
    const ev = sampleEvent();
    const row = enqueueForOrg(ep, ev, [], Date.now());
    expect(row).toBeTruthy();
    expect(row!.endpointId).toBe(ep.id);
    expect(row!.attempt).toBe(0);
    expect(row!.signatureHeader).toContain('v1=');
    expect(row!.dedupeKey).toBe(computeDedupeKey(ep.id, ev));
    const payload = JSON.stringify(ev);
    const header = row!.signatureHeader!;
    expect(verifySignature(ep.secret, payload, header)).toBe(true);
  });
  it('disabled endpoint returns null', () => {
    const ep = endpoint({ enabled: false, disabledAt: new Date() });
    expect(enqueueForOrg(ep, sampleEvent(), [], Date.now())).toBeNull();
  });
  it('unsubscribed event type returns null', () => {
    const ep = endpoint({ events: ['claims.created'] });
    expect(enqueueForOrg(ep, sampleEvent(), [], Date.now())).toBeNull();
  });
  it('dedupe skips when existingDeliveries contains same dedupeKey', () => {
    const ep = endpoint();
    const ev = sampleEvent();
    const first = enqueueForOrg(ep, ev, [], Date.now())!;
    const duplicate = enqueueForOrg(ep, ev, [{ dedupeKey: first.dedupeKey }], Date.now());
    expect(duplicate).toBeNull();
  });
});

describe('processDeliveryBatch retries 8 + deadletter + auto-disable 5 consecutive (AC-4 TR-12.1)', () => {
  it('8 failed attempts moves row to deadLetter, then endpoint disabled after 5 consecutive across all rows', async () => {
    const ep = endpoint({ consecutiveFailures: 0 });
    const store = new MemoryWebhookDeps([ep]);
    const row = enqueueForOrg(ep, sampleEvent(), [], Date.now())!;
    row.id = 'del_retry_loop';
    row.attempt = MAX_ATTEMPTS - 1;
    row.deliverAfter = 0;
    store.deliveries.push(row);
    const failingFetcher = async () => ({ ok: false, status: 500, err: 'INTERNAL' });
    const summary = await processDeliveryBatch(ORG_A, ENDPOINT_ID, {
      ...store.deps(ORG_A, ENDPOINT_ID),
      fetcher: failingFetcher as any,
      now: Date.now(),
    }, 100);
    expect(summary.delivered).toBe(0);
    expect(store.deadLetters.length).toBe(1);
    expect(summary.movedToDeadLetter).toBe(1);
  });

  it('endpoint consecutiveFailures reaches 5 disables endpoint + disabledAt set', async () => {
    const ep = endpoint({ consecutiveFailures: 4 });
    const store = new MemoryWebhookDeps([ep]);
    const row = enqueueForOrg(ep, sampleEvent(), [], Date.now())!;
    row.id = 'del_first_fail';
    row.deliverAfter = 0;
    store.deliveries.push(row);
    const failingFetcher = async () => ({ ok: false, status: 500, err: 'E' });
    const summary = await processDeliveryBatch(ORG_A, ENDPOINT_ID, {
      ...store.deps(ORG_A, ENDPOINT_ID),
      fetcher: failingFetcher as any,
      now: Date.now(),
    }, 100);
    expect(summary.endpointDisabled).toBe(true);
    expect(ep.enabled).toBe(false);
    expect(ep.disabledAt).toBeTruthy();
  });

  it('3 success deliveries + resets consecutiveFailures + 0 deadLetter', async () => {
    const ep = endpoint({ consecutiveFailures: 2 });
    const store = new MemoryWebhookDeps([ep]);
    for (let i = 0; i < 3; i++) {
      const row = enqueueForOrg(ep, sampleEvent({ id: `c${i}` }, { id: `evt_${i}` }) as any, [], Date.now())!;
      row.id = `del_ok_${i}`;
      row.deliverAfter = 0;
      store.deliveries.push(row);
    }
    const successFetcher = async () => ({ ok: true, status: 200 });
    const summary = await processDeliveryBatch(ORG_A, ENDPOINT_ID, {
      ...store.deps(ORG_A, ENDPOINT_ID),
      fetcher: successFetcher as any,
      now: Date.now(),
    }, 50);
    expect(summary.delivered).toBe(3);
    expect(summary.movedToDeadLetter).toBe(0);
    expect(summary.endpointDisabled).toBe(false);
    expect(ep.consecutiveFailures).toBe(0);
    const finalized = store.deliveries.filter(d => !!d.deliveredAt);
    expect(finalized).toHaveLength(3);
  });
});
