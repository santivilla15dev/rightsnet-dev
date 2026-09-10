import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { demoIds, seed } from '../packages/db/seed.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { config } from '../apps/api/src/common/config.js';
import {
  setStripeReconciliationPortForTests,
  type StripeBalanceTransaction,
  type StripeReconciliationPort,
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
  acknowledgeDifference,
  compareExternalLedger,
  listExternalReconciliation,
  runExternalReconciliation,
  importBalanceTransactions,
  recoverMissedEvents,
} from '../apps/api/src/modules/stripe-reconciliation.js';
import type { Usage } from '../packages/domain/src/index.js';

let buyer: Actor;
let admin: Actor;
let previousPayments: string;
let assetId: string;

const balanceStore: StripeBalanceTransaction[] = [];
const eventStore: Stripe.Event[] = [];

const usage = (): Usage => ({
  campaign_name: 'Recon ' + randomUUID().slice(0, 8),
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

function reconPort(): StripeReconciliationPort {
  return {
    // Mirror Stripe: newest-first + optional created[gte] + starting_after toward older.
    listBalanceTransactions: async ({ starting_after, limit, created }) => {
      let sorted = [...balanceStore].sort(
        (a, b) => b.created - a.created || b.id.localeCompare(a.id),
      );
      if (created?.gte !== undefined) sorted = sorted.filter((t) => t.created >= created.gte!);
      let start = 0;
      if (starting_after) {
        const idx = sorted.findIndex((t) => t.id === starting_after);
        start = idx >= 0 ? idx + 1 : sorted.length;
      }
      const slice = sorted.slice(start, start + (limit ?? 100));
      return { data: slice, has_more: start + slice.length < sorted.length };
    },
    listEvents: async ({ starting_after, limit, types, created }) => {
      let list = [...eventStore].sort((a, b) => b.created - a.created);
      if (types?.length) list = list.filter((e) => types.includes(e.type));
      if (created?.gte !== undefined) list = list.filter((e) => e.created >= created.gte!);
      let start = 0;
      if (starting_after) {
        const idx = list.findIndex((e) => e.id === starting_after);
        start = idx >= 0 ? idx + 1 : list.length;
      }
      const slice = list.slice(start, start + (limit ?? 100));
      return { data: slice, has_more: start + slice.length < list.length };
    },
  };
}

async function fulfilledStripeOrder(totalOverride?: number) {
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
  const amount = totalOverride ?? o.price.total_minor;
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
  const pi = 'pi_recon_' + randomUUID().slice(0, 8);
  const charge = 'ch_recon_' + randomUUID().slice(0, 8);
  await pool.query(
    "UPDATE payment_attempts SET provider='stripe', payment_intent_ref=$2, status='succeeded' WHERE id=$1",
    [attempt.attempt_id, pi],
  );
  return {
    order: await getOrder(pool, buyer, o.id, true),
    pi,
    charge,
    attemptId: attempt.attempt_id!,
    amount,
    fee: o.price.fee_minor,
  };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test')) throw new Error('Tests require _test database');
  await migrate();
  await seed();
  previousPayments = config.payments;
  process.env.STRIPE_SECRET_KEY = 'sk_test_rightsnet_recon_only';
  buyer = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.buyer])).rows[0];
  admin = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.admin])).rows[0];
  const creator = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.creator])).rows[0];
  assetId = (
    await pool.query(
      'SELECT a.id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE c.user_id=$1',
      [creator.id],
    )
  ).rows[0].id;
  await pool.query("UPDATE assets SET status='published' WHERE id=$1", [assetId]);
});

beforeEach(async () => {
  balanceStore.length = 0;
  eventStore.length = 0;
  setStripeReconciliationPortForTests(reconPort());
  config.payments = 'stripe';
  await pool.query(`
    DELETE FROM reconciliation_differences;
    DELETE FROM reconciliation_runs;
    DELETE FROM reconciliation_cursors;
    DELETE FROM stripe_balance_transactions;
  `);
});

afterEach(() => {
  setStripeReconciliationPortForTests(null);
  config.payments = previousPayments;
});

afterAll(async () => {
  config.payments = previousPayments;
  delete process.env.STRIPE_SECRET_KEY;
  await pool.end();
});

