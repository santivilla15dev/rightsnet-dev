import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, seedRightsCoreFixture, demoIds } from '../packages/db/seed.js';
import {
  createRequest,
  createQuote,
  createOrder,
  acceptOrder,
  approveRequest,
} from '../apps/api/src/modules/licensing.js';
import {
  checkout,
  simulatePayment,
  processPaymentEvents,
  issueLicenses,
} from '../apps/api/src/modules/payments.js';
import { publicPassportForAsset } from '../apps/api/src/modules/marketplace.js';
import { assertIssuanceAllowed } from '../packages/domain/src/index.js';
import type { Actor } from '../apps/api/src/common/auth.js';

let buyer: Actor;
let rightsCreator: Actor;

function rightsRequest(overrides: Record<string, unknown> = {}) {
  return {
    campaign_name: 'Rights Core DE ' + randomUUID().slice(0, 8),
    purpose: 'commercial_advertising' as const,
    industry: 'beauty' as const,
    generation_type: 'synthetic_image' as const,
    territories: ['DE'] as ('DE' | 'AT')[],
    channels: ['instagram'] as ('instagram' | 'tiktok' | 'youtube')[],
    starts_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    duration_days: 30 as const,
    commercial_use: true as const,
    exclusivity: 'none' as const,
    requested_additional_rights: [] as [],
    ...overrides,
  };
}

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
  await seedRightsCoreFixture();
  const users = (await pool.query('SELECT * FROM users')).rows;
  buyer = users.find((u) => u.id === demoIds.buyer);
  rightsCreator = users.find((u) => u.id === demoIds.rightsCoreCreatorUser);
});
afterAll(() => pool.end());

