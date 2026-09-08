import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { computeRnAuthExpiry, RN_AUTH_DEFAULT_TTL_MS } from '../packages/domain/src/index.js';
import { mintRnAuthToken, verifyRnAuthToken } from '../apps/api/src/modules/generation-auth.js';

describe('RN-AUTH mint + verify', () => {
  let grantId: string;

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

    grantId = '60000000-0000-4000-8000-000000000091';
    await pool.query(
      `INSERT INTO rights_grants(
         id, source_type, source_id, grantee_organization_id, asset_id, grantor_user_id,
         status, payload, valid_from, valid_until
       ) VALUES (
         $1, 'EXISTING_AGREEMENT', $2, $3, $4, $5, 'ACTIVE', $6::jsonb, $7, $8
       )
       ON CONFLICT (id) DO UPDATE SET status='ACTIVE'`,
      [
        grantId,
        '60000000-0000-4000-8000-000000000090',
        demoIds.org,
        demoIds.rightsCoreAsset,
        demoIds.rightsCoreCreatorUser,
        JSON.stringify({
          rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
          industry: ['beauty'],
          territories: ['DE'],
          approval: {},
        }),
        '2026-01-01T00:00:00.000Z',
        '2027-12-31T23:59:59.000Z',
      ],
    );
  });

  afterAll(() => pool.end());

  it('computeRnAuthExpiry caps at 1h and grant end', () => {
    const issued = new Date('2026-06-15T12:00:00.000Z');
    const far = computeRnAuthExpiry({
      issuedAt: issued,
      grantValidUntil: new Date('2027-01-01T00:00:00.000Z'),
    });
    expect(far.getTime() - issued.getTime()).toBe(RN_AUTH_DEFAULT_TTL_MS);

    const nearGrantEnd = computeRnAuthExpiry({
      issuedAt: issued,
      grantValidUntil: new Date('2026-06-15T12:30:00.000Z'),
    });
    expect(nearGrantEnd.toISOString()).toBe('2026-06-15T12:30:00.000Z');
  });

  it('mints verifiable token and persists ISSUED row', async () => {
    const token = await mintRnAuthToken({
      grantId,
      organizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      provider: 'higgsfield',
      use: {
        content_type: 'synthetic_video',
        purpose: 'commercial_advertising',
        territory: 'DE',
        industry: 'beauty',
      },
      grantValidUntil: '2027-12-31T23:59:59.000Z',
      now: new Date('2026-06-15T12:00:00.000Z'),
    });

    expect(token.payload.schema_version).toBe('rightsnet.rn-auth/0.1');
    expect(token.payload.organization_id).toBe(demoIds.org);
    expect(token.key_id).toBe(token.payload.key_id);

    const ok = await verifyRnAuthToken(token, pool, new Date('2026-06-15T12:30:00.000Z'));
    expect(ok).toEqual({ ok: true, payload: token.payload, status: 'ISSUED' });

    const row = (
      await pool.query('SELECT status FROM generation_auths WHERE id=$1', [token.payload.auth_id])
    ).rows[0];
    expect(row.status).toBe('ISSUED');
  });

  it('rejects expired and tampered tokens', async () => {
    const token = await mintRnAuthToken({
      grantId,
      organizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      provider: 'higgsfield',
      use: { content_type: 'synthetic_video', purpose: 'commercial_advertising', territory: 'DE' },
      grantValidUntil: '2027-12-31T23:59:59.000Z',
      now: new Date('2026-06-15T12:00:00.000Z'),
    });

    const expired = await verifyRnAuthToken(token, pool, new Date('2026-06-15T14:00:01.000Z'));
    expect(expired).toEqual({ ok: false, reason: 'EXPIRED' });

    const tampered = {
      ...token,
      payload: { ...token.payload, organization_id: demoIds.otherOrg },
    };
    const bad = await verifyRnAuthToken(tampered, pool, new Date('2026-06-15T12:30:00.000Z'));
    expect(bad).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects revoked ledger row', async () => {
    const token = await mintRnAuthToken({
      grantId,
      organizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      provider: 'higgsfield',
      use: { content_type: 'synthetic_video', purpose: 'commercial_advertising', territory: 'DE' },
      grantValidUntil: '2027-12-31T23:59:59.000Z',
      now: new Date('2026-06-16T12:00:00.000Z'),
    });
    await pool.query(`UPDATE generation_auths SET status='REVOKED' WHERE id=$1`, [
      token.payload.auth_id,
    ]);
    const revoked = await verifyRnAuthToken(token, pool, new Date('2026-06-16T12:30:00.000Z'));
    expect(revoked).toEqual({ ok: false, reason: 'REVOKED' });
  });
});
