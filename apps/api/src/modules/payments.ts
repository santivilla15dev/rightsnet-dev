import { randomUUID, randomBytes } from 'node:crypto';
import { pool, transaction, audit, type DB } from '../../../../packages/db/index.js';
import { DomainError, hash } from '../../../../packages/domain/src/index.js';
import { type Actor } from '../common/auth.js';
import { getOrder, eligibleRequest, assertOrderIssuable } from './licensing.js';
import { config } from '../common/config.js';
import { signPayload } from '../integrations/signing.js';
export { stripeClient } from '../integrations/stripe.js';
import { stripeCheckout } from './stripe-checkout.js';
import { isRightsPolicy, policyContentHash } from './rights-core-path.js';
export async function checkout(user: Actor, id: string) {
  if (config.payments === 'stripe') return stripeCheckout(user, id);
  const attempt = await transaction(async (db) => {
    await getOrder(db, user, id, true);
    const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
    const prior = (
      await db.query(
        "SELECT * FROM payment_attempts WHERE order_id=$1 AND status IN ('creating','pending','processing')",
        [id],
      )
    ).rows[0];
    if (prior) return { attempt: prior, order: o };
    if (o.status !== 'awaiting_payment' || !o.accepted_at || new Date(o.expires_at) <= new Date())
      throw new DomainError('ORDER_NOT_PAYABLE', 409, 'La orden no está disponible para pago.');
    const q = (await db.query('SELECT request_id FROM quotes WHERE id=$1', [o.quote_id])).rows[0];
    await eligibleRequest(db, user, q.request_id);
    const attemptId = randomUUID();
    const a = (
      await db.query(
        "INSERT INTO payment_attempts(id,order_id,provider,status) VALUES($1,$2,$3,'creating') RETURNING *",
        [attemptId, id, config.payments],
      )
    ).rows[0];
    await db.query("UPDATE orders SET status='payment_processing' WHERE id=$1", [id]);
    return { attempt: a, order: o };
  });
  if (attempt.attempt.status === 'processing') return { processing: true };
  if (config.payments === 'sandbox') {
    await pool.query(
      "UPDATE payment_attempts SET provider_ref=$2,status='pending' WHERE id=$1 AND status='creating'",
      [attempt.attempt.id, 'sandbox_' + attempt.attempt.id],
    );
    return {
      provider: 'sandbox',
      attempt_id: attempt.attempt.id,
      url: `/company/checkout/${id}`,
      expires_at: attempt.order.expires_at,
    };
  }
  throw new DomainError('PAYMENT_PROVIDER_INVALID', 503);
}

