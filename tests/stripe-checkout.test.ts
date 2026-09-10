import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type Stripe from 'stripe';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { demoIds, seed } from '../packages/db/seed.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { config } from '../apps/api/src/common/config.js';
import {
  setStripeCheckoutPortForTests,
  type StripeCheckoutPort,
} from '../apps/api/src/integrations/stripe.js';
import { acceptOrder, createOrder, createQuote, createRequest, getOrder } from '../apps/api/src/modules/licensing.js';
import { processPaymentEvents } from '../apps/api/src/modules/payments.js';
import { stripeCheckout } from '../apps/api/src/modules/stripe-checkout.js';
import { ingestStripeCheckoutEvent } from '../apps/api/src/modules/stripe-events.js';
import { DomainError, type Usage } from '../packages/domain/src/index.js';

const destination = 'acct_test_rightsnet';
let buyer: Actor;
let assetId: string;
let previousPayments: string;
let previousConnected: string | null;
let createCalls = 0;

const usage = (): Usage => ({
  campaign_name: 'Stripe ' + randomUUID().slice(0, 8),
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

function mockPort(store: Map<string, Stripe.Checkout.Session>): StripeCheckoutPort {
  return {
    requireRecipient: async (accountId) => {
      if (accountId !== destination) throw new DomainError('CONNECT_ONBOARDING_REQUIRED', 422);
    },
    createSession: async (params, options) => {
      createCalls += 1;
      const id = 'cs_test_' + (options?.idempotencyKey ?? randomUUID());
      const session = {
        id,
        object: 'checkout.session',
        livemode: false,
        mode: 'payment',
        status: 'open',
        payment_status: 'unpaid',
        amount_total: params.line_items?.[0]?.price_data?.unit_amount ?? 0,
        currency: 'eur',
        url: 'https://checkout.stripe.test/' + id,
        metadata: params.metadata ?? {},
        payment_intent: null,
      } as Stripe.Checkout.Session;
      store.set(id, session);
      return session;
    },
    retrieveSession: async (id) => {
      const session = store.get(id);
      if (!session) throw new DomainError('CHECKOUT_URL_MISSING', 502);
      return session;
    },
  };
}

async function payableOrder() {
  const r = await transaction((db) =>
    createRequest(db, buyer, { organization_id: demoIds.org, asset_id: assetId, usage: usage() }),
  );
  const q = await transaction((db) => createQuote(db, buyer, { request_id: r.id }));
  const o = await transaction((db) => createOrder(db, buyer, { quote_id: q.id }));
  await transaction((db) =>
    acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
  );
  return getOrder(pool, buyer, o.id, true);
}

function stripeEvent(
  type: string,
  session: Stripe.Checkout.Session,
  eventId = 'evt_' + randomUUID(),
): Stripe.Event {
  return {
    id: eventId,
    object: 'event',
    livemode: false,
    type,
    data: { object: session },
  } as Stripe.Event;
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test'))
    throw new Error('Tests require a dedicated database ending _test');
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Unsafe test DB name');
  url.pathname = '/postgres';
  const management = new pg.Pool({ connectionString: url.toString() });
  if (!(await management.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
    await management.query('CREATE DATABASE ' + name);
  await management.end();
  await migrate();
  await seed();
  buyer = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.buyer])).rows[0];
  assetId = (
    await pool.query(
      'SELECT a.id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE c.user_id=$1',
      [demoIds.creator],
    )
  ).rows[0].id;
  previousConnected = (
    await pool.query(
      'SELECT c.connected_account FROM assets a JOIN creators c ON c.id=a.creator_id WHERE a.id=$1',
      [assetId],
    )
  ).rows[0].connected_account;
  await pool.query(
    'UPDATE creators SET connected_account=$1 FROM assets a WHERE a.creator_id=creators.id AND a.id=$2',
    [destination, assetId],
  );
  previousPayments = config.payments;
  config.payments = 'stripe';
  process.env.STRIPE_SECRET_KEY = 'sk_test_rightsnet_local_only';
});

