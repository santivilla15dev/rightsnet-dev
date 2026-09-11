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
  setStripeMoneyPortForTests,
  type StripeMoneyPort,
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
  ingestMoneyMovementEvent,
  relinkOrphanTransfersForCharge,
  reviewDispute,
} from '../apps/api/src/modules/stripe-money.js';
import type { Usage } from '../packages/domain/src/index.js';

let buyer: Actor;
let admin: Actor;
let creator: Actor;
let assetId: string;
let previousPayments: string;
const account = 'acct_test_money';
const store = {
  transfers: new Map<string, Stripe.Transfer>(),
  disputes: new Map<string, Stripe.Dispute>(),
  payouts: new Map<string, Stripe.Payout>(),
};

const usage = (): Usage => ({
  campaign_name: 'Money ' + randomUUID().slice(0, 8),
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

function moneyPort(): StripeMoneyPort {
  return {
    retrieveTransfer: async (id) => store.transfers.get(id)!,
    retrieveDispute: async (id) => store.disputes.get(id)!,
    retrievePayout: async (id) => store.payouts.get(id)!,
  };
}

async function fulfilledOrder() {
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
  config.payments = 'stripe';
  await issueLicenses();
  const pi = 'pi_money_' + randomUUID().slice(0, 8);
  await pool.query(
    "UPDATE payment_attempts SET provider='stripe', payment_intent_ref=$2, status='succeeded' WHERE id=$1",
    [attempt.attempt_id, pi],
  );
  return { order: await getOrder(pool, buyer, o.id, true), pi, attemptId: attempt.attempt_id! };
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
  await pool.query('UPDATE creators SET connected_account=$1 WHERE user_id=$2', [
    account,
    creator.id,
  ]);
  previousPayments = config.payments;
  process.env.STRIPE_SECRET_KEY = 'sk_test_rightsnet_money_only';
});

afterAll(async () => {
  config.payments = previousPayments;
  delete process.env.STRIPE_SECRET_KEY;
  await pool.end();
});

beforeEach(async () => {
  store.transfers.clear();
  store.disputes.clear();
  store.payouts.clear();
  config.payments = 'stripe';
  setStripeMoneyPortForTests(moneyPort());
  await pool.query('DELETE FROM stripe_transfer_reversals');
  await pool.query('DELETE FROM stripe_transfers');
  await pool.query('DELETE FROM disputes');
  await pool.query('DELETE FROM payout_records');
});

afterEach(() => {
  setStripeMoneyPortForTests(null);
  config.payments = previousPayments;
});

describe.sequential('Stripe transfers, disputes and payouts (mocked)', () => {
  it('records a destination transfer linked by order metadata without inventing a payout', async () => {
    const { order } = await fulfilledOrder();
    const transferId = 'tr_' + randomUUID().slice(0, 8);
    store.transfers.set(transferId, {
      id: transferId,
      object: 'transfer',
      livemode: false,
      amount: order.price.creator_minor,
      currency: 'eur',
      destination: account,
      reversed: false,
      metadata: { order_id: order.id },
      reversals: { object: 'list', data: [], has_more: false, url: '' },
    } as unknown as Stripe.Transfer);
    await ingestMoneyMovementEvent({
      id: 'evt_tr_' + randomUUID(),
      object: 'event',
      livemode: false,
      type: 'transfer.created',
      data: { object: { id: transferId, object: 'transfer' } },
    } as never);
    const row = (
      await pool.query('SELECT * FROM stripe_transfers WHERE provider_ref=$1', [transferId])
    ).rows[0];
    expect(row.order_id).toBe(order.id);
    expect(row.amount_minor).toBe(order.price.creator_minor);
    expect(row.status).toBe('paid');
    expect((await pool.query('SELECT 1 FROM payout_records')).rowCount).toBe(0);
  });

  it('idempotent transfer.created when provider_ref already exists', async () => {
    const { order } = await fulfilledOrder();
    const transferId = 'tr_dup_' + randomUUID().slice(0, 8);
    store.transfers.set(transferId, {
      id: transferId,
      object: 'transfer',
      livemode: false,
      amount: order.price.creator_minor,
      currency: 'eur',
      destination: account,
      reversed: false,
      metadata: { order_id: order.id },
      reversals: { object: 'list', data: [], has_more: false, url: '' },
    } as unknown as Stripe.Transfer);
    const evt = {
      id: 'evt_tr_dup_' + randomUUID(),
      object: 'event',
      livemode: false,
      type: 'transfer.created',
      data: { object: { id: transferId, object: 'transfer' } },
    } as unknown as Stripe.Event;
    await ingestMoneyMovementEvent(evt);
    await ingestMoneyMovementEvent({
      ...evt,
      id: 'evt_tr_dup2_' + randomUUID(),
    } as never);
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM stripe_transfers WHERE provider_ref=$1', [
        transferId,
      ])).rows[0].n,
    ).toBe(1);
  });

  it('opens a dispute for human review without revoking the license', async () => {
    const { order, pi } = await fulfilledOrder();
    const license = (
      await pool.query('SELECT id,status FROM licenses WHERE order_id=$1', [order.id])
    ).rows[0];
    expect(license.status).toBe('issued');
    const disputeId = 'dp_' + randomUUID().slice(0, 8);
    store.disputes.set(disputeId, {
      id: disputeId,
      object: 'dispute',
      livemode: false,
      amount: order.price.total_minor,
      currency: 'eur',
      status: 'needs_response',
      reason: 'fraudulent',
      charge: 'ch_dispute',
      payment_intent: pi,
      evidence_details: { due_by: Math.floor(Date.now() / 1000) + 86400 },
    } as unknown as Stripe.Dispute);
    await ingestMoneyMovementEvent({
      id: 'evt_dp_' + randomUUID(),
      object: 'event',
      livemode: false,
      type: 'charge.dispute.created',
      data: { object: { id: disputeId, object: 'dispute' } },
    } as never);
    expect((await getOrder(pool, buyer, order.id)).status).toBe('paid_requires_review');
    expect(
      (await pool.query('SELECT status FROM licenses WHERE order_id=$1', [order.id])).rows[0].status,
    ).toBe('issued');
    const dispute = (await pool.query('SELECT * FROM disputes WHERE provider_ref=$1', [disputeId]))
      .rows[0];
    expect(dispute.review_status).toBe('open');
    expect(dispute.order_id).toBe(order.id);
    expect(
      (await pool.query("SELECT 1 FROM incidents WHERE category='payment' AND details LIKE $1", [
        '%' + disputeId + '%',
      ])).rowCount,
    ).toBe(1);
    await transaction((db) =>
      reviewDispute(db, admin, dispute.id, {
        decision: 'acknowledge',
        note: 'Revisión humana registrada sin tocar la licencia.',
      }),
    );
    expect(
      (await pool.query('SELECT review_status FROM disputes WHERE id=$1', [dispute.id])).rows[0]
        .review_status,
    ).toBe('acknowledged');
  });

  it('stores payouts against the connected account and never against an order', async () => {
    const payoutId = 'po_' + randomUUID().slice(0, 8);
    store.payouts.set(payoutId, {
      id: payoutId,
      object: 'payout',
      livemode: false,
      amount: 50000,
      currency: 'eur',
      status: 'paid',
      arrival_date: Math.floor(Date.now() / 1000),
      failure_code: null,
      failure_message: null,
    } as unknown as Stripe.Payout);
    await ingestMoneyMovementEvent({
      id: 'evt_po_' + randomUUID(),
      object: 'event',
      livemode: false,
      type: 'payout.paid',
      account,
      data: { object: { id: payoutId, object: 'payout' } },
    } as never);
    const row = (
      await pool.query('SELECT * FROM payout_records WHERE provider_payout_id=$1', [payoutId])
    ).rows[0];
    expect(row.connected_account_ref).toBe(account);
    expect(row.amount_minor).toBe(50000);
    expect(row.status).toBe('paid');
    expect(Object.keys(row).includes('order_id')).toBe(false);
  });

  it('records transfer reversals without double-counting provider refs', async () => {
    const { order } = await fulfilledOrder();
    const transferId = 'tr_rev_' + randomUUID().slice(0, 8);
    const reversalId = 'trr_' + randomUUID().slice(0, 8);
    const base = {
      id: transferId,
      object: 'transfer',
      livemode: false,
      amount: order.price.creator_minor,
      currency: 'eur',
      destination: account,
      reversed: true,
      metadata: { order_id: order.id },
      reversals: {
        object: 'list',
        data: [
          {
            id: reversalId,
            object: 'transfer_reversal',
            amount: order.price.creator_minor,
            currency: 'eur',
            metadata: {},
          },
        ],
        has_more: false,
        url: '',
      },
    } as unknown as Stripe.Transfer;
    store.transfers.set(transferId, base);
    const eventId = 'evt_rev_' + randomUUID();
    await ingestMoneyMovementEvent({
      id: eventId,
      object: 'event',
      livemode: false,
      type: 'transfer.reversed',
      data: { object: { id: transferId, object: 'transfer' } },
    } as never);
    await ingestMoneyMovementEvent({
      id: eventId,
      object: 'event',
      livemode: false,
      type: 'transfer.reversed',
      data: { object: { id: transferId, object: 'transfer' } },
    } as never);
    expect(
      (await pool.query('SELECT status FROM stripe_transfers WHERE provider_ref=$1', [transferId]))
        .rows[0].status,
    ).toBe('reversed');
    expect(
      (await pool.query('SELECT * FROM stripe_transfer_reversals WHERE provider_ref=$1', [
        reversalId,
      ])).rowCount,
    ).toBe(1);
  });

  it('records partial transfer reversals without marking fully reversed', async () => {
    const { order } = await fulfilledOrder();
    const transferId = 'tr_partial_' + randomUUID().slice(0, 8);
    const reversalId = 'trr_partial_' + randomUUID().slice(0, 8);
    const partialAmount = Math.max(1, Math.floor(order.price.creator_minor / 2));
    store.transfers.set(transferId, {
      id: transferId,
      object: 'transfer',
      livemode: false,
      amount: order.price.creator_minor,
      currency: 'eur',
      destination: account,
      reversed: false,
      metadata: { order_id: order.id },
      reversals: {
        object: 'list',
        data: [
          {
            id: reversalId,
            object: 'transfer_reversal',
            amount: partialAmount,
            currency: 'eur',
            metadata: {},
          },
        ],
        has_more: false,
        url: '',
      },
    } as unknown as Stripe.Transfer);
    await ingestMoneyMovementEvent({
      id: 'evt_partial_' + randomUUID(),
      object: 'event',
      livemode: false,
      type: 'transfer.reversed',
      data: { object: { id: transferId, object: 'transfer' } },
    } as never);
    expect(
      (await pool.query('SELECT status FROM stripe_transfers WHERE provider_ref=$1', [transferId]))
        .rows[0].status,
    ).toBe('paid');
    expect(
      (
        await pool.query(
          'SELECT amount_minor FROM stripe_transfer_reversals WHERE provider_ref=$1',
          [reversalId],
        )
      ).rows[0].amount_minor,
    ).toBe(partialAmount);
  });

  it('relinks orphan transfers once charge_ref appears', async () => {
    const { order, attemptId } = await fulfilledOrder();
    const charge = 'ch_late_' + randomUUID().slice(0, 8);
    const transferId = 'tr_orphan_' + randomUUID().slice(0, 8);
    await pool.query(
      `INSERT INTO stripe_transfers(
         id,provider_ref,environment,connected_account_ref,order_id,payment_attempt_id,
         amount_minor,currency,status,source_transaction_ref)
       VALUES($1,$2,'test',$3,NULL,NULL,$4,'EUR','paid',$5)`,
      [randomUUID(), transferId, account, order.price.creator_minor, charge],
    );
    await pool.query('UPDATE payment_attempts SET charge_ref=$2 WHERE id=$1', [attemptId, charge]);
    expect(await relinkOrphanTransfersForCharge(charge)).toBe(1);
    const row = (
      await pool.query('SELECT order_id, payment_attempt_id FROM stripe_transfers WHERE provider_ref=$1', [
        transferId,
      ])
    ).rows[0];
    expect(row.order_id).toBe(order.id);
    expect(row.payment_attempt_id).toBe(attemptId);
  });
});
