import Stripe from 'stripe';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { assertConfiguration, config } from '../common/config.js';

/**
 * Livemode Stripe payment/Connect objects require LIVE_COMMERCE_ENABLED.
 * Does not unlock APP_ENV=production.
 */
export function assertLiveCommerceAllowed(livemode: boolean) {
  if (!livemode) return;
  if (!config.liveCommerceEnabled) {
    throw new DomainError(
      'LIVE_EVENT_BLOCKED',
      400,
      'Live commerce requiere LIVE_COMMERCE_ENABLED=true (producción APP_ENV sigue bloqueada).',
    );
  }
  if (config.payments !== 'stripe') {
    throw new DomainError(
      'LIVE_EVENT_BLOCKED',
      400,
      'Live commerce requiere PAYMENTS_PROVIDER=stripe.',
    );
  }
}

export type StripeCheckoutPort = {
  createSession: (
    params: Stripe.Checkout.SessionCreateParams,
    options?: Stripe.RequestOptions,
  ) => Promise<Stripe.Checkout.Session>;
  retrieveSession: (
    id: string,
    options?: Stripe.Checkout.SessionRetrieveParams,
  ) => Promise<Stripe.Checkout.Session>;
  requireRecipient: (accountId: string) => Promise<void>;
};

export type StripeConnectAccount = {
  id: string;
  livemode: boolean;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: string | null };
        };
      };
    };
  };
  requirements?: {
    entries?: Array<{ await_reason?: string | null }>;
    summary?: { minimum_deadline?: { status?: string | null } | null };
  } | null;
};

export type StripeAccountLink = {
  url: string;
  expires_at: string | number;
  livemode: boolean;
};

export type StripeConnectPort = {
  createAccount: (
    params: Record<string, unknown>,
    options?: Stripe.RequestOptions,
  ) => Promise<StripeConnectAccount>;
  retrieveAccount: (id: string) => Promise<StripeConnectAccount>;
  createAccountLink: (params: {
    account: string;
    use_case: {
      type: 'account_onboarding' | 'account_update';
      account_onboarding?: {
        configurations: ['recipient'];
        return_url: string;
        refresh_url: string;
      };
      account_update?: {
        configurations: ['recipient'];
        return_url: string;
        refresh_url: string;
      };
    };
  }) => Promise<StripeAccountLink>;
};

/** Thin v2 event notification (Accounts). Full payload is fetched via retrieveEvent. */
export type StripeThinNotification = {
  id: string;
  type: string;
  created: string;
  livemode?: boolean;
  related_object?: { id?: string; type?: string; url?: string } | null;
};

/** Listed thin event row (V2 list). Recovery still retrieves before sync. */
export type StripeThinListEvent = {
  id: string;
  type: string;
  created: string;
  livemode?: boolean;
  related_object?: { id?: string; type?: string; url?: string } | null;
};

export type StripeThinPort = {
  parseNotification: (
    payload: Buffer | string,
    signature: string,
    secret: string,
  ) => StripeThinNotification;
  retrieveEvent: (id: string) => Promise<{
    id: string;
    type: string;
    livemode?: boolean;
    related_object?: { id?: string; type?: string; url?: string } | null;
  }>;
  /** V2 page-token pagination (not starting_after). `created.gte` is unix seconds; live adapter converts to RFC3339. */
  listEvents: (params: {
    limit?: number;
    page?: string | null;
    created?: { gte?: number };
    types?: string[];
  }) => Promise<{ data: StripeThinListEvent[]; next_page: string | null }>;
};

export type StripeRefund = {
  id: string;
  livemode: boolean;
  status: string | null;
  amount: number;
  currency: string;
  payment_intent: string | { id: string } | null;
  charge: string | { id: string } | null;
  failure_reason?: string | null;
};

export type StripeRefundPort = {
  createRefund: (
    params: {
      payment_intent: string;
      reverse_transfer: boolean;
      refund_application_fee: boolean;
      metadata?: Record<string, string>;
    },
    options?: Stripe.RequestOptions,
  ) => Promise<StripeRefund>;
  retrieveRefund: (id: string) => Promise<StripeRefund>;
};

export type StripeMoneyPort = {
  retrieveTransfer: (id: string) => Promise<Stripe.Transfer>;
  retrieveDispute: (id: string) => Promise<Stripe.Dispute>;
  retrievePayout: (id: string, stripeAccount?: string) => Promise<Stripe.Payout>;
};

export type StripeBalanceTransaction = {
  id: string;
  livemode: boolean;
  type: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  source: string | null;
  description: string | null;
  available_on: number;
  created: number;
};