afterAll(async () => {
  config.payments = previousPayments;
  delete process.env.STRIPE_SECRET_KEY;
  await pool.query(
    'UPDATE creators SET connected_account=$1 FROM assets a WHERE a.creator_id=creators.id AND a.id=$2',
    [previousConnected, assetId],
  );
  await pool.end();
});

beforeEach(() => {
  createCalls = 0;
  setStripeCheckoutPortForTests(mockPort(new Map()));
});

afterEach(() => {
  setStripeCheckoutPortForTests(null);
});

describe.sequential('Stripe checkout adapter (mocked provider)', () => {
  it('persists an immutable stripe_request snapshot and reuses one open attempt', async () => {
    const order = await payableOrder();
    const first = await stripeCheckout(buyer, order.id);
    const second = await stripeCheckout(buyer, order.id);
    expect(first.attempt_id).toBe(second.attempt_id);
    expect(first.url).toBe(second.url);
    expect(createCalls).toBe(1);
    const attempt = (
      await pool.query('SELECT * FROM payment_attempts WHERE id=$1', [first.attempt_id])
    ).rows[0];
    expect(attempt.provider).toBe('stripe');
    expect(attempt.status).toBe('pending');
    expect(attempt.stripe_request).toBeTruthy();
    expect(attempt.stripe_request.metadata.order_id).toBe(order.id);
    expect(attempt.stripe_request.metadata.attempt_id).toBe(first.attempt_id);
    expect(attempt.stripe_request.payment_intent_data.transfer_data.destination).toBe(destination);
    expect(attempt.provider_ref).toMatch(/^cs_test_/);
    await expect(
      pool.query('UPDATE payment_attempts SET stripe_request=$2 WHERE id=$1', [
        attempt.id,
        JSON.stringify({}),
      ]),
    ).rejects.toThrow(/immutable|Stripe request snapshot/i);
  });

  it('refuses attempts without a durable snapshot', async () => {
    const order = await payableOrder();
    const attemptId = randomUUID();
    await pool.query(
      "INSERT INTO payment_attempts(id,order_id,provider,status) VALUES($1,$2,'stripe','creating')",
      [attemptId, order.id],
    );
    await pool.query("UPDATE orders SET status='payment_processing' WHERE id=$1", [order.id]);
    await expect(stripeCheckout(buyer, order.id)).rejects.toMatchObject({
      code: 'STRIPE_ATTEMPT_REQUIRES_REVIEW',
    });
  });

  it('ingests a paid webhook once and ignores duplicate event ids', async () => {
    const store = new Map<string, Stripe.Checkout.Session>();
    setStripeCheckoutPortForTests(mockPort(store));
    const order = await payableOrder();
    const checkout = await stripeCheckout(buyer, order.id);
    const attempt = (
      await pool.query('SELECT * FROM payment_attempts WHERE id=$1', [checkout.attempt_id])
    ).rows[0];
    const pi = {
      id: 'pi_' + randomUUID().slice(0, 8),
      object: 'payment_intent',
      livemode: false,
      amount: order.price.total_minor,
      amount_received: order.price.total_minor,
      currency: 'eur',
      status: 'succeeded',
      application_fee_amount: order.price.fee_minor,
      metadata: { order_id: order.id, attempt_id: attempt.id },
      transfer_data: { destination },
    } as unknown as Stripe.PaymentIntent;
    const session = {
      ...store.get(attempt.provider_ref)!,
      status: 'complete',
      payment_status: 'paid',
      amount_total: order.price.total_minor,
      payment_intent: pi,
      metadata: { order_id: order.id, attempt_id: attempt.id },
    } as unknown as Stripe.Checkout.Session;
    store.set(attempt.provider_ref, session);
    const eventId = 'evt_paid_' + randomUUID();
    await ingestStripeCheckoutEvent(stripeEvent('checkout.session.completed', session, eventId));
    await ingestStripeCheckoutEvent(stripeEvent('checkout.session.completed', session, eventId));
    expect(
      (await pool.query("SELECT * FROM provider_events WHERE provider='stripe' AND event_id=$1", [
        eventId,
      ])).rowCount,
    ).toBe(1);
    await processPaymentEvents();
    expect((await getOrder(pool, buyer, order.id)).status).toBe('paid');
    expect(
      (await pool.query("SELECT * FROM journals WHERE order_id=$1 AND kind='payment'", [order.id]))
        .rowCount,
    ).toBe(1);
    expect(
      (await pool.query('SELECT payment_intent_ref FROM payment_attempts WHERE id=$1', [attempt.id]))
        .rows[0].payment_intent_ref,
    ).toBe(pi.id);
  });

  it('retries when webhook arrives before provider_ref is saved', async () => {
    const order = await payableOrder();
    const checkout = await stripeCheckout(buyer, order.id);
    const attempt = (
      await pool.query('SELECT * FROM payment_attempts WHERE id=$1', [checkout.attempt_id])
    ).rows[0];
    // Simulate race: clear provider_ref after create (test-only; production trigger blocks updates).
    await pool.query('ALTER TABLE payment_attempts DISABLE TRIGGER immutable_stripe_request');
    await pool.query('UPDATE payment_attempts SET provider_ref=NULL WHERE id=$1', [attempt.id]);
    await pool.query('ALTER TABLE payment_attempts ENABLE TRIGGER immutable_stripe_request');
    const session = {
      id: attempt.provider_ref,
      object: 'checkout.session',
      livemode: false,
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      amount_total: order.price.total_minor,
      currency: 'eur',
      metadata: { order_id: order.id, attempt_id: attempt.id },
      payment_intent: {
        id: 'pi_race',
        object: 'payment_intent',
        livemode: false,
        amount: order.price.total_minor,
        amount_received: order.price.total_minor,
        currency: 'eur',
        status: 'succeeded',
        application_fee_amount: order.price.fee_minor,
        metadata: { order_id: order.id, attempt_id: attempt.id },
        transfer_data: { destination },
      },
    } as unknown as Stripe.Checkout.Session;
    setStripeCheckoutPortForTests({
      requireRecipient: async () => undefined,
      createSession: async () => session,
      retrieveSession: async () => session,
    });
    await expect(
      ingestStripeCheckoutEvent(stripeEvent('checkout.session.completed', session)),
    ).rejects.toMatchObject({ code: 'PAYMENT_UNCONFIRMED', status: 409 });
  });

  it('quarantines foreign Checkout sessions without RightsNet metadata', async () => {
    const store = new Map<string, Stripe.Checkout.Session>();
    setStripeCheckoutPortForTests(mockPort(store));
    const session = {
      id: 'cs_test_foreign_usd',
      object: 'checkout.session',
      livemode: false,
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      amount_total: 3000,
      currency: 'usd',
      metadata: {},
      payment_intent: null,
    } as unknown as Stripe.Checkout.Session;
    store.set(session.id, session);
    const eventId = 'evt_foreign_' + randomUUID();
    await ingestStripeCheckoutEvent(stripeEvent('checkout.session.completed', session, eventId));
    expect(
      (await pool.query('SELECT status,error FROM provider_events WHERE event_id=$1', [eventId]))
        .rows[0],
    ).toEqual({ status: 'failed', error: 'PAYMENT_MISMATCH' });
    // Second ingest is a no-op (idempotent quarantine).
    await ingestStripeCheckoutEvent(stripeEvent('checkout.session.completed', session, eventId));
  });

  it('acknowledges permanent mismatches without infinite retry pressure', async () => {
    const store = new Map<string, Stripe.Checkout.Session>();
    setStripeCheckoutPortForTests(mockPort(store));
    const order = await payableOrder();
    const checkout = await stripeCheckout(buyer, order.id);
    const attempt = (
      await pool.query('SELECT * FROM payment_attempts WHERE id=$1', [checkout.attempt_id])
    ).rows[0];
    const session = {
      ...store.get(attempt.provider_ref)!,
      status: 'complete',
      payment_status: 'paid',
      amount_total: 1,
      metadata: { order_id: order.id, attempt_id: attempt.id },
      payment_intent: {
        id: 'pi_bad',
        object: 'payment_intent',
        livemode: false,
        amount: 1,
        amount_received: 1,
        currency: 'eur',
        status: 'succeeded',
        application_fee_amount: order.price.fee_minor,
        metadata: { order_id: order.id, attempt_id: attempt.id },
        transfer_data: { destination },
      },
    } as unknown as Stripe.Checkout.Session;
    store.set(attempt.provider_ref, session);
    const eventId = 'evt_mismatch_' + randomUUID();
    await ingestStripeCheckoutEvent(stripeEvent('checkout.session.completed', session, eventId));
    expect(
      (await pool.query("SELECT status,error FROM provider_events WHERE event_id=$1", [eventId]))
        .rows[0],
    ).toEqual({ status: 'failed', error: 'PAYMENT_MISMATCH' });
    expect((await getOrder(pool, buyer, order.id)).status).toBe('paid_requires_review');
  });

  it('keeps the order locked when an old failure arrives while another attempt is active', async () => {
    const order = await payableOrder();
    const first = await stripeCheckout(buyer, order.id);
    await pool.query("UPDATE payment_attempts SET status='failed' WHERE id=$1", [first.attempt_id]);
    await pool.query("UPDATE orders SET status='awaiting_payment' WHERE id=$1", [order.id]);
    const second = await stripeCheckout(buyer, order.id);
    expect(second.attempt_id).not.toBe(first.attempt_id);
    await pool.query(
      'INSERT INTO provider_events(id,provider,event_id,payload) VALUES($1,$2,$3,$4)',
      [
        randomUUID(),
        'stripe',
        'evt_old_fail_' + randomUUID(),
        JSON.stringify({
          order_id: order.id,
          attempt_id: first.attempt_id,
          amount_minor: order.price.total_minor,
          currency: 'EUR',
          type: 'payment.failed',
          sandbox: false,
        }),
      ],
    );
    await processPaymentEvents();
    expect((await getOrder(pool, buyer, order.id)).status).toBe('payment_processing');
    expect(
      (await pool.query('SELECT status FROM payment_attempts WHERE id=$1', [second.attempt_id]))
        .rows[0].status,
    ).toBe('pending');
  });

  it('records a duplicate succeeded payment as review liability without a second license journal', async () => {
    const order = await payableOrder();
    const first = await stripeCheckout(buyer, order.id);
    await pool.query(
      'INSERT INTO provider_events(id,provider,event_id,payload) VALUES($1,$2,$3,$4)',
      [
        randomUUID(),
        'stripe',
        'evt_ok_' + randomUUID(),
        JSON.stringify({
          order_id: order.id,
          attempt_id: first.attempt_id,
          amount_minor: order.price.total_minor,
          currency: 'EUR',
          type: 'payment.succeeded',
          sandbox: false,
        }),
      ],
    );
    await processPaymentEvents();
    await pool.query("UPDATE payment_attempts SET status='succeeded' WHERE id=$1", [first.attempt_id]);
    const secondId = randomUUID();
    await pool.query(
      "INSERT INTO payment_attempts(id,order_id,provider,status,stripe_request) VALUES($1,$2,'stripe','pending',$3)",
      [secondId, order.id, JSON.stringify({ metadata: { order_id: order.id, attempt_id: secondId } })],
    );
    await pool.query(
      'INSERT INTO provider_events(id,provider,event_id,payload) VALUES($1,$2,$3,$4)',
      [
        randomUUID(),
        'stripe',
        'evt_dup_' + randomUUID(),
        JSON.stringify({
          order_id: order.id,
          attempt_id: secondId,
          amount_minor: order.price.total_minor,
          currency: 'EUR',
          type: 'payment.succeeded',
          sandbox: false,
        }),
      ],
    );
    await processPaymentEvents();
    expect((await getOrder(pool, buyer, order.id)).status).toBe('paid_requires_review');
    expect(
      (await pool.query("SELECT * FROM journals WHERE order_id=$1 AND kind='payment'", [order.id]))
        .rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT * FROM journals WHERE order_id=$1 AND kind LIKE 'duplicate_payment_%'",
          [order.id],
        )
      ).rowCount,
    ).toBe(1);
  });
});
