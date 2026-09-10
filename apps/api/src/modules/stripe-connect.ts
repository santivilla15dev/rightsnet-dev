import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { audit, pool, transaction } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { config } from '../common/config.js';
import {
  assertLiveCommerceAllowed,
  stripeConnectPort,
  stripeEnvironment,
  stripeThinPort,
  type StripeConnectAccount,
} from '../integrations/stripe.js';

export type ConnectStatus = {
  provider: 'sandbox' | 'stripe';
  environment: 'test' | 'live' | 'sandbox';
  stripe_account_id: string | null;
  transfers_status: 'pending' | 'active' | 'inactive' | 'unrequested' | 'simulated';
  requirements_due: boolean;
  /** Stripe requirements.summary.minimum_deadline.status when available. */
  requirements_status: string | null;
  /** transfers active and requirements not currently/past due. */
  payouts_ready: boolean;
  onboarding_complete: boolean;
  can_start_onboarding: boolean;
  platform_setup_url: string | null;
};

const THIN_CONNECT_TYPES = new Set([
  'v2.core.account[requirements].updated',
  'v2.core.account[configuration.recipient].capability_status_updated',
  'v2.core.account[configuration.recipient].updated',
  'v2.core.account.updated',
  'v2.core.account.created',
]);

function transfersStatus(
  account: StripeConnectAccount,
): ConnectStatus['transfers_status'] {
  const status =
    account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  if (status === 'active') return 'active';
  if (status === 'inactive') return 'inactive';
  if (status === 'unrequested') return 'unrequested';
  return 'pending';
}

function requirementsStatus(account: StripeConnectAccount): string | null {
  return account.requirements?.summary?.minimum_deadline?.status ?? null;
}

function onboardingComplete(account: StripeConnectAccount): boolean {
  const status = requirementsStatus(account);
  if (status === 'currently_due' || status === 'past_due') return false;
  // Fall back to entries when summary is absent (mocks / partial payloads).
  if (!status) return (account.requirements?.entries ?? []).length === 0;
  return true;
}

function requirementsDue(account: StripeConnectAccount): boolean {
  if (transfersStatus(account) !== 'active') return true;
  return !onboardingComplete(account);
}

function statusFromAccount(
  account: StripeConnectAccount,
  environment: 'test' | 'live',
): Omit<ConnectStatus, 'provider' | 'platform_setup_url'> {
  const transfers = transfersStatus(account);
  const due = requirementsDue(account);
  const complete = onboardingComplete(account);
  return {
    environment,
    stripe_account_id: account.id,
    transfers_status: transfers,
    requirements_due: due,
    requirements_status: requirementsStatus(account),
    payouts_ready: transfers === 'active' && complete,
    onboarding_complete: complete && transfers === 'active',
    can_start_onboarding: transfers !== 'active' || due,
  };
}

async function creatorRow(user: Actor) {
  const row = (
    await pool.query(
      'SELECT id, display_name, connected_account, location FROM creators WHERE user_id=$1',
      [user.id],
    )
  ).rows[0];
  if (!row) throw new DomainError('CREATOR_REQUIRED', 422, 'Crea tu perfil antes de configurar cobros.');
  return row as {
    id: string;
    display_name: string;
    connected_account: string | null;
    location: string;
  };
}

/** Resolve Connect identity country for new accounts (at|de|es). */
export function resolveConnectCountry(
  location: string | null | undefined,
  fallback = config.connectDefaultCountry,
): 'at' | 'de' | 'es' {
  const allowed = new Set(['at', 'de', 'es']);
  const base = allowed.has(fallback) ? (fallback as 'at' | 'de' | 'es') : 'at';
  const match = location?.trim().match(/(?:^|,\s*)([A-Za-z]{2})\s*$/);
  if (!match) return base;
  const code = match[1]!.toLowerCase();
  return allowed.has(code) ? (code as 'at' | 'de' | 'es') : base;
}

