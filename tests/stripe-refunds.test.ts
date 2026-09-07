import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { demoIds, seed } from '../packages/db/seed.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { config } from '../apps/api/src/common/config.js';
import {
  setStripeRefundPortForTests,
  type StripeRefund,
  type StripeRefundPort,
} from '../apps/api/src/integrations/stripe.js';
import {
  acceptOrder,
  createOrder,
  createQuote,
  createRequest,
  getOrder,
} from '../apps/api/src/modules/licensing.js';
import {
  checkout,
  issueLicenses,
  persistPaymentEvent,
  processPaymentEvents,
} from '../apps/api/src/modules/payments.js';
import {
  ingestStripeRefundEvent,
  processStripeRefunds,
  requestRefund,
} from '../apps/api/src/modules/stripe-refunds.js';
import type { Usage } from '../packages/domain/src/index.js';

let buyer: Actor;
let admin: Actor;
let creator: Actor;
let assetId: string;
let previousPayments: string;
let refunds = new Map<string, StripeRefund>();
let createCalls = 0;

const usage = (): Usage => ({
  campaign_name: 'Refund ' + randomUUID().slice(0, 8),
  operation: 'synthetic_video',
  purpose: 'commercial_advertising',
  category: 'beauty',
  territories: ['ES'],
  channels: ['instagram'],
  duration_days: 30,
  starts_at: new Date(Date.now() + 4 * 86400000).toISOString(),
  exclusivity: 'none',
  sublicensing: false,
  training: false,
  voice_clone: false,
});

function mockPort(immediate: 'succeeded' | 'pending' | 'failed' = 'succeeded'): StripeRefundPort {
  return {
    createRefund: async (params, options) => {
      createCalls += 1;
      const id = 're_test_' + (options?.idempotencyKey ?? randomUUID()).toString().slice(-10);
      const refund: StripeRefund = {
        id,
        livemode: false,
        status: immediate,
        amount: 0,
        currency: 'eur',
        payment_intent: params.payment_intent,
        charge: 'ch_test_' + id.slice(-8),
        failure_reason: immediate === 'failed' ? 'insufficient_funds' : null,
      };
      // Amount filled by caller context via retrieve; set from first create metadata path in tests.
      refunds.set(id, refund);
      return refund;
    },
    retrieveRefund: async (id) => {
      const row = refunds.get(id);
      if (!row) throw new Error('missing refund');
      return row;
    },
  };
}

async function paidStripeOrder() {
  config.payments = 'sandbox';
  const r = await transaction((db) =>
    createRequest(db, buyer, { organization_id: demoIds.org, asset_id: assetId, usage: usage() }),
  );
  const q = await transaction((db) => createQuote(db, buyer, { request_id: r.id }));
  const o = await transaction((db) => createOrder(db, buyer, { quote_id: q.id }));
  await transaction((db) =>
    acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
  );
  const attempt = await checkout(buyer, o.id);
  await persistPaymentEvent('sandbox', randomUUID(), {
    order_id: o.id,
    attempt_id: attempt.attempt_id!,
    amount_minor: o.price.total_minor,
    currency: 'EUR',
    type: 'payment.succeeded',
    sandbox: true,
  });
  await processPaymentEvents();
  // Issue the license without booking a sandbox_transfer so Stripe refund tests use the Stripe reversal journal.
  config.payments = 'stripe';
  await issueLicenses();
  const pi = 'pi_refund_' + randomUUID().slice(0, 8);
  await pool.query(
    "UPDATE payment_attempts SET provider='stripe', payment_intent_ref=$2 WHERE id=$1",
    [attempt.attempt_id, pi],
  );
  return { order: await getOrder(pool, buyer, o.id, true), attemptId: attempt.attempt_id!, pi };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test')) throw new Error('Tests require _test database');
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const management = new pg.Pool({ connectionString: url.toString() });
  if (!(await management.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
    await management.query('CREATE DATABASE ' + name);
  await management.end();
  await migrate();
  await seed();
  buyer = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.buyer])).rows[0];
  admin = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.admin])).rows[0];
  creator = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.creator])).rows[0];
  assetId = (
    await pool.query(
      'SELECT a.id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE c.user_id=$1',
      [creator.id],
    )
  ).rows[0].id;
  await pool.query("UPDATE assets SET status='published' WHERE id=$1", [assetId]);
  previousPayments = config.payments;
  process.env.STRIPE_SECRET_KEY = 'sk_test_rightsnet_refunds_only';
});

