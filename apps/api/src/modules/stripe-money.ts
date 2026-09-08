import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { audit, pool, transaction } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { config } from '../common/config.js';
import {
  assertLiveCommerceAllowed,
  stripeEnvironment,
  stripeMoneyPort,
} from '../integrations/stripe.js';

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id ?? null;
}

function eurMinor(amount: number, currency: string) {
  if (currency !== 'eur') throw new DomainError('PAYMENT_MISMATCH', 409, 'Solo EUR en el MVP.');
  return amount;
}

const transferEvents = new Set([
  'transfer.created',
  'transfer.updated',
  'transfer.reversed',
]);
const disputeEvents = new Set([
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
]);
const payoutEvents = new Set([
  'payout.created',
  'payout.updated',
  'payout.paid',
  'payout.failed',
  'payout.canceled',
]);

export function isMoneyMovementEvent(event: Stripe.Event): boolean {
  return (
    transferEvents.has(event.type) ||
    disputeEvents.has(event.type) ||
    payoutEvents.has(event.type)
  );
}

async function markEventDone(event: Stripe.Event, payload: unknown) {
  await pool.query(
    "INSERT INTO provider_events(id,provider,event_id,payload,status) VALUES($1,'stripe',$2,$3,'done') ON CONFLICT(provider,event_id) DO NOTHING",
    [randomUUID(), event.id, JSON.stringify(payload)],
  );
}

async function resolveOrderFromPaymentIntent(pi: string | null) {
  if (!pi) return null;
  const row = (
    await pool.query(
      `SELECT a.id as attempt_id, a.order_id FROM payment_attempts a
       WHERE a.payment_intent_ref=$1 ORDER BY a.created_at DESC LIMIT 1`,
      [pi],
    )
  ).rows[0];
  return row ?? null;
}

async function resolveOrderFromCharge(chargeId: string | null) {
  if (!chargeId) return null;
  const viaAttempt = (
    await pool.query(
      `SELECT a.id as attempt_id, a.order_id FROM payment_attempts a
       WHERE a.charge_ref=$1 ORDER BY a.created_at DESC LIMIT 1`,
      [chargeId],
    )
  ).rows[0];
  if (viaAttempt) return viaAttempt;
  // Prefer PaymentIntent linkage; charge id may also live on refunds.
  const viaRefund = (
    await pool.query(
      `SELECT r.order_id, r.attempt_id, r.payment_intent_ref FROM refunds r WHERE r.charge_ref=$1 LIMIT 1`,
      [chargeId],
    )
  ).rows[0];
  if (viaRefund?.payment_intent_ref) return resolveOrderFromPaymentIntent(viaRefund.payment_intent_ref);
  if (viaRefund) return { attempt_id: viaRefund.attempt_id, order_id: viaRefund.order_id };
  return null;
}

async function upsertTransfer(transfer: Stripe.Transfer) {
  assertLiveCommerceAllowed(Boolean((transfer as { livemode?: boolean }).livemode));
  if (transfer.currency !== 'eur') throw new DomainError('PAYMENT_MISMATCH', 409);
  const destination = objectId(transfer.destination);
  if (!destination) throw new DomainError('PAYMENT_MISMATCH', 409);
  const source = objectId(transfer.source_transaction);
  let orderId: string | null = null;
  let attemptId: string | null = null;
  if (source) {
    // Destination-charge transfers point at the charge; recover PI via Stripe when needed is step-5 work.
    const linked = await resolveOrderFromCharge(source);
    if (linked) {
      orderId = linked.order_id;
      attemptId = linked.attempt_id;
    }
  }
  // Also try metadata if platform set it.
  if (!orderId && transfer.metadata?.order_id) {
    const attempt = (
      await pool.query(
        `SELECT id as attempt_id, order_id FROM payment_attempts WHERE order_id=$1 AND status='succeeded' ORDER BY created_at DESC LIMIT 1`,
        [transfer.metadata.order_id],
      )
    ).rows[0];
    if (attempt) {
      orderId = attempt.order_id;
      attemptId = attempt.attempt_id;
    }
  }
  let status: string = transfer.reversed ? 'reversed' : transfer.amount === 0 ? 'canceled' : 'paid';
  if (transfer.reversed) status = 'reversed';
  await transaction(async (db) => {
    const existing = (
      await db.query('SELECT * FROM stripe_transfers WHERE provider_ref=$1 FOR UPDATE', [
        transfer.id,
      ])
    ).rows[0];
    if (existing) {
      await db.query(
        `UPDATE stripe_transfers SET status=$2, order_id=COALESCE(order_id,$3), payment_attempt_id=COALESCE(payment_attempt_id,$4),
         destination_payment_ref=COALESCE(destination_payment_ref,$5), source_transaction_ref=COALESCE(source_transaction_ref,$6),
         updated_at=now() WHERE id=$1`,
        [
          existing.id,
          status,
          orderId,
          attemptId,
          objectId(transfer.destination_payment),
          source,
        ],
      );
      return existing.id as string;
    }
    const id = randomUUID();
    await db.query(
      `INSERT INTO stripe_transfers(
         id,provider_ref,environment,connected_account_ref,order_id,payment_attempt_id,
         amount_minor,currency,status,destination_payment_ref,source_transaction_ref)
       VALUES($1,$2,$3,$4,$5,$6,$7,'EUR',$8,$9,$10)`,
      [
        id,
        transfer.id,
        stripeEnvironment(),
        destination,
        orderId,
        attemptId,
        eurMinor(transfer.amount, transfer.currency),
        status,
        objectId(transfer.destination_payment),
        source,
      ],
    );
    return id;
  });
}