export async function journal(
  db: DB,
  orderId: string,
  kind: string,
  entries: { account: string; side: 'debit' | 'credit'; amount: number }[],
) {
  const id = randomUUID();
  const result = await db.query(
    "INSERT INTO journals(id,order_id,kind,currency) VALUES($1,$2,$3,'EUR') ON CONFLICT(order_id,kind) DO NOTHING RETURNING id",
    [id, orderId, kind],
  );
  if (!result.rowCount) return;
  for (const e of entries)
    if (e.amount > 0)
      await db.query(
        'INSERT INTO ledger_entries(id,journal_id,account,side,amount_minor) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), id, e.account, e.side, e.amount],
      );
}
export type PaymentEvent = {
  order_id: string;
  attempt_id: string;
  amount_minor: number;
  currency: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.expired' | 'payment.processing';
  sandbox: boolean;
};
export async function persistPaymentEvent(provider: string, eventId: string, event: PaymentEvent) {
  await pool.query(
    'INSERT INTO provider_events(id,provider,event_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT(provider,event_id) DO NOTHING',
    [randomUUID(), provider, eventId, JSON.stringify(event)],
  );
}
export async function simulatePayment(user: Actor, id: string, success: boolean) {
  if (config.env !== 'sandbox' || config.payments !== 'sandbox')
    throw new DomainError('SANDBOX_DISABLED', 404);
  const o = await getOrder(pool, user, id, true);
  const a = (
    await pool.query(
      'SELECT * FROM payment_attempts WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1',
      [id],
    )
  ).rows[0];
  if (!a) throw new DomainError('CHECKOUT_REQUIRED', 409);
  if (!['pending', 'succeeded', 'failed'].includes(a.status))
    throw new DomainError('INVALID_STATE', 409);
  if (o.status === 'fulfilled') return { status: 'fulfilled' };
  await persistPaymentEvent('sandbox', a.id + (success ? '_success' : '_failed'), {
    order_id: id,
    attempt_id: a.id,
    amount_minor: o.price.total_minor,
    currency: 'EUR',
    type: success ? 'payment.succeeded' : 'payment.failed',
    sandbox: true,
  });
  return { status: 'processing' };
}
export async function processPaymentEvents() {
  let processed = 0;
  for (let i = 0; i < 20; i++) {
    const found = await transaction(async (db) => {
      const record = (
        await db.query(
          "SELECT * FROM provider_events WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (!record) return false;
      const e = record.payload as PaymentEvent;
      const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [e.order_id]))
        .rows[0];
      const a = (
        await db.query('SELECT * FROM payment_attempts WHERE id=$1 AND order_id=$2', [
          e.attempt_id,
          e.order_id,
        ])
      ).rows[0];
      if (
        !o ||
        !a ||
        a.provider !== record.provider ||
        e.currency !== 'EUR' ||
        e.amount_minor !== o.price.total_minor ||
        e.sandbox !== (record.provider === 'sandbox') ||
        !['payment.succeeded', 'payment.failed', 'payment.expired', 'payment.processing'].includes(e.type)
      ) {
        await db.query(
          "UPDATE provider_events SET status='failed',error='PAYMENT_MISMATCH' WHERE id=$1",
          [record.id],
        );
        if (o)
          await db.query("UPDATE orders SET status='paid_requires_review' WHERE id=$1", [o.id]);
        return true;
      }
      if (e.type === 'payment.processing') {
        if (['creating', 'pending'].includes(a.status))
          await db.query("UPDATE payment_attempts SET status='processing' WHERE id=$1", [a.id]);
      } else if (e.type === 'payment.failed' || e.type === 'payment.expired') {
        if (a.status !== 'succeeded') {
          await db.query('UPDATE payment_attempts SET status=$2 WHERE id=$1', [a.id,
            e.type === 'payment.expired' ? 'expired' : 'failed']);
          if (o.status === 'payment_processing')
            await db.query("UPDATE orders SET status='awaiting_payment' WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM payment_attempts WHERE order_id=$1 AND status IN ('creating','pending','processing'))", [o.id]);
        }
      } else if (a.status !== 'succeeded') {
        const alreadyPaid = (await db.query(
          "SELECT 1 FROM payment_attempts WHERE order_id=$1 AND id<>$2 AND status='succeeded'", [o.id, a.id],
        )).rowCount;
        await db.query("UPDATE payment_attempts SET status='succeeded' WHERE id=$1", [a.id]);
        if (alreadyPaid) {
          // Preserve the original sale journal; record additional funds as a liability for review/refund.
          await journal(db, o.id, 'duplicate_payment_' + a.id, [
            { account: 'psp_clearing', side: 'debit', amount: o.price.total_minor },
            { account: 'duplicate_payment_liability', side: 'credit', amount: o.price.total_minor },
          ]);
          if (!['refunded', 'refund_pending', 'cancelled'].includes(o.status))
            await db.query("UPDATE orders SET status='paid_requires_review' WHERE id=$1", [o.id]);
          await db.query("UPDATE provider_events SET status='failed',error='DUPLICATE_PAYMENT' WHERE id=$1", [record.id]);
          await audit(db, null, 'payment.duplicate_requires_review', o.id, { attempt_id: a.id });
          return true;
        }
        await journal(db, o.id, 'payment', [
          { account: 'psp_clearing', side: 'debit', amount: o.price.total_minor },
          { account: 'creator_payable', side: 'credit', amount: o.price.creator_minor },
          { account: 'platform_fee_revenue', side: 'credit', amount: o.price.fee_minor },
        ]);
        const asset = (await db.query('SELECT status FROM assets WHERE id=$1', [o.asset_id]))
          .rows[0];
        const blocked =
          asset.status === 'suspended' ||
          new Date(o.scope.starts_at) <= new Date() ||
          !o.accepted_at ||
          ['refund_pending', 'refunded', 'cancelled', 'paid_requires_review'].includes(o.status);
        if (!['refund_pending', 'refunded', 'cancelled'].includes(o.status))
          await db.query('UPDATE orders SET status=$1 WHERE id=$2', [
            blocked ? 'paid_requires_review' : 'paid', o.id,
          ]);
        if (!blocked)
          await db.query(
            "INSERT INTO outbox(id,order_id,kind) VALUES($1,$2,'license.issue') ON CONFLICT DO NOTHING",
            [randomUUID(), o.id],
          );
        await audit(db, null, 'payment.confirmed', o.id, { provider: record.provider });
      }
      await db.query("UPDATE provider_events SET status='done' WHERE id=$1", [record.id]);
      return true;
    });
    if (!found) break;
    processed++;
  }
  return processed;
}
export async function issueLicenses() {
  const pending = (
    await pool.query(
      "SELECT id FROM outbox WHERE status='pending' AND available_at<=now() ORDER BY available_at LIMIT 20",
    )
  ).rows;
  for (const row of pending) {
    try {
      await transaction(async (db) => {
        const job = (
          await db.query(
            "SELECT * FROM outbox WHERE id=$1 AND status='pending' FOR UPDATE SKIP LOCKED",
            [row.id],
          )
        ).rows[0];
        if (!job) return;
        const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [job.order_id]))
          .rows[0];
        const asset = (await db.query('SELECT status FROM assets WHERE id=$1', [o.asset_id]))
          .rows[0];
        if (o.status !== 'paid' && o.status !== 'issuing') {
          await db.query("UPDATE outbox SET status='done' WHERE id=$1", [job.id]);
          return;
        }
        if (
          (
            await db.query(
              "SELECT 1 FROM refunds WHERE order_id=$1 AND status IN ('requested','pending','succeeded')",
              [o.id],
            )
          ).rowCount
        ) {
          await db.query("UPDATE outbox SET status='done', last_error='blocked_by_refund' WHERE id=$1", [
            job.id,
          ]);
          return;
        }
        if (asset.status === 'suspended' || new Date(o.scope.starts_at) <= new Date()) {
          await db.query("UPDATE orders SET status='paid_requires_review' WHERE id=$1", [o.id]);
          await db.query("UPDATE outbox SET status='done' WHERE id=$1", [job.id]);
          return;
        }
        const issuable = await assertOrderIssuable(db, o.id);
        if (!issuable.allowed) {
          await db.query("UPDATE orders SET status='paid_requires_review' WHERE id=$1", [o.id]);
          await db.query(
            "UPDATE outbox SET status='done', last_error=$2 WHERE id=$1",
            [job.id, (issuable.reasons ?? []).join(',') || 'issuance_blocked'],
          );
          return;
        }
        const id = randomUUID(),
          token = randomBytes(24).toString('base64url'),
          end = new Date(
            Date.parse(o.scope.starts_at) + o.scope.duration_days * 86400000,
          ).toISOString();
        const policyHash = isRightsPolicy(o.policy_snapshot)
          ? policyContentHash(o.policy_snapshot)
          : hash(o.policy_snapshot);
        const payload = {
          schema_version: 'rightsnet.license/0.1',
          issuer: 'rightsnet.sandbox',
          license_id: id,
          asset_id: o.asset_id,
          order_reference: hash(o.id),
          policy_hash: policyHash,
          contract_hash: o.contract_hash,
          scope: o.scope,
          starts_at: o.scope.starts_at,
          ends_at: end,
          issued_at: new Date().toISOString(),
          sandbox: true,
        };
        const signed = signPayload(payload);
        await db.query(
          "INSERT INTO licenses(id,order_id,public_token,status,starts_at,ends_at,payload,signature,key_id) VALUES($1,$2,$3,'issued',$4,$5,$6,$7,$8) ON CONFLICT(order_id) DO NOTHING",
          [
            id,
            o.id,
            token,
            payload.starts_at,
            end,
            JSON.stringify(payload),
            signed.signature,
            signed.key_id,
          ],
        );
        if (config.payments === 'sandbox')
          await journal(db, o.id, 'sandbox_transfer', [
            { account: 'creator_payable', side: 'debit', amount: o.price.creator_minor },
            { account: 'psp_clearing', side: 'credit', amount: o.price.creator_minor },
          ]);
        await db.query("UPDATE orders SET status='fulfilled' WHERE id=$1", [o.id]);
        await db.query("UPDATE outbox SET status='done' WHERE id=$1", [job.id]);
        await audit(db, null, 'license.issued', id, { sandbox: true });
      });
    } catch (e) {
      await pool.query(
        "UPDATE outbox SET attempts=attempts+1,last_error=$2,available_at=now()+make_interval(secs=>least(300,power(2,attempts+1)::int)),status=CASE WHEN attempts>=7 THEN 'dead' ELSE 'pending' END WHERE id=$1 AND status='pending'",
        [row.id, e instanceof Error ? e.message : 'issuance_failed'],
      );
    }
  }
}
export async function refundSandbox(db: DB, user: Actor, id: string, reason: string) {
  if (config.payments !== 'sandbox')
    throw new DomainError(
      'STRIPE_REFUND_REQUIRES_RECONCILIATION',
      409,
      'Usa el adaptador Stripe de reembolsos (requestRefund).',
    );
  const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!o) throw new DomainError('NOT_FOUND', 404);
  if (o.status === 'refunded') return { status: 'refunded', license_changed: false };
  if (!['fulfilled', 'paid_requires_review', 'paid'].includes(o.status))
    throw new DomainError('INVALID_STATE', 409);
  await journal(db, id, 'refund', [
    { account: 'platform_fee_revenue', side: 'debit', amount: o.price.fee_minor },
    { account: 'creator_payable', side: 'debit', amount: o.price.creator_minor },
    { account: 'psp_clearing', side: 'credit', amount: o.price.total_minor },
  ]);
  if (
    (await db.query("SELECT 1 FROM journals WHERE order_id=$1 AND kind='sandbox_transfer'", [id]))
      .rowCount
  )
    await journal(db, id, 'sandbox_transfer_reversal', [
      { account: 'psp_clearing', side: 'debit', amount: o.price.creator_minor },
      { account: 'creator_payable', side: 'credit', amount: o.price.creator_minor },
    ]);
  await db.query(
    "INSERT INTO refunds(id,order_id,reason,status,amount_minor,currency) VALUES($1,$2,$3,'succeeded',$4,'EUR')",
    [randomUUID(), id, reason, o.price.total_minor],
  );
  await db.query("UPDATE orders SET status='refunded' WHERE id=$1", [id]);
  await audit(db, user.id, 'refund.confirmed', id, { reason });
  return { status: 'refunded', license_changed: false };
}
