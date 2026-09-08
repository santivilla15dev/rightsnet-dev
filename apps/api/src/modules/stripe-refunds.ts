import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { audit, pool, transaction, type DB } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { config } from '../common/config.js';
import {
  assertLiveCommerceAllowed,
  stripeRefundPort,
  type StripeRefund,
} from '../integrations/stripe.js';
import { journal, refundSandbox } from './payments.js';

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : (value?.id ?? null);
}

async function postRefundLedger(
  db: DB,
  order: { id: string; price: { fee_minor: number; creator_minor: number; total_minor: number } },
) {
  await journal(db, order.id, 'refund', [
    { account: 'platform_fee_revenue', side: 'debit', amount: order.price.fee_minor },
    { account: 'creator_payable', side: 'debit', amount: order.price.creator_minor },
    { account: 'psp_clearing', side: 'credit', amount: order.price.total_minor },
  ]);
  // Reverse only a transfer that was actually booked. Provider transfer/reversal facts are
  // tracked separately; inventing a reversal journal here would create a false clearing balance.
  if (
    (
      await db.query("SELECT 1 FROM journals WHERE order_id=$1 AND kind='sandbox_transfer'", [
        order.id,
      ])
    ).rowCount
  ) {
    await journal(db, order.id, 'sandbox_transfer_reversal', [
      { account: 'psp_clearing', side: 'debit', amount: order.price.creator_minor },
      { account: 'creator_payable', side: 'credit', amount: order.price.creator_minor },
    ]);
  }
}

export async function requestRefund(db: DB, user: Actor, orderId: string, reason: string) {
  if (config.payments === 'sandbox') return refundSandbox(db, user, orderId, reason);
  if (config.payments !== 'stripe') throw new DomainError('STRIPE_NOT_CONFIGURED', 503);
  const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
  if (!o) throw new DomainError('NOT_FOUND', 404);
  const existing = (await db.query('SELECT * FROM refunds WHERE order_id=$1', [orderId])).rows[0];
  if (existing) {
    if (existing.status === 'succeeded')
      return { status: 'refunded', license_changed: false, refund_id: existing.id };
    if (['requested', 'pending'].includes(existing.status))
      return { status: 'refund_pending', license_changed: false, refund_id: existing.id };
    if (existing.status === 'failed')
      throw new DomainError(
        'REFUND_FAILED',
        409,
        'Hay un reembolso fallido; abre un incidente de conciliación.',
      );
  }
  if (!['fulfilled', 'paid_requires_review', 'paid', 'issuing'].includes(o.status))
    throw new DomainError('INVALID_STATE', 409);
  const attempt = (
    await db.query(
      "SELECT * FROM payment_attempts WHERE order_id=$1 AND status='succeeded' ORDER BY created_at DESC LIMIT 1",
      [orderId],
    )
  ).rows[0];
  if (!attempt?.payment_intent_ref)
    throw new DomainError(
      'PAYMENT_UNCONFIRMED',
      409,
      'No hay PaymentIntent confirmado para reembolsar.',
    );
  const refundId = randomUUID();
  await db.query(
    `INSERT INTO refunds(id,order_id,attempt_id,reason,status,payment_intent_ref,amount_minor,currency)
     VALUES($1,$2,$3,$4,'requested',$5,$6,'EUR')`,
    [refundId, orderId, attempt.id, reason, attempt.payment_intent_ref, o.price.total_minor],
  );
  await db.query("UPDATE orders SET status='refund_pending' WHERE id=$1", [orderId]);
  // Stop license issuance while money is being reversed. Do not revoke an already-issued license here.
  await db.query(
    "UPDATE outbox SET status='done', last_error='cancelled_for_refund' WHERE order_id=$1 AND kind='license.issue' AND status='pending'",
    [orderId],
  );
  await db.query(
    "INSERT INTO outbox(id,order_id,kind) VALUES($1,$2,'refund.process') ON CONFLICT(order_id,kind) DO NOTHING",
    [randomUUID(), orderId],
  );
  await audit(db, user.id, 'refund.requested', orderId, { refund_id: refundId, reason });
  return { status: 'refund_pending', license_changed: false, refund_id: refundId };
}