async function upsertTransferReversal(transfer: Stripe.Transfer) {
  if (!transfer.reversed) return;
  const parent = (
    await pool.query('SELECT * FROM stripe_transfers WHERE provider_ref=$1', [transfer.id])
  ).rows[0];
  if (!parent) {
    await upsertTransfer(transfer);
  }
  const row = (
    await pool.query('SELECT * FROM stripe_transfers WHERE provider_ref=$1', [transfer.id])
  ).rows[0];
  const reversals = transfer.reversals?.data ?? [];
  for (const rev of reversals) {
    if ((await pool.query('SELECT 1 FROM stripe_transfer_reversals WHERE provider_ref=$1', [rev.id])).rowCount)
      continue;
    const refund = rev.metadata?.refund_id
      ? (await pool.query('SELECT id FROM refunds WHERE id=$1', [rev.metadata.refund_id])).rows[0]
      : (
          await pool.query(
            'SELECT id FROM refunds WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1',
            [row.order_id],
          )
        ).rows[0];
    await pool.query(
      `INSERT INTO stripe_transfer_reversals(id,transfer_id,provider_ref,amount_minor,currency,refund_id)
       VALUES($1,$2,$3,$4,'EUR',$5)`,
      [randomUUID(), row.id, rev.id, rev.amount, refund?.id ?? null],
    );
    if (refund?.id)
      await pool.query(
        'UPDATE refunds SET transfer_reversal_ref=COALESCE(transfer_reversal_ref,$2), updated_at=now() WHERE id=$1',
        [refund.id, rev.id],
      );
  }
  await pool.query(
    "UPDATE stripe_transfers SET status='reversed', updated_at=now() WHERE id=$1",
    [row.id],
  );
}

async function upsertDispute(dispute: Stripe.Dispute) {
  assertLiveCommerceAllowed(Boolean((dispute as { livemode?: boolean }).livemode));
  const charge = objectId(dispute.charge);
  const pi = objectId(dispute.payment_intent);
  const linked =
    (await resolveOrderFromPaymentIntent(pi)) ?? (await resolveOrderFromCharge(charge));
  await transaction(async (db) => {
    const existing = (
      await db.query('SELECT * FROM disputes WHERE provider_ref=$1 FOR UPDATE', [dispute.id])
    ).rows[0];
    const status = dispute.status;
    if (existing) {
      await db.query(
        `UPDATE disputes SET status=$2, amount_minor=$3, reason=$4, evidence_due_at=$5,
         order_id=COALESCE(order_id,$6), charge_ref=COALESCE(charge_ref,$7),
         payment_intent_ref=COALESCE(payment_intent_ref,$8), updated_at=now() WHERE id=$1`,
        [
          existing.id,
          status,
          eurMinor(dispute.amount, dispute.currency),
          dispute.reason ?? null,
          dispute.evidence_details?.due_by
            ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
            : null,
          linked?.order_id ?? null,
          charge,
          pi,
        ],
      );
    } else {
      await db.query(
        `INSERT INTO disputes(
           id,order_id,provider_ref,charge_ref,payment_intent_ref,amount_minor,currency,status,reason,evidence_due_at)
         VALUES($1,$2,$3,$4,$5,$6,'EUR',$7,$8,$9)`,
        [
          randomUUID(),
          linked?.order_id ?? null,
          dispute.id,
          charge,
          pi,
          eurMinor(dispute.amount, dispute.currency),
          status,
          dispute.reason ?? null,
          dispute.evidence_details?.due_by
            ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
            : null,
        ],
      );
      // Money risk requires review. Never revoke license rights by webhook alone.
      if (linked?.order_id) {
        await db.query(
          `UPDATE orders SET status='paid_requires_review'
           WHERE id=$1 AND status IN ('paid','issuing','fulfilled','payment_processing','refund_pending')`,
          [linked.order_id],
        );
        const license = (
          await db.query('SELECT id FROM licenses WHERE order_id=$1', [linked.order_id])
        ).rows[0];
        await db.query(
          'INSERT INTO incidents(id,reporter_id,license_id,category,details) VALUES($1,NULL,$2,$3,$4)',
          [
            randomUUID(),
            license?.id ?? null,
            'payment',
            `Disputa Stripe ${dispute.id} (${status}). Revisión humana requerida; licencia no revocada automáticamente.`,
          ],
        );
      }
    }
  });
  await audit(pool, null, 'dispute.synced', linked?.order_id ?? dispute.id, {
    provider_ref: dispute.id,
    status: dispute.status,
  });
}

