import { describe, it, expect, afterEach } from 'vitest';
import type Stripe from 'stripe';
import { DomainError } from '../packages/domain/src/index.js';
import { config } from '../apps/api/src/common/config.js';
import { confirmedCheckoutEvent } from '../apps/api/src/modules/stripe-events.js';

const orderId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const sessionId = 'cs_test_session';
const piId = 'pi_test_intent';
const destination = 'acct_test_creator';
const total = 10000;
const fee = 1500;

function stripeRequest(): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'payment',
    metadata: { order_id: orderId, attempt_id: attemptId },
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination },
      metadata: { order_id: orderId, attempt_id: attemptId },
    },
  };
}

function attempt(overrides: Partial<{
  provider: string;
  provider_ref: string | null;
  stripe_request: Stripe.Checkout.SessionCreateParams | null;
  payment_intent_ref: string | null;
  price: { total_minor: number; fee_minor: number };
}> = {}) {
  return {
    provider: 'stripe' as const,
    provider_ref: sessionId as string | null,
    stripe_request: stripeRequest(),
    payment_intent_ref: null as string | null,
    price: { total_minor: total, fee_minor: fee },
    ...overrides,
  };
}

function paymentIntent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return {
    id: piId,
    object: 'payment_intent',
    livemode: false,
    amount: total,
    amount_received: total,
    currency: 'eur',
    status: 'succeeded',
    application_fee_amount: fee,
    metadata: { order_id: orderId, attempt_id: attemptId },
    transfer_data: { destination },
    ...overrides,
  } as Stripe.PaymentIntent;
}

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: sessionId,
    object: 'checkout.session',
    livemode: false,
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: total,
    currency: 'eur',
    metadata: { order_id: orderId, attempt_id: attemptId },
    payment_intent: paymentIntent(),
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe('confirmedCheckoutEvent', () => {
  it('maps a paid session with succeeded PaymentIntent to payment.succeeded', () => {
    expect(confirmedCheckoutEvent(session(), 'checkout.session.completed', attempt())).toEqual({
      order_id: orderId,
      attempt_id: attemptId,
      amount_minor: total,
      currency: 'EUR',
      type: 'payment.succeeded',
      sandbox: false,
    });
  });

  it('maps complete + processing PaymentIntent to payment.processing', () => {
    const result = confirmedCheckoutEvent(
      session({
        payment_status: 'unpaid',
        payment_intent: paymentIntent({ status: 'processing', amount_received: 0 }),
      }),
      'checkout.session.completed',
      attempt(),
    );
    expect(result?.type).toBe('payment.processing');
  });

  it('maps an expired session to payment.expired', () => {
    const result = confirmedCheckoutEvent(
      session({
        status: 'expired',
        payment_status: 'unpaid',
        payment_intent: null,
      }),
      'checkout.session.expired',
      attempt(),
    );
    expect(result?.type).toBe('payment.expired');
  });

  it('maps async_payment_failed with canceled PaymentIntent to payment.failed', () => {
    const result = confirmedCheckoutEvent(
      session({
        payment_status: 'unpaid',
        payment_intent: paymentIntent({ status: 'canceled', amount_received: 0 }),
      }),
      'checkout.session.async_payment_failed',
      attempt(),
    );
    expect(result?.type).toBe('payment.failed');
  });

  it('returns null for a non-actionable open session event', () => {
    expect(
      confirmedCheckoutEvent(
        session({
          status: 'open',
          payment_status: 'unpaid',
          payment_intent: paymentIntent({ status: 'requires_payment_method', amount_received: 0 }),
        }),
        'checkout.session.completed',
        attempt(),
      ),
    ).toBeNull();
  });

  it('rejects livemode sessions when LIVE_COMMERCE_ENABLED is false', () => {
    (config as { liveCommerceEnabled: boolean }).liveCommerceEnabled = false;
    expect(() =>
      confirmedCheckoutEvent(session({ livemode: true }), 'checkout.session.completed', attempt()),
    ).toThrow(DomainError);
    try {
      confirmedCheckoutEvent(session({ livemode: true }), 'checkout.session.completed', attempt());
    } catch (e) {
      expect(e).toMatchObject({ code: 'LIVE_EVENT_BLOCKED', status: 400 });
    }
  });

  it('accepts livemode sessions when LIVE_COMMERCE_ENABLED is true', () => {
    (config as { liveCommerceEnabled: boolean }).liveCommerceEnabled = true;
    (config as { payments: string }).payments = 'stripe';
    expect(
      confirmedCheckoutEvent(session({ livemode: true }), 'checkout.session.completed', attempt())
        ?.type,
    ).toBe('payment.succeeded');
  });

  afterEach(() => {
    (config as { liveCommerceEnabled: boolean }).liveCommerceEnabled = false;
    (config as { payments: string }).payments = process.env.PAYMENTS_PROVIDER ?? 'sandbox';
  });

  it('rejects amount and currency mismatches', () => {
    expect(() =>
      confirmedCheckoutEvent(session({ amount_total: 1 }), 'checkout.session.completed', attempt()),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_MISMATCH' }));
    expect(() =>
      confirmedCheckoutEvent(session({ currency: 'usd' }), 'checkout.session.completed', attempt()),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_MISMATCH' }));
  });

  it('rejects a destination that differs from the immutable snapshot', () => {
    expect(() =>
      confirmedCheckoutEvent(
        session({
          payment_intent: paymentIntent({
            transfer_data: { destination: 'acct_other' },
          }),
        }),
        'checkout.session.completed',
        attempt(),
      ),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_MISMATCH' }));
  });

  it('rejects invalid metadata UUIDs', () => {
    expect(() =>
      confirmedCheckoutEvent(
        session({ metadata: { order_id: 'not-a-uuid', attempt_id: attemptId } }),
        'checkout.session.completed',
        attempt(),
      ),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_MISMATCH' }));
  });

  it('rejects a provider_ref that does not match the session id', () => {
    expect(() =>
      confirmedCheckoutEvent(session(), 'checkout.session.completed', attempt({ provider_ref: 'cs_other' })),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_MISMATCH' }));
  });

  it('asks Stripe to retry when provider_ref is not persisted yet', () => {
    expect(() =>
      confirmedCheckoutEvent(session(), 'checkout.session.completed', attempt({ provider_ref: null })),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_UNCONFIRMED', status: 409 }));
  });

  it('rejects an application fee that differs from the order price', () => {
    expect(() =>
      confirmedCheckoutEvent(
        session({
          payment_intent: paymentIntent({ application_fee_amount: 1 }),
        }),
        'checkout.session.completed',
        attempt(),
      ),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_MISMATCH' }));
  });

  it('rejects an unexpanded payment_intent string as PAYMENT_UNCONFIRMED', () => {
    expect(() =>
      confirmedCheckoutEvent(
        session({ payment_intent: piId }),
        'checkout.session.completed',
        attempt(),
      ),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_UNCONFIRMED', status: 409 }));
  });

  it('rejects paid session without a succeeded PaymentIntent as PAYMENT_UNCONFIRMED', () => {
    expect(() =>
      confirmedCheckoutEvent(
        session({
          payment_intent: paymentIntent({ status: 'processing', amount_received: 0 }),
        }),
        'checkout.session.completed',
        attempt(),
      ),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_UNCONFIRMED' }));
  });

  it('rejects a bound payment_intent_ref that does not match the session PI', () => {
    expect(() =>
      confirmedCheckoutEvent(
        session(),
        'checkout.session.completed',
        attempt({ payment_intent_ref: 'pi_other' }),
      ),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_MISMATCH' }));
  });
});