export type StripeReconciliationPort = {
  listBalanceTransactions: (params: {
    starting_after?: string;
    limit?: number;
    created?: { gte?: number };
    stripeAccount?: string;
  }) => Promise<{ data: StripeBalanceTransaction[]; has_more: boolean }>;
  listEvents: (params: {
    starting_after?: string;
    limit?: number;
    created?: { gte?: number };
    types?: string[];
  }) => Promise<{ data: Stripe.Event[]; has_more: boolean }>;
};

let checkoutTestPort: StripeCheckoutPort | null = null;
let connectTestPort: StripeConnectPort | null = null;
let refundTestPort: StripeRefundPort | null = null;
let moneyTestPort: StripeMoneyPort | null = null;
let reconciliationTestPort: StripeReconciliationPort | null = null;
let thinTestPort: StripeThinPort | null = null;

/** Test-only seam. Pass null to restore the live Stripe client. */
export function setStripeCheckoutPortForTests(port: StripeCheckoutPort | null) {
  checkoutTestPort = port;
}

/** Test-only seam for Connect Accounts v2 + Account Links. */
export function setStripeConnectPortForTests(port: StripeConnectPort | null) {
  connectTestPort = port;
}

/** Test-only seam for Refunds API. */
export function setStripeRefundPortForTests(port: StripeRefundPort | null) {
  refundTestPort = port;
}

/** Test-only seam for transfers, disputes and payouts. */
export function setStripeMoneyPortForTests(port: StripeMoneyPort | null) {
  moneyTestPort = port;
}

/** Test-only seam for balance transactions and event recovery. */
export function setStripeReconciliationPortForTests(port: StripeReconciliationPort | null) {
  reconciliationTestPort = port;
}

/** Test-only seam for thin v2 event notifications. */
export function setStripeThinPortForTests(port: StripeThinPort | null) {
  thinTestPort = port;
}

export function stripeClient() {
  assertConfiguration();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new DomainError('STRIPE_NOT_CONFIGURED', 503);
  return new Stripe(key, { apiVersion: '2026-08-26.dahlia', maxNetworkRetries: 2 });
}

export function stripeEnvironment(): 'test' | 'live' {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (key.includes('_live_')) return 'live';
  return 'test';
}

export async function requireStripeRecipient(client: Stripe, accountId: string) {
  const account = await client.v2.core.accounts.retrieve(accountId, {
    include: ['configuration.recipient'],
  });
  if (account.livemode) assertLiveCommerceAllowed(true);
  if (account.id !== accountId)
    throw new DomainError('CONNECT_ACCOUNT_MISMATCH', 409);
  if (
    account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status !==
    'active'
  )
    throw new DomainError('CONNECT_ONBOARDING_REQUIRED', 422);
  return account;
}

export function stripeCheckoutPort(): StripeCheckoutPort {
  if (checkoutTestPort) return checkoutTestPort;
  const client = stripeClient();
  return {
    createSession: (params, options) => client.checkout.sessions.create(params, options),
    retrieveSession: (id, options) =>
      client.checkout.sessions.retrieve(
        id,
        options ?? { expand: ['payment_intent', 'payment_intent.latest_charge'] },
      ),
    requireRecipient: async (accountId) => {
      await requireStripeRecipient(client, accountId);
    },
  };
}

export function stripeConnectPort(): StripeConnectPort {
  if (connectTestPort) return connectTestPort;
  const client = stripeClient();
  return {
    createAccount: (params, options) =>
      client.v2.core.accounts.create(params as Stripe.V2.Core.AccountCreateParams, options) as Promise<StripeConnectAccount>,
    retrieveAccount: (id) =>
      client.v2.core.accounts.retrieve(id, {
        include: ['configuration.recipient', 'identity', 'requirements'],
      }) as Promise<StripeConnectAccount>,
    createAccountLink: (params) =>
      client.v2.core.accountLinks.create(params as Stripe.V2.Core.AccountLinkCreateParams) as Promise<StripeAccountLink>,
  };
}

/**
 * Thin event notifications for Accounts v2.
 * SDK name is parseEventNotification (docs may still say parseThinEvent).
 */