async function upsertPayout(payout: Stripe.Payout, connectedAccount: string | null) {
  assertLiveCommerceAllowed(Boolean((payout as { livemode?: boolean }).livemode));
  if (payout.currency !== 'eur') throw new DomainError('PAYMENT_MISMATCH', 409);
  // Connect payouts arrive with event.account set to the connected account.
  const account = connectedAccount ?? payout.metadata?.connected_account ?? null;
  if (!account?.startsWith('acct_'))
    throw new DomainError('PAYMENT_MISMATCH', 409, 'Payout sin cuenta conectada.');
  const arrival =
    typeof payout.arrival_date === 'number'
      ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
      : null;
  await transaction(async (db) => {
    const existing = (
      await db.query('SELECT * FROM payout_records WHERE provider_payout_id=$1 FOR UPDATE', [
        payout.id,
      ])
    ).rows[0];
    if (existing) {
      await db.query(
        `UPDATE payout_records SET status=$2, failure_code=$3, failure_message=$4, arrival_date=$5, updated_at=now()
         WHERE id=$1`,
        [
          existing.id,
          payout.status,
          payout.failure_code ?? null,
          payout.failure_message ?? null,
          arrival,
        ],
      );
      return;
    }
    await db.query(
      `INSERT INTO payout_records(
         id,connected_account_ref,provider_payout_id,environment,amount_minor,currency,status,arrival_date,failure_code,failure_message)
       VALUES($1,$2,$3,$4,$5,'EUR',$6,$7,$8,$9)`,
      [
        randomUUID(),
        account,
        payout.id,
        stripeEnvironment(),
        eurMinor(payout.amount, payout.currency),
        payout.status,
        arrival,
        payout.failure_code ?? null,
        payout.failure_message ?? null,
      ],
    );
  });
  await audit(pool, null, 'payout.synced', account, {
    provider_payout_id: payout.id,
    status: payout.status,
    // Explicitly no order_id — payouts are aggregated bank withdrawals.
  });
}

export async function ingestMoneyMovementEvent(event: Stripe.Event) {
  assertLiveCommerceAllowed(Boolean(event.livemode));
  if (!isMoneyMovementEvent(event)) return;
  if (config.payments !== 'stripe') return;
  if (
    (await pool.query("SELECT 1 FROM provider_events WHERE provider='stripe' AND event_id=$1", [
      event.id,
    ])).rowCount
  )
    return;

  if (transferEvents.has(event.type)) {
    const thin = event.data.object as Stripe.Transfer;
    const transfer = await stripeMoneyPort().retrieveTransfer(thin.id);
    assertLiveCommerceAllowed(Boolean((transfer as { livemode?: boolean }).livemode));
    await upsertTransfer(transfer);
    if (event.type === 'transfer.reversed' || transfer.reversed)
      await upsertTransferReversal(transfer);
    await markEventDone(event, { type: event.type, transfer: transfer.id });
    return;
  }

  if (disputeEvents.has(event.type)) {
    const thin = event.data.object as Stripe.Dispute;
    const dispute = await stripeMoneyPort().retrieveDispute(thin.id);
    assertLiveCommerceAllowed(Boolean((dispute as { livemode?: boolean }).livemode));
    // CLI fixtures often use USD; MVP is EUR-only — ack without retry spam.
    if (dispute.currency !== 'eur') {
      await markEventDone(event, {
        type: event.type,
        dispute: dispute.id,
        skipped: 'non_eur',
      });
      await audit(pool, null, 'dispute.skipped_non_eur', dispute.id, {
        currency: dispute.currency,
      });
      return;
    }
    await upsertDispute(dispute);
    await markEventDone(event, { type: event.type, dispute: dispute.id });
    return;
  }

  if (payoutEvents.has(event.type)) {
    const thin = event.data.object as Stripe.Payout;
    const account = typeof event.account === 'string' ? event.account : undefined;
    const payout = await stripeMoneyPort().retrievePayout(thin.id, account);
    assertLiveCommerceAllowed(Boolean((payout as { livemode?: boolean }).livemode));
    await upsertPayout(payout, account ?? null);
    await markEventDone(event, {
      type: event.type,
      payout: payout.id,
      account: account ?? null,
    });
  }
}