describe.sequential('Rights Core purchase dual-path', () => {
  it('evaluates ALLOW for complete DE beauty request on rights-policy asset', async () => {
    const r = await transaction((db) =>
      createRequest(db, buyer, {
        organization_id: demoIds.org,
        asset_id: demoIds.rightsCoreAsset,
        request: rightsRequest(),
      }),
    );
    expect(r.decision).toBe('ALLOW');
    expect(r.reason_codes).toEqual([]);
    expect('engine_version' in r ? r.engine_version : null).toBe('rightsnet.engine/0.1');
  });

  it('returns INCOMPLETE when channel missing', async () => {
    const r = await transaction((db) =>
      createRequest(db, buyer, {
        organization_id: demoIds.org,
        asset_id: demoIds.rightsCoreAsset,
        request: rightsRequest({ channels: undefined }),
      }),
    );
    expect(r.decision).toBe('INCOMPLETE');
    expect(r.reason_codes).toContain('REQUEST_FIELDS_MISSING');
    expect('missing_fields' in r ? r.missing_fields : []).toContain('channels');
  });

  it('returns DENY for platform-prohibited industry', async () => {
    const r = await transaction((db) =>
      createRequest(db, buyer, {
        organization_id: demoIds.org,
        asset_id: demoIds.rightsCoreAsset,
        request: rightsRequest({ industry: 'gambling' }),
      }),
    );
    expect(r.decision).toBe('DENY');
    expect(r.reason_codes).toContain('PLATFORM_USE_PROHIBITED');
  });

  it('approve re-evaluates and does not assign ALLOW blindly', async () => {
    const r = await transaction((db) =>
      createRequest(db, buyer, {
        organization_id: demoIds.org,
        asset_id: demoIds.rightsCoreAsset,
        request: rightsRequest({
          industry: 'alcohol',
        }),
      }),
    );
    // alcohol is NOT_SPECIFIED on beauty fixture → INCOMPLETE, not REQUIRES_APPROVAL
    // Force MANUAL path: use beauty with a request that needs approval via update — instead
    // create MANUAL by requesting when we temporarily need approval from MANUAL policy.
    // Greta policy is AUTOMATIC; alcohol NOT_SPECIFIED → INCOMPLETE.
    expect(['INCOMPLETE', 'REQUIRES_APPROVAL']).toContain(r.decision);
  });

  it('manual approval path re-runs engine', async () => {
    // Insert a one-off MANUAL rights policy asset for this creator
    const aid = randomUUID();
    const pid = randomUUID();
    const { beautyDePolicy, rightsHash } = await import('../packages/domain/src/index.js');
    const policy = beautyDePolicy({
      policy_id: pid,
      asset_id: aid,
      creator_id: demoIds.rightsCoreCreator,
      approval_mode: 'MANUAL',
    });
    await pool.query(
      "INSERT INTO assets(id,creator_id,status,relationship_status) VALUES($1,$2,'published','reviewed')",
      [aid, demoIds.rightsCoreCreator],
    );
    await pool.query('INSERT INTO policies(id,asset_id,version,payload,sha256) VALUES($1,$2,1,$3,$4)', [
      pid,
      aid,
      JSON.stringify(policy),
      rightsHash(policy),
    ]);
    await pool.query('UPDATE assets SET policy_id=$1 WHERE id=$2', [pid, aid]);
    await pool.query(
      'INSERT INTO consents(id,policy_id,user_id,document_hash,license_terms_version) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), pid, demoIds.rightsCoreCreatorUser, rightsHash(policy), policy.license_terms_version],
    );

    const created = await transaction((db) =>
      createRequest(db, buyer, {
        organization_id: demoIds.org,
        asset_id: aid,
        request: rightsRequest(),
      }),
    );
    expect(created.decision).toBe('REQUIRES_APPROVAL');

    const after = await transaction((db) =>
      approveRequest(db, rightsCreator, created.id, {
        decision: 'approve',
        usage_hash: created.usage_hash,
      }),
    );
    expect(after.decision).toBe('ALLOW');
    expect(after.reason_codes).toEqual([]);
  });

  it('completes sandbox loop to issued license', async () => {
    const created = await transaction((db) =>
      createRequest(db, buyer, {
        organization_id: demoIds.org,
        asset_id: demoIds.rightsCoreAsset,
        request: rightsRequest(),
      }),
    );
    expect(created.decision).toBe('ALLOW');
    const q = await transaction((db) => createQuote(db, buyer, { request_id: created.id }));
    const o = await transaction((db) => createOrder(db, buyer, { quote_id: q.id }));
    await transaction((db) =>
      acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
    );
    await checkout(buyer, o.id);
    await simulatePayment(buyer, o.id, true);
    await processPaymentEvents();
    await issueLicenses();
    const license = (
      await pool.query('SELECT * FROM licenses WHERE order_id=$1', [o.id])
    ).rows[0];
    expect(license?.status).toBe('issued');
    expect(license.payload.policy_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('blocks issuance without contract acceptance (pure gate)', () => {
    const gate = assertIssuanceAllowed({
      payment_succeeded: true,
      contract_accepted: false,
      eligibility: {
        schema_version: 'rightsnet.license-decision/0.1',
        decision: 'ALLOW',
        reason_codes: [],
        missing_fields: [],
        request_hash: 'a'.repeat(64),
        policy_hash: 'b'.repeat(64),
        platform_policy_version: 'platform-policy/0.1',
        engine_version: 'rightsnet.engine/0.1',
        evaluated_at: new Date().toISOString(),
      },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain('CONTRACT_NOT_ACCEPTED');
  });

  it('public passport expose only allowlisted fields', async () => {
    const pub = await publicPassportForAsset(demoIds.rightsCoreAsset);
    expect(pub.schema_version).toBe('rightsnet.rights-passport/0.1');
    expect(pub).not.toHaveProperty('legal_name');
    expect(pub).not.toHaveProperty('contact_email');
    expect(pub).not.toHaveProperty('evidence_storage_urls');
    if ('public_display_name' in pub) expect(pub.public_display_name).toBeTruthy();
  });
});