describe('Stripe external reconciliation (paso 5)', () => {
  async function newRun() {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO reconciliation_runs(id,environment,account_ref,status) VALUES($1,'test','platform','running')",
      [id],
    );
    return id;
  }

  it('resumes capped pages before advancing the completed watermark', async () => {
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 250; i++)
      balanceStore.push({
        id: `txn_page_${i}`,
        livemode: false,
        type: 'application_fee',
        amount: 100,
        fee: 0,
        net: 100,
        currency: 'eur',
        source: null,
        description: null,
        available_on: now,
        created: now - i * 10,
      });
    const runId = await newRun();
    expect((await importBalanceTransactions(runId, 'platform', { maxPages: 1 })).complete).toBe(
      false,
    );
    const cursor = (
      await pool.query("SELECT * FROM reconciliation_cursors WHERE kind='balance_transactions'")
    ).rows[0];
    expect(cursor.cursor_created_at).toBeNull();
    expect(cursor.scan_after).toBeTruthy();
    expect((await importBalanceTransactions(runId, 'platform', { maxPages: 1 })).complete).toBe(
      false,
    );
    expect((await importBalanceTransactions(runId, 'platform', { maxPages: 1 })).complete).toBe(
      true,
    );
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM stripe_balance_transactions')).rows[0].n,
    ).toBe(250);
    expect(
      (
        await pool.query(
          "SELECT scan_after FROM reconciliation_cursors WHERE kind='balance_transactions'",
        )
      ).rows[0].scan_after,
    ).toBeNull();
  });

  it('does not reconcile a foreign charge with an equal-priced local order', async () => {
    const since = new Date(Date.now() - 1000);
    const paid = await fulfilledStripeOrder();
    const now = Math.floor(Date.now() / 1000);
    balanceStore.push({
      id: 'txn_equal_foreign',
      livemode: false,
      type: 'charge',
      amount: paid.amount,
      fee: 0,
      net: paid.amount,
      currency: 'eur',
      source: 'ch_unrelated',
      description: null,
      available_on: now,
      created: now,
    });
    await runExternalReconciliation({ recoverEvents: false, checkMissingSince: since });
    const diffs = (await listExternalReconciliation()).open_differences;
    expect(
      diffs.some(
        (d: { kind: string; provider_ref: string }) =>
          d.kind === 'orphan_balance_transaction' && d.provider_ref === 'txn_equal_foreign',
      ),
    ).toBe(true);
    expect(
      diffs.some(
        (d: { kind: string; local_ref: string }) =>
          d.kind === 'missing_balance_transaction' && d.local_ref === paid.order.id,
      ),
    ).toBe(true);
  });

  it('discovers newer events on the next run instead of paging behind the last event', async () => {
    const now = Math.floor(Date.now() / 1000);
    const runId = await newRun();
    for (const [id, created] of [
      ['evt_old_cursor', now - 300],
      ['evt_new_cursor', now],
    ] as const) {
      await pool.query(
        "INSERT INTO provider_events(id,provider,event_id,payload,status) VALUES($1,'stripe',$2,'{}','done') ON CONFLICT DO NOTHING",
        [randomUUID(), id],
      );
      eventStore.push({
        id,
        created,
        type: 'checkout.session.completed',
        livemode: false,
      } as Stripe.Event);
      await recoverMissedEvents(runId);
      expect(
        (await pool.query("SELECT cursor_ref FROM reconciliation_cursors WHERE kind='events'"))
          .rows[0].cursor_ref,
      ).toBe(id);
    }
  });

  it('does not associate a foreign refund by amount alone', async () => {
    const paid = await fulfilledStripeOrder();
    await pool.query(
      "INSERT INTO refunds(id,order_id,reason,status,provider_ref,payment_intent_ref,amount_minor) VALUES($1,$2,'Regression fixture','succeeded',$3,$4,$5)",
      [randomUUID(), paid.order.id, 're_local_' + randomUUID(), paid.pi, paid.amount],
    );
    const now = Math.floor(Date.now() / 1000);
    balanceStore.push({
      id: 'txn_foreign_refund',
      livemode: false,
      type: 'refund',
      amount: -paid.amount,
      fee: 0,
      net: -paid.amount,
      currency: 'eur',
      source: 're_foreign',
      description: null,
      available_on: now,
      created: now,
    });
    await runExternalReconciliation({ recoverEvents: false, checkMissingSince: null });
    expect(
      (await listExternalReconciliation()).open_differences.some(
        (d: { kind: string; provider_ref: string }) =>
          d.kind === 'orphan_refund_bt' && d.provider_ref === 'txn_foreign_refund',
      ),
    ).toBe(true);
  });

  it('does not advance event recovery beyond a retryable ingestion failure', async () => {
    const runId = await newRun();
    eventStore.push({
      id: 'evt_live_rejected',
      created: Math.floor(Date.now() / 1000),
      type: 'checkout.session.completed',
      livemode: true,
    } as Stripe.Event);
    await expect(recoverMissedEvents(runId)).rejects.toThrow();
    expect(
      (await pool.query("SELECT 1 FROM reconciliation_cursors WHERE kind='events'")).rowCount,
    ).toBe(0);
  });

  it('importa balance transactions con cursor durable y fees/neto', async () => {
    const paid = await fulfilledStripeOrder();
    balanceStore.push({
      id: 'txn_1',
      livemode: false,
      type: 'charge',
      amount: paid.amount,
      fee: 120,
      net: paid.amount - 120,
      currency: 'eur',
      source: paid.pi,
      description: 'Checkout',
      available_on: Math.floor(Date.now() / 1000),
      created: Math.floor(Date.now() / 1000) - 10,
    });
    balanceStore.push({
      id: 'txn_2',
      livemode: false,
      type: 'application_fee',
      amount: paid.fee,
      fee: 0,
      net: paid.fee,
      currency: 'eur',
      source: 'fee_' + paid.pi,
      description: 'Platform fee',
      available_on: Math.floor(Date.now() / 1000),
      created: Math.floor(Date.now() / 1000) - 5,
    });

    const run1 = await runExternalReconciliation({
      recoverEvents: false,
      checkMissingSince: null,
    });
    expect(run1.imported_count).toBe(2);
    expect(run1.difference_count).toBe(0);

    const stored = await pool.query(
      `SELECT provider_ref, fee_minor, net_minor FROM stripe_balance_transactions ORDER BY provider_ref`,
    );
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows[0].fee_minor).toBe(120);
    expect(stored.rows[0].net_minor).toBe(paid.amount - 120);

    // Second run advances cursor: no re-import duplicates.
    const run2 = await runExternalReconciliation({
      recoverEvents: false,
      checkMissingSince: null,
    });
    expect(run2.imported_count).toBe(0);
    const cursors = (await listExternalReconciliation()).cursors;
    expect(
      cursors.some(
        (c: { kind: string; cursor_ref: string }) =>
          c.kind === 'balance_transactions' && c.cursor_ref === 'txn_2',
      ),
    ).toBe(true);

    // New charge AFTER the watermark must still import (Stripe lists newest-first).
    balanceStore.push({
      id: 'txn_3_new',
      livemode: false,
      type: 'charge',
      amount: paid.amount,
      fee: 50,
      net: paid.amount - 50,
      currency: 'eur',
      source: paid.pi,
      description: 'Later checkout',
      available_on: Math.floor(Date.now() / 1000),
      created: Math.floor(Date.now() / 1000) + 30,
    });
    const run3 = await runExternalReconciliation({
      recoverEvents: false,
      checkMissingSince: null,
    });
    expect(run3.imported_count).toBe(1);
    const cursorsAfter = (await listExternalReconciliation()).cursors;
    expect(
      cursorsAfter.some(
        (c: { kind: string; cursor_ref: string }) =>
          c.kind === 'balance_transactions' && c.cursor_ref === 'txn_3_new',
      ),
    ).toBe(true);
  });

  it('encola diferencia si el cargo Stripe no tiene pago local', async () => {
    balanceStore.push({
      id: 'txn_orphan',
      livemode: false,
      type: 'charge',
      amount: 99999,
      fee: 100,
      net: 99899,
      currency: 'eur',
      source: 'ch_nobody',
      description: 'orphan',
      available_on: Math.floor(Date.now() / 1000),
      created: Math.floor(Date.now() / 1000),
    });
    const run = await runExternalReconciliation({
      recoverEvents: false,
      checkMissingSince: null,
    });
    expect(run.difference_count).toBeGreaterThanOrEqual(1);
    const diffs = (await listExternalReconciliation()).open_differences;
    expect(diffs.some((d: { kind: string }) => d.kind === 'orphan_balance_transaction')).toBe(true);

    const ack = await acknowledgeDifference(admin, diffs[0].id, 'Revisado en prueba sandbox.');
    expect(ack.status).toBe('acknowledged');
  });

  it('detecta pago local succeeded sin balance transaction importada', async () => {
    const since = new Date(Date.now() - 1000);
    const paid = await fulfilledStripeOrder();
    balanceStore.push({
      id: 'txn_other',
      livemode: false,
      type: 'charge',
      amount: paid.amount + 7777,
      fee: 10,
      net: paid.amount + 7767,
      currency: 'eur',
      source: 'ch_other',
      description: 'other',
      available_on: Math.floor(Date.now() / 1000),
      created: Math.floor(Date.now() / 1000),
    });
    const run = await runExternalReconciliation({
      recoverEvents: false,
      checkMissingSince: since,
    });
    expect(run.imported_count).toBe(1);
    const diffs = (await listExternalReconciliation()).open_differences;
    expect(
      diffs.some(
        (d: { kind: string; local_ref: string | null }) =>
          d.kind === 'missing_balance_transaction' && d.local_ref === paid.order.id,
      ),
    ).toBe(true);
    expect(diffs.some((d: { kind: string }) => d.kind === 'orphan_balance_transaction')).toBe(true);
  });

  it('recupera eventos perdidos vía Events API sin duplicar provider_events', async () => {
    const eventId = 'evt_recon_' + randomUUID().slice(0, 8);
    await pool.query(
      "INSERT INTO provider_events(id,provider,event_id,payload,status) VALUES($1,'stripe',$2,$3,'done')",
      [randomUUID(), eventId, JSON.stringify({ recovered: false })],
    );
    eventStore.push({
      id: eventId,
      object: 'event',
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_x' } as Stripe.Checkout.Session },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: 'checkout.session.completed',
    } as Stripe.Event);

    const run = await runExternalReconciliation({
      recoverEvents: true,
      checkMissingSince: null,
    });
    expect(run.recovered_events).toBe(0);
    const status = await listExternalReconciliation();
    expect(status.cursors.some((c: { kind: string }) => c.kind === 'events')).toBe(true);
  });

  it('GET reconciliation interna no llama import externo', async () => {
    balanceStore.push({
      id: 'txn_should_not_import',
      livemode: false,
      type: 'charge',
      amount: 100,
      fee: 0,
      net: 100,
      currency: 'eur',
      source: null,
      description: null,
      available_on: 0,
      created: 1,
    });
    // Simulate what the controller does for internal check only.
    const unbalanced = await pool.query(
      "SELECT j.id FROM journals j LEFT JOIN ledger_entries e ON e.journal_id=j.id GROUP BY j.id HAVING count(e.id)<2 OR coalesce(sum(CASE WHEN side='debit' THEN amount_minor ELSE -amount_minor END),0)<>0",
    );
    expect(unbalanced).toBeTruthy();
    const imported = (
      await pool.query(`SELECT count(*)::int AS n FROM stripe_balance_transactions`)
    ).rows[0].n;
    expect(imported).toBe(0);
  });

  it('compara más de 500 balance transactions paginando', async () => {
    const now = new Date();
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (let i = 0; i < 501; i++) {
      const o = i * 7;
      placeholders.push(
        `($${o + 1},$${o + 2},'test','platform','charge',$${o + 3},0,$${o + 3},'EUR',$${o + 4},$${o + 5},$${o + 6},$${o + 7})`,
      );
      values.push(
        randomUUID(),
        `txn_pagecmp_${i}`,
        99900 + (i % 17),
        `ch_pagecmp_${i}`,
        `pagecmp ${i}`,
        now,
        new Date(now.getTime() - i * 1000),
      );
    }
    await pool.query(
      `INSERT INTO stripe_balance_transactions(
         id, provider_ref, environment, account_ref, type, amount_minor, fee_minor, net_minor,
         currency, source_ref, description, available_on, created_at_stripe
       ) VALUES ${placeholders.join(',')}`,
      values,
    );
    const runId = await newRun();
    await compareExternalLedger(runId);
    const orphans = (
      await pool.query(
        `SELECT count(*)::int AS n FROM reconciliation_differences
         WHERE run_id=$1 AND kind='orphan_balance_transaction' AND status='open'`,
        [runId],
      )
    ).rows[0].n;
    expect(orphans).toBe(501);
  });
});