export async function listMoneyOverview() {
  const [transfers, disputes, payouts] = await Promise.all([
    pool.query(
      `SELECT t.*, c.display_name as creator_name
       FROM stripe_transfers t
       LEFT JOIN creators c ON c.connected_account = t.connected_account_ref
       ORDER BY t.created_at DESC LIMIT 100`,
    ),
    pool.query(
      `SELECT d.*, o.status as order_status, l.id as license_id, l.status as license_status
       FROM disputes d
       LEFT JOIN orders o ON o.id = d.order_id
       LEFT JOIN licenses l ON l.order_id = d.order_id
       ORDER BY d.created_at DESC LIMIT 100`,
    ),
    pool.query('SELECT * FROM payout_records ORDER BY created_at DESC LIMIT 100'),
  ]);
  return {
    transfers: transfers.rows,
    disputes: disputes.rows,
    payouts: payouts.rows,
    note: 'Los payouts bancarios no se atribuyen a una sola orden.',
  };
}

export async function reviewDispute(
  db: import('../../../../packages/db/index.js').DB,
  user: Actor,
  disputeId: string,
  body: { decision: 'acknowledge' | 'escalate' | 'close'; note: string },
) {
  const d = (await db.query('SELECT * FROM disputes WHERE id=$1 FOR UPDATE', [disputeId])).rows[0];
  if (!d) throw new DomainError('NOT_FOUND', 404);
  const reviewStatus =
    body.decision === 'acknowledge'
      ? 'acknowledged'
      : body.decision === 'escalate'
        ? 'escalated'
        : 'closed';
  await db.query(
    `UPDATE disputes SET review_status=$2, review_note=$3, reviewed_by=$4, reviewed_at=now(), updated_at=now()
     WHERE id=$1`,
    [disputeId, reviewStatus, body.note, user.id],
  );
  await audit(db, user.id, 'dispute.reviewed', disputeId, body);
  // Still never mutate license status from dispute review alone.
  return { id: disputeId, review_status: reviewStatus, license_changed: false };
}

export async function creatorMoneySummary(user: Actor) {
  const creator = (
    await pool.query('SELECT id, connected_account FROM creators WHERE user_id=$1', [user.id])
  ).rows[0];
  if (!creator) return null;
  const account = creator.connected_account;
  const [paid, transferred, payouts] = await Promise.all([
    pool.query(
      `SELECT coalesce(sum((o.price->>'creator_minor')::int),0)::int as amount
       FROM orders o JOIN assets a ON a.id=o.asset_id
       WHERE a.creator_id=$1 AND o.status IN ('paid','issuing','fulfilled','refund_pending','paid_requires_review')`,
      [creator.id],
    ),
    account?.startsWith('acct_')
      ? pool.query(
          `SELECT coalesce(sum(amount_minor),0)::int as amount FROM stripe_transfers
           WHERE connected_account_ref=$1 AND status IN ('paid','reversed')`,
          [account],
        )
      : Promise.resolve({ rows: [{ amount: 0 }] }),
    account?.startsWith('acct_')
      ? pool.query(
          `SELECT coalesce(sum(amount_minor),0)::int as amount FROM payout_records
           WHERE connected_account_ref=$1 AND status='paid'`,
          [account],
        )
      : Promise.resolve({ rows: [{ amount: 0 }] }),
  ]);
  return {
    paid_minor: paid.rows[0].amount,
    transferred_minor: transferred.rows[0].amount,
    payout_minor: payouts.rows[0].amount,
    // Separation is intentional: transferred ≠ bank payout.
  };
}
