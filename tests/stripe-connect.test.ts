import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { demoIds, seed } from '../packages/db/seed.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { config } from '../apps/api/src/common/config.js';
import {
  setStripeConnectPortForTests,
  setStripeThinPortForTests,
  type StripeConnectAccount,
  type StripeConnectPort,
  type StripeThinPort,
} from '../apps/api/src/integrations/stripe.js';
import {
  createConnectOnboardingLink,
  getConnectStatus,
  ingestConnectAccountEvent,
  ingestThinConnectNotification,
} from '../apps/api/src/modules/stripe-connect.js';
import { DomainError } from '../packages/domain/src/index.js';

let creator: Actor;
let other: Actor;
let previousPayments: string;
let accounts = new Map<string, StripeConnectAccount>();
let createCalls = 0;
let linkCalls = 0;
let thinEvents = new Map<string, { id: string; type: string; related_object: { id: string } }>();

function account(id: string, status: string, livemode = false): StripeConnectAccount {
  const active = status === 'active';
  return {
    id,
    livemode,
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { status } },
        },
      },
    },
    requirements: {
      entries: active ? [] : [{ await_reason: 'pending' }],
      summary: {
        minimum_deadline: { status: active ? 'complete' : 'currently_due' },
      },
    },
  };
}

function mockPort(): StripeConnectPort {
  return {
    createAccount: async (_params, options) => {
      createCalls += 1;
      const id = 'acct_test_' + (options?.idempotencyKey ?? randomUUID()).toString().slice(-12);
      const created = account(id, 'pending');
      accounts.set(id, created);
      return created;
    },
    retrieveAccount: async (id) => {
      const row = accounts.get(id);
      if (!row) throw new DomainError('NOT_FOUND', 404);
      return row;
    },
    createAccountLink: async (params) => {
      linkCalls += 1;
      if (!accounts.has(params.account)) throw new DomainError('NOT_FOUND', 404);
      return {
        url: 'https://connect.stripe.test/onboard/' + params.account + '/' + linkCalls,
        expires_at: new Date(Date.now() + 600000).toISOString(),
        livemode: false,
      };
    },
  };
}

function mockThinPort(): StripeThinPort {
  return {
    parseNotification: (payload) => {
      const body = JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8'));
      if (body.fail_signature) throw new Error('bad sig');
      return {
        id: body.id,
        type: body.type,
        created: new Date().toISOString(),
        livemode: false,
        related_object: body.related_object ?? null,
      };
    },
    retrieveEvent: async (id) => {
      const row = thinEvents.get(id);
      if (!row) throw new DomainError('NOT_FOUND', 404);
      return { id: row.id, type: row.type, livemode: false, related_object: row.related_object };
    },
  };
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
  creator = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.creator])).rows[0];
  other = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.other])).rows[0];
  previousPayments = config.payments;
  process.env.STRIPE_SECRET_KEY = 'sk_test_rightsnet_connect_only';
});

afterAll(async () => {
  config.payments = previousPayments;
  delete process.env.STRIPE_SECRET_KEY;
  await pool.query('DELETE FROM connect_accounts');
  await pool.end();
});

beforeEach(async () => {
  accounts = new Map();
  thinEvents = new Map();
  createCalls = 0;
  linkCalls = 0;
  config.payments = 'stripe';
  setStripeConnectPortForTests(mockPort());
  setStripeThinPortForTests(mockThinPort());
  await pool.query('DELETE FROM connect_accounts');
  await pool.query(
    "UPDATE creators SET connected_account='sandbox_' || id::text WHERE user_id=$1",
    [creator.id],
  );
});

afterEach(() => {
  setStripeConnectPortForTests(null);
  setStripeThinPortForTests(null);
});

