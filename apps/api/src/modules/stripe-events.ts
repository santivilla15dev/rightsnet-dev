import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { audit, pool, transaction } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { stripeCheckoutPort, assertLiveCommerceAllowed } from '../integrations/stripe.js';
import type { PaymentEvent } from './payments.js';

const checkoutEvents = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id;

export function confirmedCheckoutEvent(
  session: Stripe.Checkout.Session,
  eventType: string,
  attempt: {
    provider: string;
    provider_ref: string | null;
    stripe_request: Stripe.Checkout.SessionCreateParams | null;
    payment_intent_ref: string | null;
    price: { total_minor: number; fee_minor: number };
  },
): PaymentEvent | null {
  // Webhook may arrive before create response persists provider_ref — ask Stripe to retry.
  if (!attempt.provider_ref) throw new DomainError('PAYMENT_UNCONFIRMED', 409);
  const orderId = session.metadata?.order_id,
    attemptId = session.metadata?.attempt_id;
  const expectedDestination = attempt.stripe_request?.payment_intent_data?.transfer_data?.destination;
  assertLiveCommerceAllowed(Boolean(session.livemode));
  if (
    session.mode !== 'payment' ||
    attempt.provider !== 'stripe' ||
    attempt.provider_ref !== session.id ||
    !expectedDestination ||
    !orderId ||
    !uuid.test(orderId) ||
    !attemptId ||
    !uuid.test(attemptId) ||
    attempt.stripe_request?.metadata?.order_id !== orderId ||
    attempt.stripe_request?.metadata?.attempt_id !== attemptId ||
    session.amount_total !== attempt.price.total_minor ||
    session.currency !== 'eur'
  )
    throw new DomainError('PAYMENT_MISMATCH', 409);
  const pi = session.payment_intent;
  if (typeof pi === 'string') throw new DomainError('PAYMENT_UNCONFIRMED', 409);
  if (pi) assertLiveCommerceAllowed(Boolean(pi.livemode));
  if (
    pi &&
    (pi.metadata.order_id !== orderId ||
      pi.metadata.attempt_id !== attemptId ||
      pi.amount !== attempt.price.total_minor ||
      pi.currency !== 'eur' ||
      objectId(pi.transfer_data?.destination) !== expectedDestination ||
      pi.application_fee_amount !== attempt.price.fee_minor ||
      (attempt.payment_intent_ref && attempt.payment_intent_ref !== pi.id))
  )
    throw new DomainError('PAYMENT_MISMATCH', 409);
  let type: PaymentEvent['type'];
  // The retrieved current state takes precedence over an old event's type.
  if (session.payment_status === 'paid') {
    if (!pi || pi.status !== 'succeeded' || pi.amount_received !== attempt.price.total_minor)
      throw new DomainError('PAYMENT_UNCONFIRMED', 409);
    type = 'payment.succeeded';
  } else if (pi?.status === 'succeeded') {
    throw new DomainError('PAYMENT_UNCONFIRMED', 409);
  } else if (session.status === 'expired') {
    type = 'payment.expired';
  } else if (pi?.status === 'processing' && session.status === 'complete') {
    type = 'payment.processing';
  } else if (
    eventType === 'checkout.session.async_payment_failed' &&
    session.status === 'complete' &&
    pi &&
    ['requires_payment_method', 'canceled'].includes(pi.status)
  ) {
    type = 'payment.failed';
  } else {
    return null;
  }
  return {
    order_id: orderId,
    attempt_id: attemptId,
    amount_minor: attempt.price.total_minor,
    currency: 'EUR',
    type,
    sandbox: false,
  };
}

// Only call after raw-body signature verification in the controller.
export async function ingestStripeCheckoutEvent(event: Stripe.Event) {
  assertLiveCommerceAllowed(Boolean(event.livemode));
  if (!checkoutEvents.has(event.type)) return;
  // Destination charges belong to the platform, never a connected-account event scope.
  if (event.account) throw new DomainError('STRIPE_EVENT_SCOPE_MISMATCH', 400);
  if (
    (await pool.query("SELECT 1 FROM provider_events WHERE provider='stripe' AND event_id=$1", [
      event.id,
    ])).rowCount
  )
    return;
  const session = await stripeCheckoutPort().retrieveSession(
    (event.data.object as Stripe.Checkout.Session).id,
    { expand: ['payment_intent', 'payment_intent.latest_charge'] },
  );
  const attemptId = session.metadata?.attempt_id,
    orderId = session.metadata?.order_id;
  if (!attemptId || !orderId || !uuid.test(attemptId) || !uuid.test(orderId))
    throw new DomainError('PAYMENT_MISMATCH', 409);
  await transaction(async (db) => {
    const attempt = (
      await db.query(
        'SELECT a.*,o.price FROM payment_attempts a JOIN orders o ON o.id=a.order_id WHERE a.id=$1 AND a.order_id=$2 FOR UPDATE OF a',
        [attemptId, orderId],
      )
    ).rows[0];
    // Includes the webhook-before-create-response race. Stripe retries after provider_ref is persisted.
    if (!attempt) throw new DomainError('PAYMENT_UNCONFIRMED', 409);
    let normalized: PaymentEvent | null;
    try {
      normalized = confirmedCheckoutEvent(session, event.type, attempt);
    } catch (error) {
      // Permanent identity/amount mismatches acknowledge the webhook (2xx) after audit so Stripe
      // does not retry forever; retriable confirmation gaps stay 409.
      if (error instanceof DomainError && error.code === 'PAYMENT_MISMATCH') {
        await audit(db, null, 'payment.stripe_mismatch', orderId, {
          event_id: event.id,
          attempt_id: attemptId,
          session_id: session.id,
        });
        await db.query(
          "UPDATE orders SET status='paid_requires_review' WHERE id=$1 AND status IN ('awaiting_payment','payment_processing')",
          [orderId],
        );
        await db.query(
          "INSERT INTO provider_events(id,provider,event_id,payload,status,error) VALUES($1,'stripe',$2,$3,'failed','PAYMENT_MISMATCH') ON CONFLICT(provider,event_id) DO NOTHING",
          [randomUUID(), event.id, JSON.stringify({ order_id: orderId, attempt_id: attemptId })],
        );
        return;
      }
      throw error;
    }
    if (!normalized) return;
    const pi = session.payment_intent;
    const piId = objectId(pi);
    const chargeId =
      pi && typeof pi !== 'string'
        ? objectId((pi as Stripe.PaymentIntent).latest_charge)
        : null;
    if (piId || chargeId) {
      await db.query(
        `UPDATE payment_attempts SET
           payment_intent_ref=COALESCE(payment_intent_ref, $2),
           charge_ref=COALESCE(charge_ref, $3)
         WHERE id=$1`,
        [attemptId, piId, chargeId],
      );
    }
    await db.query(
      'INSERT INTO provider_events(id,provider,event_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT(provider,event_id) DO NOTHING',
      [randomUUID(), 'stripe', event.id, JSON.stringify(normalized)],
    );
  });
}