function mapStripeStatus(status: string | null): 'pending' | 'succeeded' | 'failed' {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return 'pending';
}

async function applyRefundOutcome(refundId: string, stripeRefund: StripeRefund) {
  assertLiveCommerceAllowed(Boolean(stripeRefund.livemode));
  await transaction(async (db) => {
    const refund = (await db.query('SELECT * FROM refunds WHERE id=$1 FOR UPDATE', [refundId]))
      .rows[0];
    if (!refund) return;
    const order = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [refund.order_id]))
      .rows[0];
    const mapped = mapStripeStatus(stripeRefund.status);
    const pi = objectId(stripeRefund.payment_intent);
    if (
      !pi ||
      pi !== refund.payment_intent_ref ||
      (refund.provider_ref && stripeRefund.id !== refund.provider_ref) ||
      (refund.charge_ref && objectId(stripeRefund.charge) !== refund.charge_ref)
    )
      throw new DomainError('PAYMENT_MISMATCH', 409);
    if (stripeRefund.amount !== refund.amount_minor || stripeRefund.currency !== 'eur')
      throw new DomainError('PAYMENT_MISMATCH', 409, 'Solo se admiten reembolsos totales en EUR.');
    if (['succeeded', 'failed'].includes(refund.status)) return;
    await db.query(
      `UPDATE refunds SET status=$2, provider_ref=COALESCE(provider_ref,$3), charge_ref=COALESCE(charge_ref,$4),
       failure_reason=$5, updated_at=now() WHERE id=$1`,
      [
        refundId,
        mapped,
        stripeRefund.id,
        objectId(stripeRefund.charge),
        mapped === 'failed' ? (stripeRefund.failure_reason ?? 'refund_failed') : null,
      ],
    );
    if (mapped === 'succeeded') {
      await postRefundLedger(db, order);
      await db.query("UPDATE orders SET status='refunded' WHERE id=$1", [order.id]);
      await audit(db, null, 'refund.confirmed', order.id, {
        refund_id: refundId,
        provider_ref: stripeRefund.id,
      });
    } else if (mapped === 'failed') {
      await db.query(
        "UPDATE orders SET status='paid_requires_review' WHERE id=$1 AND status='refund_pending'",
        [order.id],
      );
      await audit(db, null, 'refund.failed', order.id, {
        refund_id: refundId,
        reason: stripeRefund.failure_reason,
      });
    }
  });
}