afterAll(async () => {
  config.payments = previousPayments;
  delete process.env.STRIPE_SECRET_KEY;
  await pool.end();
});

beforeEach(() => {
  refunds = new Map();
  createCalls = 0;
  config.payments = 'stripe';
  setStripeRefundPortForTests(mockPort('succeeded'));
});

afterEach(() => {
  setStripeRefundPortForTests(null);
  config.payments = previousPayments;
});

describe.sequential('Stripe refunds (mocked)', () => {
  it('uses current provider status and rejects a different refund with the same PaymentIntent', async () => {
    const { order, pi } = await paidStripeOrder();
    const id = 're_current_' + randomUUID();
    const current: StripeRefund = {
      id,
      livemode: false,
      status: 'pending',
      amount: order.price.total_minor,
      currency: 'eur',
      payment_intent: pi,
      charge: 'ch_current',
    };
    setStripeRefundPortForTests({
      createRefund: async () => current,
      retrieveRefund: async (ref) => ({ ...current, id: ref }),
    });
    await transaction((db) => requestRefund(db, admin, order.id, 'Prueba de estado autoritativo'));
    await processStripeRefunds();
    const row = (await pool.query('SELECT * FROM refunds WHERE order_id=$1', [order.id])).rows[0];
    const makeEvent = (ref: string) =>
      ({
        id: 'evt_' + randomUUID(),
        livemode: false,
        type: 'refund.updated',
        data: {
          object: {
            ...current,
            id: ref,
            object: 'refund',
            status: 'succeeded',
            metadata: { refund_id: row.id },
          },
        },
      }) as never;
    // Snapshot says succeeded, but Stripe's latest state is pending.
    await ingestStripeRefundEvent(makeEvent(id));
    expect((await getOrder(pool, buyer, order.id)).status).toBe('refund_pending');
    expect(
      (await pool.query("SELECT 1 FROM journals WHERE order_id=$1 AND kind='refund'", [order.id]))
        .rowCount,
    ).toBe(0);
    await expect(ingestStripeRefundEvent(makeEvent('re_other_identity'))).rejects.toThrow();
    expect(
      (await pool.query('SELECT provider_ref FROM refunds WHERE id=$1', [row.id])).rows[0]
        .provider_ref,
    ).toBe(id);
    // Cleanly complete the test-owned job, preserving its audit trail.
    current.status = 'succeeded';
    await ingestStripeRefundEvent(makeEvent(id));
    await processStripeRefunds();
  });

  it('rejects connected-account refund events for platform destination charges', async () => {
    await expect(
      ingestStripeRefundEvent({
        id: 'evt_wrong_scope',
        livemode: false,
        account: 'acct_other',
        type: 'refund.updated',
      } as never),
    ).rejects.toThrow();
  });

  it('requests a durable refund, reverses transfer economics, and leaves the license unchanged', async () => {
    setStripeRefundPortForTests({
      createRefund: async (params, options) => {
        createCalls += 1;
        const order = (
          await pool.query(
            'SELECT price FROM orders WHERE id=(SELECT order_id FROM payment_attempts WHERE payment_intent_ref=$1)',
            [params.payment_intent],
          )
        ).rows[0];
        const id = 're_ok_' + (options?.idempotencyKey ?? randomUUID()).toString().slice(-8);
        const refund: StripeRefund = {
          id,
          livemode: false,
          status: 'succeeded',
          amount: order.price.total_minor,
          currency: 'eur',
          payment_intent: params.payment_intent,
          charge: 'ch_' + id,
          failure_reason: null,
        };
        refunds.set(id, refund);
        return refund;
      },
      retrieveRefund: async (id) => refunds.get(id)!,
    });
    const { order } = await paidStripeOrder();
    const licenseBefore = (
      await pool.query('SELECT status FROM licenses WHERE order_id=$1', [order.id])
    ).rows[0]?.status;
    const result = await transaction((db) =>
      requestRefund(db, admin, order.id, 'Reembolso de prueba Stripe total'),
    );
    expect(result.status).toBe('refund_pending');
    expect(createCalls).toBe(0);
    await processStripeRefunds();
    expect(createCalls).toBe(1);
    await processStripeRefunds();
    expect(createCalls).toBe(1);
    expect((await getOrder(pool, buyer, order.id)).status).toBe('refunded');
    expect(
      (await pool.query("SELECT * FROM journals WHERE order_id=$1 AND kind='refund'", [order.id]))
        .rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT * FROM journals WHERE order_id=$1 AND kind='stripe_transfer_reversal'",
          [order.id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (await pool.query('SELECT status FROM licenses WHERE order_id=$1', [order.id])).rows[0]
        ?.status,
    ).toBe(licenseBefore);
    const refund = (await pool.query('SELECT * FROM refunds WHERE order_id=$1', [order.id]))
      .rows[0];
    expect(refund.status).toBe('succeeded');
    expect(refund.provider_ref).toMatch(/^re_/);
    await expect(
      pool.query('UPDATE refunds SET provider_ref=$2 WHERE id=$1', [refund.id, 're_other']),
    ).rejects.toThrow(/immutable/i);
  });

  it('blocks license issuance while a refund is pending', async () => {
    setStripeRefundPortForTests(mockPort('pending'));
    config.payments = 'sandbox';
    const r = await transaction((db) =>
      createRequest(db, buyer, { organization_id: demoIds.org, asset_id: assetId, usage: usage() }),
    );
    const q = await transaction((db) => createQuote(db, buyer, { request_id: r.id }));
    const o = await transaction((db) => createOrder(db, buyer, { quote_id: q.id }));
    await transaction((db) =>
      acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
    );
    const attempt = await checkout(buyer, o.id);
    await persistPaymentEvent('sandbox', randomUUID(), {
      order_id: o.id,
      attempt_id: attempt.attempt_id!,
      amount_minor: o.price.total_minor,
      currency: 'EUR',
      type: 'payment.succeeded',
      sandbox: true,
    });
    await processPaymentEvents();
    expect((await getOrder(pool, buyer, o.id)).status).toBe('paid');
    const pi = 'pi_pending_' + randomUUID().slice(0, 8);
    await pool.query(
      "UPDATE payment_attempts SET provider='stripe', payment_intent_ref=$2, status='succeeded' WHERE id=$1",
      [attempt.attempt_id, pi],
    );
    config.payments = 'stripe';
    setStripeRefundPortForTests({
      createRefund: async (params, options) => {
        const id = 're_pending_' + (options?.idempotencyKey ?? '').slice(-8);
        const refund: StripeRefund = {
          id,
          livemode: false,
          status: 'pending',
          amount: o.price.total_minor,
          currency: 'eur',
          payment_intent: params.payment_intent,
          charge: 'ch_pending',
          failure_reason: null,
        };
        refunds.set(id, refund);
        return refund;
      },
      retrieveRefund: async (id) => refunds.get(id)!,
    });
    await transaction((db) => requestRefund(db, admin, o.id, 'Pendiente de proveedor Stripe'));
    await processStripeRefunds();
    await issueLicenses();
    expect((await getOrder(pool, buyer, o.id)).status).toBe('refund_pending');
    expect((await pool.query('SELECT 1 FROM licenses WHERE order_id=$1', [o.id])).rowCount).toBe(0);
  });

  it('finalizes a pending refund from webhook without double journaling', async () => {
    const { order, pi } = await paidStripeOrder();
    let refundId = '';
    setStripeRefundPortForTests({
      createRefund: async (params, options) => {
        refundId = 're_wh_' + (options?.idempotencyKey ?? randomUUID()).toString().slice(-8);
        const refund: StripeRefund = {
          id: refundId,
          livemode: false,
          status: 'pending',
          amount: order.price.total_minor,
          currency: 'eur',
          payment_intent: params.payment_intent,
          charge: 'ch_wh',
          failure_reason: null,
        };
        refunds.set(refundId, refund);
        return refund;
      },
      retrieveRefund: async (id) => refunds.get(id)!,
    });
    await transaction((db) => requestRefund(db, admin, order.id, 'Webhook completar reembolso'));
    await processStripeRefunds();
    expect((await getOrder(pool, buyer, order.id)).status).toBe('refund_pending');
    const row = (await pool.query('SELECT * FROM refunds WHERE order_id=$1', [order.id])).rows[0];
    refunds.set(row.provider_ref, {
      ...refunds.get(row.provider_ref)!,
      status: 'succeeded',
      amount: order.price.total_minor,
      payment_intent: pi,
    });
    const eventId = 'evt_refund_' + randomUUID();
    await ingestStripeRefundEvent({
      id: eventId,
      object: 'event',
      livemode: false,
      type: 'refund.updated',
      data: {
        object: {
          id: row.provider_ref,
          object: 'refund',
          livemode: false,
          status: 'succeeded',
          amount: order.price.total_minor,
          currency: 'eur',
          payment_intent: pi,
          charge: 'ch_wh',
          metadata: { refund_id: row.id, order_id: order.id },
        },
      },
    } as never);
    await ingestStripeRefundEvent({
      id: eventId,
      object: 'event',
      livemode: false,
      type: 'refund.updated',
      data: {
        object: {
          id: row.provider_ref,
          object: 'refund',
          livemode: false,
          status: 'succeeded',
          amount: order.price.total_minor,
          currency: 'eur',
          payment_intent: pi,
          charge: 'ch_wh',
          metadata: { refund_id: row.id, order_id: order.id },
        },
      },
    } as never);
    expect((await getOrder(pool, buyer, order.id)).status).toBe('refunded');
    expect(
      (await pool.query("SELECT * FROM journals WHERE order_id=$1 AND kind='refund'", [order.id]))
        .rowCount,
    ).toBe(1);
  });

  it('marks failed refunds for review without pretending money returned', async () => {
    const { order } = await paidStripeOrder();
    setStripeRefundPortForTests({
      createRefund: async (params, options) => {
        const id = 're_fail_' + (options?.idempotencyKey ?? '').slice(-8);
        const refund: StripeRefund = {
          id,
          livemode: false,
          status: 'failed',
          amount: order.price.total_minor,
          currency: 'eur',
          payment_intent: params.payment_intent,
          charge: 'ch_fail',
          failure_reason: 'insufficient_funds',
        };
        refunds.set(id, refund);
        return refund;
      },
      retrieveRefund: async (id) => refunds.get(id)!,
    });
    await transaction((db) => requestRefund(db, admin, order.id, 'Fallo controlado de reembolso'));
    await processStripeRefunds();
    expect((await getOrder(pool, buyer, order.id)).status).toBe('paid_requires_review');
    expect(
      (await pool.query('SELECT status,failure_reason FROM refunds WHERE order_id=$1', [order.id]))
        .rows[0],
    ).toEqual({ status: 'failed', failure_reason: 'insufficient_funds' });
    expect(
      (await pool.query("SELECT 1 FROM journals WHERE order_id=$1 AND kind='refund'", [order.id]))
        .rowCount,
    ).toBe(0);
  });
});