export function stripeThinPort(): StripeThinPort {
  if (thinTestPort) return thinTestPort;
  const client = stripeClient();
  const mapListed = (event: {
    id: string;
    type: string;
    created: string;
    livemode?: boolean;
    related_object?: StripeThinNotification['related_object'];
  }): StripeThinListEvent => ({
    id: event.id,
    type: event.type,
    created: String(event.created),
    livemode: Boolean(event.livemode),
    related_object:
      'related_object' in event ? (event.related_object ?? null) : null,
  });
  return {
    parseNotification: (payload, signature, secret) => {
      const notification = client.parseEventNotification(payload, signature, secret);
      return {
        id: notification.id,
        type: notification.type,
        created: String(notification.created),
        livemode: Boolean((notification as { livemode?: boolean }).livemode),
        related_object:
          'related_object' in notification
            ? ((notification as { related_object?: StripeThinNotification['related_object'] })
                .related_object ?? null)
            : null,
      };
    },
    retrieveEvent: async (id) => {
      const event = await client.v2.core.events.retrieve(id);
      return {
        id: event.id,
        type: event.type,
        livemode: Boolean((event as { livemode?: boolean }).livemode),
        related_object:
          'related_object' in event
            ? ((event as { related_object?: StripeThinNotification['related_object'] })
                .related_object ?? null)
            : null,
      };
    },
    listEvents: async ({ limit, page, created, types }) => {
      // V2 Events API expects RFC 3339 timestamps, not unix seconds (v1 style).
      const createdFilter =
        created?.gte !== undefined
          ? { gte: new Date(created.gte * 1000).toISOString() }
          : undefined;
      const result = await client.v2.core.events.list({
        limit: limit ?? 100,
        types,
        created: createdFilter,
        ...(page ? { page } : {}),
      } as Parameters<typeof client.v2.core.events.list>[0] & { page?: string });
      let nextPage: string | null = null;
      if (result.next_page_url) {
        try {
          nextPage = new URL(result.next_page_url, 'https://api.stripe.com').searchParams.get(
            'page',
          );
        } catch {
          nextPage = null;
        }
      }
      return {
        data: result.data.map((event) =>
          mapListed(event as unknown as Parameters<typeof mapListed>[0]),
        ),
        next_page: nextPage,
      };
    },
  };
}

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id ?? null;
}

export function stripeRefundPort(): StripeRefundPort {
  if (refundTestPort) return refundTestPort;
  const client = stripeClient();
  return {
    createRefund: async (params, options) => {
      const refund = await client.refunds.create(params, options);
      const live = Boolean((refund as { livemode?: boolean }).livemode);
      return {
        id: refund.id,
        livemode: live,
        status: refund.status,
        amount: refund.amount,
        currency: refund.currency,
        payment_intent: objectId(refund.payment_intent),
        charge: objectId(refund.charge),
        failure_reason: refund.failure_reason ?? null,
      };
    },
    retrieveRefund: async (id) => {
      const refund = await client.refunds.retrieve(id);
      const live = Boolean((refund as { livemode?: boolean }).livemode);
      return {
        id: refund.id,
        livemode: live,
        status: refund.status,
        amount: refund.amount,
        currency: refund.currency,
        payment_intent: objectId(refund.payment_intent),
        charge: objectId(refund.charge),
        failure_reason: refund.failure_reason ?? null,
      };
    },
  };
}

export function stripeMoneyPort(): StripeMoneyPort {
  if (moneyTestPort) return moneyTestPort;
  const client = stripeClient();
  return {
    retrieveTransfer: (id) => client.transfers.retrieve(id, { expand: ['reversals'] }),
    retrieveDispute: (id) => client.disputes.retrieve(id),
    retrievePayout: (id, stripeAccount) =>
      stripeAccount
        ? client.payouts.retrieve(id, undefined, { stripeAccount })
        : client.payouts.retrieve(id),
  };
}

function mapBalanceTx(tx: Stripe.BalanceTransaction): StripeBalanceTransaction {
  return {
    id: tx.id,
    livemode: Boolean((tx as { livemode?: boolean }).livemode),
    type: tx.type,
    amount: tx.amount,
    fee: tx.fee,
    net: tx.net,
    currency: tx.currency,
    source: typeof tx.source === 'string' ? tx.source : tx.source?.id ?? null,
    description: tx.description ?? null,
    available_on: tx.available_on,
    created: tx.created,
  };
}

export function stripeReconciliationPort(): StripeReconciliationPort {
  if (reconciliationTestPort) return reconciliationTestPort;
  const client = stripeClient();
  return {
    listBalanceTransactions: async ({ starting_after, limit, created, stripeAccount }) => {
      const page = await client.balanceTransactions.list(
        {
          limit: limit ?? 100,
          starting_after,
          created,
        },
        stripeAccount ? { stripeAccount } : undefined,
      );
      return {
        data: page.data.map(mapBalanceTx),
        has_more: page.has_more,
      };
    },
    listEvents: async ({ starting_after, limit, created, types }) => {
      const page = await client.events.list({
        limit: limit ?? 100,
        starting_after,
        created,
        types,
      });
      return { data: page.data, has_more: page.has_more };
    },
  };
}