/** Worker: call Stripe outside long DB locks; finalize from authoritative refund object. */
export async function processStripeRefunds() {
  if (config.payments !== 'stripe') return 0;
  let processed = 0;
  for (let i = 0; i < 10; i++) {
    const job = await transaction(async (db) => {
      const outbox = (
        await db.query(
          "SELECT * FROM outbox WHERE kind='refund.process' AND status='pending' AND available_at<=now() ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (!outbox) return null;
      const refund = (
        await db.query(
          "SELECT * FROM refunds WHERE order_id=$1 AND status IN ('requested','pending') FOR UPDATE",
          [outbox.order_id],
        )
      ).rows[0];
      if (!refund) {
        await db.query("UPDATE outbox SET status='done' WHERE id=$1", [outbox.id]);
        return null;
      }
      return { outbox, refund };
    });
    if (!job) break;
    try {
      let stripeRefund: StripeRefund;
      if (job.refund.provider_ref) {
        stripeRefund = await stripeRefundPort().retrieveRefund(job.refund.provider_ref);
      } else {
        stripeRefund = await stripeRefundPort().createRefund(
          {
            payment_intent: job.refund.payment_intent_ref,
            reverse_transfer: true,
            refund_application_fee: true,
            metadata: { order_id: job.refund.order_id, refund_id: job.refund.id },
          },
          { idempotencyKey: 'refund_' + job.refund.id },
        );
      }
      await applyRefundOutcome(job.refund.id, stripeRefund);
      const current = (await pool.query('SELECT status FROM refunds WHERE id=$1', [job.refund.id]))
        .rows[0];
      if (current?.status === 'pending') {
        await pool.query(
          "UPDATE outbox SET attempts=attempts+1, available_at=now()+interval '30 seconds', last_error='awaiting_stripe_refund' WHERE id=$1",
          [job.outbox.id],
        );
      } else {
        await pool.query("UPDATE outbox SET status='done' WHERE id=$1", [job.outbox.id]);
      }
      processed++;
    } catch (e) {
      await pool.query(
        `UPDATE outbox SET attempts=attempts+1, last_error=$2,
         available_at=now()+make_interval(secs=>least(300,power(2,attempts+1)::int)),
         status=CASE WHEN attempts>=7 THEN 'dead' ELSE 'pending' END
         WHERE id=$1 AND status='pending'`,
        [job.outbox.id, e instanceof Error ? e.message : 'refund_provider_failed'],
      );
    }
  }
  return processed;
}

export function isRefundEvent(event: Stripe.Event): boolean {
  return [
    'charge.refunded',
    'charge.refund.updated',
    'refund.created',
    'refund.updated',
    'refund.failed',
  ].includes(event.type);
}

export async function ingestStripeRefundEvent(event: Stripe.Event) {
  assertLiveCommerceAllowed(Boolean(event.livemode));
  if (!isRefundEvent(event)) return;
  if (event.account) throw new DomainError('STRIPE_EVENT_SCOPE_MISMATCH', 400);
  if (
    (
      await pool.query("SELECT 1 FROM provider_events WHERE provider='stripe' AND event_id=$1", [
        event.id,
      ])
    ).rowCount
  )
    return;
  const object = event.data.object as Stripe.Refund | Stripe.Charge;
  let refundId: string | undefined;
  let stripeRefund: StripeRefund;
  if (object.object === 'refund') {
    refundId = object.metadata?.refund_id;
    stripeRefund = await stripeRefundPort().retrieveRefund(object.id);
    if (stripeRefund.id !== object.id) throw new DomainError('PAYMENT_MISMATCH', 409);
  } else if (object.object === 'charge') {
    const refunds = object.refunds?.data ?? [];
    const latest = refunds[0];
    if (!latest) {
      await pool.query(
        "INSERT INTO provider_events(id,provider,event_id,payload,status) VALUES($1,'stripe',$2,$3,'done') ON CONFLICT DO NOTHING",
        [randomUUID(), event.id, JSON.stringify({ type: event.type, ignored: true })],
      );
      return;
    }
    // Prefer retrieve for authoritative status when the charge payload is a thin list item.
    stripeRefund = await stripeRefundPort().retrieveRefund(latest.id);
    refundId = undefined;
  } else {
    return;
  }
  const row = refundId
    ? (await pool.query('SELECT * FROM refunds WHERE id=$1', [refundId])).rows[0]
    : (await pool.query('SELECT * FROM refunds WHERE provider_ref=$1', [stripeRefund.id])).rows[0];
  if (!row) {
    await pool.query(
      "INSERT INTO provider_events(id,provider,event_id,payload,status) VALUES($1,'stripe',$2,$3,'done') ON CONFLICT DO NOTHING",
      [randomUUID(), event.id, JSON.stringify({ type: event.type, orphan: true })],
    );
    return;
  }
  await applyRefundOutcome(row.id, stripeRefund);
  await pool.query(
    "INSERT INTO provider_events(id,provider,event_id,payload,status) VALUES($1,'stripe',$2,$3,'done') ON CONFLICT DO NOTHING",
    [
      randomUUID(),
      event.id,
      JSON.stringify({ type: event.type, refund_id: row.id, provider_ref: stripeRefund.id }),
    ],
  );
}
