import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { actor, demoLogin, type Actor } from '../apps/api/src/common/auth.js';
import { mutate } from '../apps/api/src/common/idempotency.js';
import {
  createRequest,
  createQuote,
  createOrder,
  acceptOrder,
  getOrder,
  approveRequest,
} from '../apps/api/src/modules/licensing.js';
import {
  checkout,
  simulatePayment,
  processPaymentEvents,
  issueLicenses,
  persistPaymentEvent,
  refundSandbox,
} from '../apps/api/src/modules/payments.js';
import {
  createCreator,
  updatePolicy,
  consent,
  publish,
  search,
  getAsset,
  publicAsset,
} from '../apps/api/src/modules/marketplace.js';
import { defaultPolicy, hash, type Usage } from '../packages/domain/src/index.js';
let buyer: Actor, creator: Actor, other: Actor, viewer: Actor, admin: Actor, assetId: string;
const usage = (): Usage => ({
  campaign_name: 'Integration ' + randomUUID().slice(0, 8),
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
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test'))
    throw new Error('Tests require a dedicated database ending _test');
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Unsafe test DB name');
  url.pathname = '/postgres';
  const management = new pg.Pool({ connectionString: url.toString() });
  if (!(await management.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
    await management.query('CREATE DATABASE ' + name);
  await management.end();
  await migrate();
  await seed();
  const users = (await pool.query('SELECT * FROM users')).rows;
  buyer = users.find((u) => u.id === demoIds.buyer);
  creator = users.find((u) => u.id === demoIds.creator);
  other = users.find((u) => u.id === demoIds.other);
  viewer = users.find((u) => u.id === demoIds.viewer);
  admin = users.find((u) => u.id === demoIds.admin);
  await pool.query("UPDATE assets SET status='published' WHERE relationship_status='reviewed'");
  assetId = (
    await pool.query(
      'SELECT a.id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE c.user_id=$1',
      [creator.id],
    )
  ).rows[0].id;
});
afterAll(() => pool.end());
async function makeOrder() {
  const r = await transaction((db) =>
    createRequest(db, buyer, { organization_id: demoIds.org, asset_id: assetId, usage: usage() }),
  );
  const q = await transaction((db) => createQuote(db, buyer, { request_id: r.id }));
  return transaction((db) => createOrder(db, buyer, { quote_id: q.id }));
}
async function paidOrder() {
  const o = await makeOrder();
  await transaction((db) =>
    acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
  );
  await checkout(buyer, o.id);
  await simulatePayment(buyer, o.id, true);
  await processPaymentEvents();
  await issueLicenses();
  return o;
}
describe.sequential('PostgreSQL boundaries and commerce', () => {
  it('auth uses server stored token and logout/expiry is enforced', async () => {
    const login = await demoLogin('buyer');
    expect(
      (await actor({ headers: { authorization: 'Bearer ' + login.token } } as Request)).id,
    ).toBe(buyer.id);
    await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [
      buyer.id,
    ]);
    await expect(
      actor({ headers: { authorization: 'Bearer ' + login.token } } as Request),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('search filters by gender, language, age_band and ai_usage', async () => {
    const byGender = await search({ gender: 'female' });
    expect(byGender.items.length).toBeGreaterThan(0);
    expect(byGender.items.every((a: { gender?: string }) => a.gender === 'female')).toBe(true);

    const byLang = await search({ language: 'de' });
    expect(byLang.items.length).toBeGreaterThan(0);
    expect(
      byLang.items.every((a: { languages?: string[] }) => (a.languages ?? []).includes('de')),
    ).toBe(true);

    const byAge = await search({ age_band: '25_34' });
    expect(byAge.items.length).toBeGreaterThan(0);
    expect(byAge.items.every((a: { age_band?: string }) => a.age_band === '25_34')).toBe(true);

    const byAi = await search({ ai_usage: 'synthetic_video' });
    expect(byAi.items.length).toBeGreaterThan(0);
    for (const item of byAi.items as { policy: Record<string, unknown> }[]) {
      const ops = item.policy.operations;
      if (Array.isArray(ops)) expect(ops).toContain('synthetic_video');
      else
        expect(['ALLOW', 'REQUIRES_APPROVAL']).toContain(
          (ops as Record<string, string>).synthetic_video,
        );
    }
  });
  it('resolves public creator slug lucia-martin to asset UUID', async () => {
    const bySlug = await getAsset(pool, 'lucia-martin');
    expect(bySlug.public_slug).toBe('lucia-martin');
    expect(bySlug.display_name).toMatch(/Lucía|Lucia/i);
    expect(bySlug.location).toMatch(/Vienna/i);
    const byUuid = await getAsset(pool, bySlug.id);
    expect(byUuid.id).toBe(bySlug.id);
    expect(publicAsset(bySlug).public_slug).toBe('lucia-martin');
  });
  it('blocks cross-organization reads and viewer writes', async () => {
    const o = await makeOrder();
    await expect(getOrder(pool, other, o.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      transaction((db) =>
        createRequest(db, viewer, {
          organization_id: demoIds.org,
          asset_id: assetId,
          usage: usage(),
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('rejects acceptance of a different contract hash', async () => {
    const o = await makeOrder();
    await expect(
      transaction((db) =>
        acceptOrder(db, buyer, o.id, { accepted: true, document_hash: 'a'.repeat(64) }),
      ),
    ).rejects.toMatchObject({ code: 'DOCUMENT_CHANGED' });
  });
  it('idempotent parallel commands persist one result and reject key reuse with changed input', async () => {
    const key = randomUUID(),
      body = { organization_id: demoIds.org, asset_id: assetId, usage: usage() };
    const run = () =>
      mutate(buyer.id, 'test-requests', key, body, (db) => createRequest(db, buyer, body));
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.id).toBe(b.id);
    await expect(
      mutate(buyer.id, 'test-requests', key, { ...body, changed: true }, (db) =>
        createRequest(db, buyer, body),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('concurrent checkout and duplicate events issue exactly one license and one financial effect', async () => {
    const o = await makeOrder();
    await transaction((db) =>
      acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
    );
    const [a, b] = await Promise.all([checkout(buyer, o.id), checkout(buyer, o.id)]);
    expect(a.attempt_id).toBe(b.attempt_id);
    await Promise.all([simulatePayment(buyer, o.id, true), simulatePayment(buyer, o.id, true)]);
    await Promise.all([processPaymentEvents(), processPaymentEvents()]);
    await Promise.all([issueLicenses(), issueLicenses()]);
    expect((await pool.query('SELECT * FROM licenses WHERE order_id=$1', [o.id])).rowCount).toBe(1);
    expect(
      (await pool.query("SELECT * FROM journals WHERE order_id=$1 AND kind='payment'", [o.id]))
        .rowCount,
    ).toBe(1);
    expect((await getOrder(pool, buyer, o.id)).status).toBe('fulfilled');
  });
  it('failed payment permits retry and a late failure never degrades success', async () => {
    const o = await makeOrder();
    const detailed = await getOrder(pool, buyer, o.id);
    expect(detailed.organization_legal_name).toBeTruthy();
    await transaction((db) =>
      acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
    );
    await checkout(buyer, o.id);
    await simulatePayment(buyer, o.id, false);
    await processPaymentEvents();
    expect((await getOrder(pool, buyer, o.id)).status).toBe('awaiting_payment');
    const a = await checkout(buyer, o.id);
    await simulatePayment(buyer, o.id, true);
    await processPaymentEvents();
    await persistPaymentEvent('sandbox', randomUUID(), {
      order_id: o.id,
      attempt_id: a.attempt_id!,
      amount_minor: o.price.total_minor,
      currency: 'EUR',
      type: 'payment.failed',
      sandbox: true,
    });
    await processPaymentEvents();
    await issueLicenses();
    expect((await getOrder(pool, buyer, o.id)).status).toBe('fulfilled');
  });
  it('mismatched payment amount does not issue a license', async () => {
    const o = await makeOrder();
    await transaction((db) =>
      acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
    );
    const a = await checkout(buyer, o.id);
    await persistPaymentEvent('sandbox', randomUUID(), {
      order_id: o.id,
      attempt_id: a.attempt_id!,
      amount_minor: 1,
      currency: 'EUR',
      type: 'payment.succeeded',
      sandbox: true,
    });
    await processPaymentEvents();
    await issueLicenses();
    expect((await getOrder(pool, buyer, o.id)).status).toBe('paid_requires_review');
    expect((await pool.query('SELECT 1 FROM licenses WHERE order_id=$1', [o.id])).rowCount).toBe(0);
  });
  it('refunds are balanced, repeatable and do not silently revoke', async () => {
    const o = await paidOrder();
    await transaction((db) => refundSandbox(db, admin, o.id, 'Sandbox test refund'));
    await transaction((db) => refundSandbox(db, admin, o.id, 'Sandbox test refund'));
    expect(
      (await pool.query("SELECT 1 FROM journals WHERE order_id=$1 AND kind='refund'", [o.id]))
        .rowCount,
    ).toBe(1);
    expect(
      (await pool.query('SELECT status FROM licenses WHERE order_id=$1', [o.id])).rows[0].status,
    ).toBe('issued');
    const entries = (
      await pool.query(
        'SELECT e.* FROM ledger_entries e JOIN journals j ON j.id=e.journal_id WHERE j.order_id=$1',
        [o.id],
      )
    ).rows;
    for (const account of new Set(entries.map((e) => e.account)))
      expect(
        entries
          .filter((e) => e.account === account)
          .reduce((sum, e) => sum + (e.side === 'debit' ? 1 : -1) * Number(e.amount_minor), 0),
      ).toBe(0);
  });
  it('DB rejects unbalanced journals and mutable evidence', async () => {
    const o = await makeOrder();
    await expect(
      transaction(async (db) => {
        const id = randomUUID();
        await db.query("INSERT INTO journals(id,order_id,kind,currency) VALUES($1,$2,$3,'EUR')", [
          id,
          o.id,
          randomUUID(),
        ]);
        await db.query("INSERT INTO ledger_entries VALUES($1,$2,'test','debit',123)", [
          randomUUID(),
          id,
        ]);
      }),
    ).rejects.toThrow('Unbalanced');
    await expect(
      pool.query("UPDATE policies SET sha256='bad' WHERE asset_id=$1", [assetId]),
    ).rejects.toThrow('append only');
    await expect(pool.query("UPDATE orders SET price='{}' WHERE id=$1", [o.id])).rejects.toThrow(
      'immutable',
    );
  });
  it('new profiles cannot publish through consent alone', async () => {
    const u = {
      id: randomUUID(),
      email: randomUUID() + '@example.test',
      display_name: 'New creator',
      role: 'creator',
    };
    await pool.query('INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,$4)', [
      u.id,
      u.email,
      u.display_name,
      u.role,
    ]);
    const a = await transaction((db) =>
      createCreator(db, u, {
        display_name: 'New creator',
        bio: 'A fictional creator for integration tests.',
        location: 'Madrid, ES',
        policy: defaultPolicy,
      }),
    );
    await transaction((db) =>
      consent(db, u, a.id, { document_hash: a.policy_hash, accepted: true }),
    );
    await expect(transaction((db) => publish(db, u, a.id))).rejects.toMatchObject({
      code: 'VERIFICATION_REQUIRED',
    });
  });
  it('manual approval is required and cannot override a denied category', async () => {
    const row = (
      await pool.query(
        "SELECT a.id,c.user_id FROM assets a JOIN policies p ON p.id=a.policy_id JOIN creators c ON c.id=a.creator_id WHERE p.payload->>'approval'='manual' LIMIT 1",
      )
    ).rows[0];
    const u = (await pool.query('SELECT * FROM users WHERE id=$1', [row.user_id])).rows[0];
    const policy = (
      await pool.query(
        'SELECT p.payload FROM assets a JOIN policies p ON p.id=a.policy_id WHERE a.id=$1',
        [row.id],
      )
    ).rows[0].payload;
    const r = await transaction((db) =>
      createRequest(db, buyer, {
        organization_id: demoIds.org,
        asset_id: row.id,
        usage: { ...usage(), category: policy.categories[0] },
      }),
    );
    expect(r.decision).toBe('REQUIRES_APPROVAL');
    await expect(
      transaction((db) => createQuote(db, buyer, { request_id: r.id })),
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    await transaction((db) =>
      approveRequest(db, u, r.id, { decision: 'approve', usage_hash: r.usage_hash }),
    );
    expect(
      (await transaction((db) => createQuote(db, buyer, { request_id: r.id }))).id,
    ).toBeTruthy();
    const denied = await transaction((db) =>
      createRequest(db, buyer, {
        organization_id: demoIds.org,
        asset_id: row.id,
        usage: { ...usage(), category: 'politics' },
      }),
    );
    await expect(
      transaction((db) =>
        approveRequest(db, u, denied.id, { decision: 'approve', usage_hash: denied.usage_hash }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('policy updates after checkout retain the accepted snapshot', async () => {
    const o = await makeOrder();
    await transaction((db) =>
      acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
    );
    await checkout(buyer, o.id);
    const current = (
      await pool.query(
        'SELECT p.payload FROM assets a JOIN policies p ON p.id=a.policy_id WHERE a.id=$1',
        [assetId],
      )
    ).rows[0].payload;
    const next = await transaction((db) =>
      updatePolicy(db, creator, assetId, {
        ...current,
        prices: { '30': current.prices['30'] + 100, '90': current.prices['90'] },
      }),
    );
    await transaction((db) =>
      consent(db, creator, assetId, { accepted: true, document_hash: next.sha256 }),
    );
    await transaction((db) => publish(db, creator, assetId));
    await simulatePayment(buyer, o.id, true);
    await processPaymentEvents();
    await issueLicenses();
    const l = (await pool.query('SELECT payload FROM licenses WHERE order_id=$1', [o.id])).rows[0];
    expect(l.payload.policy_hash).toBe(hash(o.policy_snapshot));
    expect((await getOrder(pool, buyer, o.id)).status).toBe('fulfilled');
  });
  it('emergency suspension after checkout prevents issuance', async () => {
    const o = await makeOrder();
    await transaction((db) =>
      acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
    );
    await checkout(buyer, o.id);
    await pool.query("UPDATE assets SET status='suspended' WHERE id=$1", [assetId]);
    await simulatePayment(buyer, o.id, true);
    await processPaymentEvents();
    await issueLicenses();
    expect((await getOrder(pool, buyer, o.id)).status).toBe('paid_requires_review');
    expect((await pool.query('SELECT 1 FROM licenses WHERE order_id=$1', [o.id])).rowCount).toBe(0);
    await pool.query("UPDATE assets SET status='published' WHERE id=$1", [assetId]);
  });
});