async function syncConnectRow(
  creatorId: string,
  account: StripeConnectAccount,
  environment: 'test' | 'live',
) {
  if (account.livemode !== (environment === 'live'))
    throw new DomainError('CONNECT_ACCOUNT_MISMATCH', 409);
  const status = transfersStatus(account);
  const due = requirementsDue(account);
  await transaction(async (db) => {
    const existing = (
      await db.query(
        'SELECT id FROM connect_accounts WHERE creator_id=$1 AND environment=$2 FOR UPDATE',
        [creatorId, environment],
      )
    ).rows[0];
    if (existing) {
      await db.query(
        `UPDATE connect_accounts SET stripe_account_id=$2, transfers_status=$3, requirements_due=$4,
         last_synced_at=now(), updated_at=now() WHERE id=$1`,
        [existing.id, account.id, status, due],
      );
    } else {
      await db.query(
        `INSERT INTO connect_accounts(id,creator_id,environment,stripe_account_id,transfers_status,requirements_due)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), creatorId, environment, account.id, status, due],
      );
    }
    // Keep denormalized destination for checkout/publish. Capability is re-checked at pay time.
    await db.query('UPDATE creators SET connected_account=$2 WHERE id=$1', [creatorId, account.id]);
  });
  return { transfers_status: status, requirements_due: due };
}

export async function getConnectStatus(user: Actor): Promise<ConnectStatus> {
  const creator = await creatorRow(user);
  if (config.payments !== 'stripe') {
    const simulated = !!creator.connected_account?.startsWith('sandbox_');
    return {
      provider: 'sandbox',
      environment: 'sandbox',
      stripe_account_id: null,
      transfers_status: simulated ? 'simulated' : 'unrequested',
      requirements_due: !simulated,
      requirements_status: simulated ? 'complete' : 'currently_due',
      payouts_ready: simulated,
      onboarding_complete: simulated,
      can_start_onboarding: false,
      platform_setup_url: null,
    };
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new DomainError(
      'STRIPE_NOT_CONFIGURED',
      503,
      'Falta STRIPE_SECRET_KEY (usa sk_test_… en .env).',
    );
  }
  const environment = stripeEnvironment();
  assertLiveCommerceAllowed(environment === 'live');
  const platformSetupUrl =
    environment === 'live'
      ? 'https://dashboard.stripe.com/settings/connect/platform-setup'
      : 'https://dashboard.stripe.com/test/settings/connect/platform-setup';
  const row = (
    await pool.query(
      'SELECT * FROM connect_accounts WHERE creator_id=$1 AND environment=$2',
      [creator.id, environment],
    )
  ).rows[0];
  if (!row) {
    return {
      provider: 'stripe',
      environment,
      stripe_account_id: null,
      transfers_status: 'unrequested',
      requirements_due: true,
      requirements_status: null,
      payouts_ready: false,
      onboarding_complete: false,
      can_start_onboarding: true,
      platform_setup_url: platformSetupUrl,
    };
  }
  // Refresh capability from Stripe; never trust only the cached row for payout readiness.
  const account = await stripeConnectPort().retrieveAccount(row.stripe_account_id);
  if (account.id !== row.stripe_account_id)
    throw new DomainError('CONNECT_ACCOUNT_MISMATCH', 409);
  const synced = await syncConnectRow(creator.id, account, environment);
  const live = statusFromAccount(account, environment);
  return {
    provider: 'stripe',
    ...live,
    transfers_status: synced.transfers_status,
    requirements_due: synced.requirements_due,
    payouts_ready: synced.transfers_status === 'active' && !synced.requirements_due,
    onboarding_complete: live.onboarding_complete,
    can_start_onboarding: synced.transfers_status !== 'active' || synced.requirements_due,
    platform_setup_url: platformSetupUrl,
  };
}

export async function ensureConnectAccount(user: Actor) {
  if (config.payments !== 'stripe')
    throw new DomainError('STRIPE_NOT_CONFIGURED', 503, 'Activa PAYMENTS_PROVIDER=stripe.');
  const environment = stripeEnvironment();
  assertLiveCommerceAllowed(environment === 'live');
  const creator = await creatorRow(user);
  const existing = (
    await pool.query(
      'SELECT * FROM connect_accounts WHERE creator_id=$1 AND environment=$2',
      [creator.id, environment],
    )
  ).rows[0];
  if (existing) {
    const account = await stripeConnectPort().retrieveAccount(existing.stripe_account_id);
    await syncConnectRow(creator.id, account, environment);
    return account;
  }
  const email = (await pool.query('SELECT email FROM users WHERE id=$1', [user.id])).rows[0]?.email;
  if (!email) throw new DomainError('CREATOR_REQUIRED', 422);
  let account: StripeConnectAccount;
  try {
    account = await stripeConnectPort().createAccount(
      {
        contact_email: email,
        display_name: creator.display_name,
        dashboard: 'express',
        defaults: {
          responsibilities: {
            fees_collector: 'application',
            losses_collector: 'application',
          },
        },
        identity: { country: resolveConnectCountry(creator.location) },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        include: ['configuration.recipient', 'identity', 'requirements'],
      },
      { idempotencyKey: `connect_acct_${creator.id}_${environment}` },
    );
  } catch (error) {
    throw mapConnectStripeError(error);
  }
  assertLiveCommerceAllowed(Boolean(account.livemode));
  await syncConnectRow(creator.id, account, environment);
  await audit(pool, user.id, 'connect.account_created', creator.id, {
    stripe_account_id: account.id,
    environment,
  });
  return account;
}

function mapConnectStripeError(error: unknown): DomainError {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  if (
    code === 'non_connect_platform_accounts_v2_access_blocked' ||
    code === 'accounts_v2_access_blocked' ||
    code === 'platform_registration_required'
  ) {
    return new DomainError(
      'CONNECT_PLATFORM_REQUIRED',
      422,
      'Tu cuenta Stripe aún no es plataforma Connect. En el Dashboard (modo test) abre Connect → completa el alta de plataforma / platform setup, y vuelve a intentarlo.',
    );
  }
  if (error instanceof DomainError) return error;
  return new DomainError(
    'CONNECT_STRIPE_ERROR',
    502,
    'Stripe no pudo crear la cuenta Connect de prueba. Revisa el log de la API o el Dashboard.',
  );
}

export async function createConnectOnboardingLink(user: Actor) {
  const status = await getConnectStatus(user);
  if (status.provider !== 'stripe')
    throw new DomainError(
      'STRIPE_NOT_CONFIGURED',
      503,
      'En sandbox usa la verificación simulada. Connect requiere Stripe test.',
    );
  await ensureConnectAccount(user);
  const refreshed = await getConnectStatus(user);
  if (!refreshed.stripe_account_id)
    throw new DomainError('CONNECT_ONBOARDING_REQUIRED', 422);
  // Recipient Accounts v2 often only allow `account_onboarding` until Stripe
  // unlocks `account_update`. Prefer update when transfers exist; fall back.
  const preferUpdate =
    refreshed.transfers_status === 'active' || refreshed.transfers_status === 'inactive';
  const returnUrl = `${config.webUrl}/dashboard?connect=return`;
  const refreshUrl = `${config.webUrl}/dashboard?connect=refresh`;
  const makeLink = (type: 'account_onboarding' | 'account_update') =>
    stripeConnectPort().createAccountLink({
      account: refreshed.stripe_account_id!,
      use_case:
        type === 'account_onboarding'
          ? {
              type: 'account_onboarding',
              account_onboarding: {
                configurations: ['recipient'],
                return_url: returnUrl,
                refresh_url: refreshUrl,
              },
            }
          : {
              type: 'account_update',
              account_update: {
                configurations: ['recipient'],
                return_url: returnUrl,
                refresh_url: refreshUrl,
              },
            },
    });
  let useCaseType: 'account_onboarding' | 'account_update' = preferUpdate
    ? 'account_update'
    : 'account_onboarding';
  let link;
  try {
    link = await makeLink(useCaseType);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (useCaseType === 'account_update' && msg.includes('account_onboarding')) {
      useCaseType = 'account_onboarding';
      link = await makeLink('account_onboarding');
    } else {
      throw mapConnectStripeError(error);
    }
  }
  assertLiveCommerceAllowed(Boolean(link.livemode));
  // Never persist the ephemeral URL — return it once to the authenticated creator.
  await audit(pool, user.id, 'connect.onboarding_link_created', refreshed.stripe_account_id, {
    use_case: useCaseType,
  });
  return {
    url: link.url,
    expires_at:
      typeof link.expires_at === 'number'
        ? new Date(link.expires_at * 1000).toISOString()
        : new Date(link.expires_at).toISOString(),
    use_case: useCaseType,
  };
}

function accountIdFromEvent(event: Stripe.Event): string | null {
  const object = event.data?.object as { id?: string; account?: string } | undefined;
  if (object?.id?.startsWith('acct_')) return object.id;
  if (typeof object?.account === 'string' && object.account.startsWith('acct_'))
    return object.account;
  if (typeof event.account === 'string' && event.account.startsWith('acct_')) return event.account;
  return null;
}

export function isConnectAccountEvent(event: Stripe.Event): boolean {
  if (event.type.startsWith('v2.core.account')) return true;
  if (
    [
      'account.updated',
      'account.application.authorized',
      'account.external_account.created',
      'account.external_account.updated',
      'account.external_account.deleted',
    ].includes(event.type)
  )
    return true;
  return false;
}

/** Thin Connect events: retrieve authoritative account state; never treat the event payload as a snapshot. */
export async function ingestConnectAccountEvent(event: Stripe.Event) {
  assertLiveCommerceAllowed(Boolean(event.livemode));
  if (!isConnectAccountEvent(event)) return;
  if (
    (await pool.query("SELECT 1 FROM provider_events WHERE provider='stripe' AND event_id=$1", [
      event.id,
    ])).rowCount
  )
    return;
  const accountId = accountIdFromEvent(event);
  if (!accountId) {
    await pool.query(
      "INSERT INTO provider_events(id,provider,event_id,payload,status,error) VALUES($1,'stripe',$2,$3,'failed','CONNECT_EVENT_MISSING_ACCOUNT') ON CONFLICT(provider,event_id) DO NOTHING",
      [randomUUID(), event.id, JSON.stringify({ type: event.type })],
    );
    return;
  }
  const row = (
    await pool.query('SELECT * FROM connect_accounts WHERE stripe_account_id=$1', [accountId])
  ).rows[0];
  if (!row) {
    // Unknown connected account — acknowledge without mutating RightsNet state.
    await pool.query(
      "INSERT INTO provider_events(id,provider,event_id,payload,status) VALUES($1,'stripe',$2,$3,'done') ON CONFLICT(provider,event_id) DO NOTHING",
      [randomUUID(), event.id, JSON.stringify({ type: event.type, account: accountId, ignored: true })],
    );
    return;
  }
  const account = await stripeConnectPort().retrieveAccount(accountId);
  if (account.id !== accountId) throw new DomainError('CONNECT_ACCOUNT_MISMATCH', 409);
  assertLiveCommerceAllowed(Boolean(account.livemode));
  const synced = await syncConnectRow(row.creator_id, account, row.environment);
  await pool.query(
    "INSERT INTO provider_events(id,provider,event_id,payload,status) VALUES($1,'stripe',$2,$3,'done') ON CONFLICT(provider,event_id) DO NOTHING",
    [
      randomUUID(),
      event.id,
      JSON.stringify({
        type: event.type,
        account: accountId,
        transfers_status: synced.transfers_status,
        requirements_due: synced.requirements_due,
      }),
    ],
  );
  await audit(pool, null, 'connect.account_synced', row.creator_id, {
    event_id: event.id,
    stripe_account_id: accountId,
    transfers_status: synced.transfers_status,
  });
}

export function isThinConnectEventType(type: string): boolean {
  return THIN_CONNECT_TYPES.has(type) || type.startsWith('v2.core.account');
}

/** Types recovered via GET /v2/core/events (max 20 per Stripe). */
export const THIN_CONNECT_RECOVERY_TYPES = [
  'v2.core.account[requirements].updated',
  'v2.core.account[configuration.recipient].capability_status_updated',
  'v2.core.account[configuration.recipient].updated',
  'v2.core.account.updated',
  'v2.core.account.created',
] as const;

/**
 * Shared ingest after a thin event id is known (webhook or list recovery).
 * Always retrieve → Accounts API; never trust notification/list body as account state.
 */
export async function ingestThinConnectEventById(eventId: string) {
  const port = stripeThinPort();
  const full = await port.retrieveEvent(eventId);
  assertLiveCommerceAllowed(Boolean(full.livemode));
  if (!isThinConnectEventType(full.type)) {
    return { received: true, ignored: true, type: full.type };
  }

  if (
    (await pool.query("SELECT 1 FROM provider_events WHERE provider='stripe' AND event_id=$1", [
      eventId,
    ])).rowCount
  )
    return { received: true, duplicate: true };

  const accountId = full.related_object?.id?.startsWith('acct_')
    ? full.related_object.id
    : null;

  if (!accountId) {
    await pool.query(
      "INSERT INTO provider_events(id,provider,event_id,payload,status,error) VALUES($1,'stripe',$2,$3,'failed','CONNECT_EVENT_MISSING_ACCOUNT') ON CONFLICT(provider,event_id) DO NOTHING",
      [randomUUID(), eventId, JSON.stringify({ type: full.type, source: 'thin' })],
    );
    return { received: true, error: 'CONNECT_EVENT_MISSING_ACCOUNT' };
  }

  const synthetic = {
    id: eventId,
    object: 'event',
    type: full.type,
    livemode: Boolean(full.livemode),
    data: { object: { id: accountId } },
    account: accountId,
  } as unknown as Stripe.Event;

  if (full.type === 'v2.core.account[requirements].updated') {
    await ingestConnectAccountEvent(synthetic);
    return { received: true, handled: 'requirements', account: accountId };
  }
  if (full.type === 'v2.core.account[configuration.recipient].capability_status_updated') {
    await ingestConnectAccountEvent(synthetic);
    return { received: true, handled: 'capability', account: accountId };
  }
  await ingestConnectAccountEvent(synthetic);
  return { received: true, handled: 'account', type: full.type, account: accountId };
}

/**
 * Thin Account v2 notifications: verify → retrieve full event → sync via Accounts API.
 * Never treat the thin body as authoritative account state.
 */
export async function ingestThinConnectNotification(
  rawBody: Buffer,
  signature: string,
  secret: string,
) {
  const port = stripeThinPort();
  let thin;
  try {
    thin = port.parseNotification(rawBody, signature, secret);
  } catch {
    throw new DomainError('INVALID_SIGNATURE', 400);
  }
  assertLiveCommerceAllowed(Boolean(thin.livemode));
  if (!isThinConnectEventType(thin.type)) {
    return { received: true, ignored: true, type: thin.type };
  }
  return ingestThinConnectEventById(thin.id);
}