describe.sequential('Stripe Connect onboarding (mocked)', () => {
  it('reports sandbox simulation when payments provider is sandbox', async () => {
    config.payments = 'sandbox';
    const status = await getConnectStatus(creator);
    expect(status.provider).toBe('sandbox');
    expect(status.can_start_onboarding).toBe(false);
    expect(status.transfers_status).toBe('simulated');
  });

  it('creates a recipient account once with idempotent storage per creator/environment', async () => {
    const first = await createConnectOnboardingLink(creator);
    const second = await createConnectOnboardingLink(creator);
    expect(first.url).toContain('https://connect.stripe.test/');
    expect(second.url).not.toBe(first.url);
    expect(createCalls).toBe(1);
    expect(linkCalls).toBe(2);
    const rows = await pool.query(
      "SELECT * FROM connect_accounts WHERE creator_id=(SELECT id FROM creators WHERE user_id=$1)",
      [creator.id],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].environment).toBe('test');
    expect(rows.rows[0].stripe_account_id).toMatch(/^acct_test_/);
    const denormalized = (
      await pool.query('SELECT connected_account FROM creators WHERE user_id=$1', [creator.id])
    ).rows[0].connected_account;
    expect(denormalized).toBe(rows.rows[0].stripe_account_id);
  });

  it('blocks cross-creator access to another creator connect status path via missing profile', async () => {
    await expect(getConnectStatus(other)).rejects.toMatchObject({ code: 'CREATOR_REQUIRED' });
  });

  it('never stores Account Link URLs in the database', async () => {
    const link = await createConnectOnboardingLink(creator);
    const hit = await pool.query(
      `SELECT 1 FROM connect_accounts WHERE stripe_account_id::text LIKE $1
       UNION ALL SELECT 1 FROM audit_events WHERE details::text LIKE $1 LIMIT 1`,
      ['%' + link.url + '%'],
    );
    expect(hit.rowCount).toBe(0);
  });

  it('syncs capability from thin Connect events without trusting the event body as snapshot', async () => {
    await createConnectOnboardingLink(creator);
    const row = (
      await pool.query(
        `SELECT * FROM connect_accounts WHERE creator_id=(SELECT id FROM creators WHERE user_id=$1)`,
        [creator.id],
      )
    ).rows[0];
    expect(row.transfers_status).toBe('pending');
    accounts.set(row.stripe_account_id, account(row.stripe_account_id, 'active'));
    const eventId = 'evt_connect_' + randomUUID();
    await ingestConnectAccountEvent({
      id: eventId,
      object: 'event',
      livemode: false,
      type: 'v2.core.account.updated',
      data: { object: { id: row.stripe_account_id } },
    } as never);
    await ingestConnectAccountEvent({
      id: eventId,
      object: 'event',
      livemode: false,
      type: 'v2.core.account.updated',
      data: { object: { id: row.stripe_account_id } },
    } as never);
    const synced = (
      await pool.query('SELECT transfers_status, requirements_due FROM connect_accounts WHERE id=$1', [
        row.id,
      ])
    ).rows[0];
    expect(synced.transfers_status).toBe('active');
    expect(synced.requirements_due).toBe(false);
    expect(
      (await pool.query("SELECT * FROM provider_events WHERE event_id=$1", [eventId])).rowCount,
    ).toBe(1);
    const status = await getConnectStatus(creator);
    expect(status.payouts_ready).toBe(true);
    expect(status.can_start_onboarding).toBe(false);
  });

  it('uses account_update when requirements return after an active capability', async () => {
    await createConnectOnboardingLink(creator);
    const row = (
      await pool.query(
        `SELECT * FROM connect_accounts WHERE creator_id=(SELECT id FROM creators WHERE user_id=$1)`,
        [creator.id],
      )
    ).rows[0];
    accounts.set(row.stripe_account_id, {
      ...account(row.stripe_account_id, 'active'),
      requirements: {
        entries: [{ await_reason: 'documents' }],
        summary: { minimum_deadline: { status: 'currently_due' } },
      },
    });
    await ingestConnectAccountEvent({
      id: 'evt_req_' + randomUUID(),
      object: 'event',
      livemode: false,
      type: 'v2.core.account.updated',
      data: { object: { id: row.stripe_account_id } },
    } as never);
    const link = await createConnectOnboardingLink(creator);
    expect(link.use_case).toBe('account_update');
    expect(createCalls).toBe(1);
  });

  it('ingests thin requirements + capability events via retrieve, not thin body', async () => {
    await createConnectOnboardingLink(creator);
    const row = (
      await pool.query(
        `SELECT * FROM connect_accounts WHERE creator_id=(SELECT id FROM creators WHERE user_id=$1)`,
        [creator.id],
      )
    ).rows[0];
    accounts.set(row.stripe_account_id, account(row.stripe_account_id, 'active'));

    const reqId = 'evt_thin_req_' + randomUUID();
    thinEvents.set(reqId, {
      id: reqId,
      type: 'v2.core.account[requirements].updated',
      related_object: { id: row.stripe_account_id },
    });
    const reqResult = await ingestThinConnectNotification(
      Buffer.from(
        JSON.stringify({
          id: reqId,
          type: 'v2.core.account[requirements].updated',
          related_object: { id: row.stripe_account_id },
        }),
      ),
      'sig_test',
      'whsec_test',
    );
    expect(reqResult.handled).toBe('requirements');

    const capId = 'evt_thin_cap_' + randomUUID();
    thinEvents.set(capId, {
      id: capId,
      type: 'v2.core.account[configuration.recipient].capability_status_updated',
      related_object: { id: row.stripe_account_id },
    });
    const capResult = await ingestThinConnectNotification(
      Buffer.from(
        JSON.stringify({
          id: capId,
          type: 'v2.core.account[configuration.recipient].capability_status_updated',
          related_object: { id: row.stripe_account_id },
        }),
      ),
      'sig_test',
      'whsec_test',
    );
    expect(capResult.handled).toBe('capability');

    const synced = (
      await pool.query('SELECT transfers_status, requirements_due FROM connect_accounts WHERE id=$1', [
        row.id,
      ])
    ).rows[0];
    expect(synced.transfers_status).toBe('active');
    expect(synced.requirements_due).toBe(false);

    const status = await getConnectStatus(creator);
    expect(status.onboarding_complete).toBe(true);
    expect(status.payouts_ready).toBe(true);
    expect(status.requirements_status).toBe('complete');
    expect(status.platform_setup_url).toContain('platform-setup');
  });

  it('rejects thin notifications with invalid signature', async () => {
    await expect(
      ingestThinConnectNotification(
        Buffer.from(JSON.stringify({ id: 'x', type: 'v2.core.account.updated', fail_signature: true })),
        'bad',
        'whsec_test',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });
});
