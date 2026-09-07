import { randomBytes, randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { pool, transaction } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { config } from '../common/config.js';
import { stripeCheckoutPort } from '../integrations/stripe.js';
import { eligibleRequest, getOrder } from './licensing.js';

export function checkoutRequest(
  order: { id: string; expires_at: string; price: { total_minor: number; fee_minor: number } },
  attemptId: string,
  destination: string,
): Stripe.Checkout.SessionCreateParams {
  const expires = Math.floor(new Date(order.expires_at).getTime() / 1000);
  const remaining = expires - Math.floor(Date.now() / 1000);
  // Leave a minute for network latency; Stripe requires at least 30 minutes.
  if (remaining < 1860 || remaining > 86400)
    throw new DomainError('CHECKOUT_WINDOW_INVALID', 409, 'Solicita una nueva cotización.');
  const suffix = Array.from(randomBytes(8), (b) => String.fromCharCode(97 + (b % 26))).join('');
  return {
    mode: 'payment',
    integration_identifier: 'rightsnet_' + suffix,
    adaptive_pricing: { enabled: false },
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: order.price.total_minor,
          product_data: { name: 'RightsNet · licencia DEMO de likeness' },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: order.price.fee_minor,
      transfer_data: { destination },
      metadata: { order_id: order.id, attempt_id: attemptId },
    },
    metadata: { order_id: order.id, attempt_id: attemptId },
    success_url: `${config.webUrl}/company/orders/${order.id}`,
    cancel_url: `${config.webUrl}/company/orders/${order.id}`,
    expires_at: expires,
  };
}

export async function stripeCheckout(user: Actor, id: string) {
  // Authorize before any provider call. Do not reserve an attempt for invalid configuration.
  const order = await getOrder(pool, user, id, true);
  const stripe = stripeCheckoutPort();
  const prior = (
    await pool.query(
      "SELECT * FROM payment_attempts WHERE order_id=$1 AND status IN ('creating','pending','processing')",
      [id],
    )
  ).rows[0];
  let destination: string | undefined;
  if (!prior) {
    if (order.status !== 'awaiting_payment' || !order.accepted_at)
      throw new DomainError('ORDER_NOT_PAYABLE', 409);
    destination = (
      await pool.query(
        'SELECT c.connected_account FROM assets a JOIN creators c ON c.id=a.creator_id WHERE a.id=$1',
        [order.asset_id],
      )
    ).rows[0]?.connected_account;
    if (!destination?.startsWith('acct_'))
      throw new DomainError('CONNECT_ONBOARDING_REQUIRED', 422);
    await stripe.requireRecipient(destination);
  }
  const attempt = await transaction(async (db) => {
    const locked = await getOrder(db, user, id, true);
    await db.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [id]);
    const current = (await db.query('SELECT * FROM orders WHERE id=$1', [id])).rows[0];
    const existing = (
      await db.query(
        "SELECT * FROM payment_attempts WHERE order_id=$1 AND status IN ('creating','pending','processing')",
        [id],
      )
    ).rows[0];
    if (existing) {
      if (existing.provider !== 'stripe') throw new DomainError('PAYMENT_PROVIDER_MISMATCH', 409);
      if (current.status !== 'payment_processing') throw new DomainError('ORDER_NOT_PAYABLE', 409);
      return existing;
    }
    if (!destination || current.status !== 'awaiting_payment' || !current.accepted_at)
      throw new DomainError('ORDER_NOT_PAYABLE', 409);
    const creator = (
      await db.query(
        'SELECT c.connected_account FROM assets a JOIN creators c ON c.id=a.creator_id WHERE a.id=$1 FOR SHARE OF c',
        [locked.asset_id],
      )
    ).rows[0];
    if (creator.connected_account !== destination)
      throw new DomainError('CONNECT_ACCOUNT_CHANGED', 409);
    const quote = (await db.query('SELECT request_id FROM quotes WHERE id=$1', [current.quote_id]))
      .rows[0];
    await eligibleRequest(db, user, quote.request_id);
    const attemptId = randomUUID();
    const params = checkoutRequest(current, attemptId, destination);
    const result = (
      await db.query(
        "INSERT INTO payment_attempts(id,order_id,provider,status,stripe_request) VALUES($1,$2,'stripe','creating',$3) RETURNING *",
        [attemptId, id, JSON.stringify(params)],
      )
    ).rows[0];
    await db.query("UPDATE orders SET status='payment_processing' WHERE id=$1", [id]);
    return result;
  });
  if (attempt.status === 'processing')
    return { provider: 'stripe', processing: true, attempt_id: attempt.id };
  // Old attempts lack a safe snapshot. Never infer their original parameters or create a second charge.
  if (!attempt.stripe_request) throw new DomainError('STRIPE_ATTEMPT_REQUIRES_REVIEW', 409);
  let session: Stripe.Checkout.Session;
  if (attempt.provider_ref) {
    session = await stripe.retrieveSession(attempt.provider_ref);
  } else {
    // Stripe may prune idempotency records after 24h. An uncertain old request must be reconciled.
    if (Date.now() - new Date(attempt.created_at).getTime() >= 23 * 3600000)
      throw new DomainError('STRIPE_ATTEMPT_REQUIRES_REVIEW', 409);
    // Retrying a timeout uses the exact persisted parameters and key, even after account/URL changes.
    session = await stripe.createSession(attempt.stripe_request, {
      idempotencyKey: 'checkout_' + attempt.id,
    });
    await pool.query(
      "UPDATE payment_attempts SET provider_ref=$2,status='pending' WHERE id=$1 AND status='creating'",
      [attempt.id, session.id],
    );
  }
  if (
    session.livemode ||
    session.metadata?.order_id !== id ||
    session.metadata?.attempt_id !== attempt.id
  )
    throw new DomainError('PAYMENT_MISMATCH', 409);
  if (session.status !== 'open')
    return { provider: 'stripe', processing: true, attempt_id: attempt.id };
  // Re-check capability before returning an existing payable session too.
  await stripe.requireRecipient(
    attempt.stripe_request.payment_intent_data.transfer_data.destination,
  );
  if (!session.url) throw new DomainError('CHECKOUT_URL_MISSING', 502);
  return { provider: 'stripe', url: session.url, attempt_id: attempt.id };
}
