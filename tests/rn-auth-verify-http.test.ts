import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { mintRnAuthToken } from '../apps/api/src/modules/generation-auth.js';
import { platformVerifyAuth } from '../apps/api/src/modules/platform.js';

describe('RN-AUTH platform verify-auth', () => {
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

    grantId = '60000000-0000-4000-8000-000000000092';
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
        '60000000-0000-4000-8000-000000000093',
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

  it('valid token → valid true and does not consume', async () => {
    const token = await mintRnAuthToken({
      grantId,
      organizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      provider: 'higgsfield',
      use: {
        content_type: 'synthetic_video',
        purpose: 'commercial_advertising',
        territory: 'DE',
      },
      grantValidUntil: '2027-12-31T23:59:59.000Z',
      now: new Date('2026-06-15T12:00:00.000Z'),
    });

    const res = await platformVerifyAuth(
      { auth_token: token },
      new Date('2026-06-15T12:30:00.000Z'),
    );
    expect(res.valid).toBe(true);
    expect(res.status).toBe('ISSUED');
    expect(res.payload?.auth_id).toBe(token.payload.auth_id);

    const again = await platformVerifyAuth(
      { auth_token: token },
      new Date('2026-06-15T12:31:00.000Z'),
    );
    expect(again.valid).toBe(true);

    const st = (
      await pool.query(`SELECT status FROM generation_auths WHERE id=$1`, [token.payload.auth_id])
    ).rows[0].status;
    expect(st).toBe('ISSUED');
  });

  it('bad signature → valid false', async () => {
    const token = await mintRnAuthToken({
      grantId,
      organizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      provider: 'higgsfield',
      use: {
        content_type: 'synthetic_video',
        purpose: 'commercial_advertising',
        territory: 'DE',
      },
      grantValidUntil: '2027-12-31T23:59:59.000Z',
      now: new Date('2026-06-16T12:00:00.000Z'),
    });
    const tampered = { ...token, signature: 'AAAA' };
    const res = await platformVerifyAuth(
      { auth_token: tampered },
      new Date('2026-06-16T12:10:00.000Z'),
    );
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('BAD_SIGNATURE');
    expect(res.payload).toBeNull();
  });

  it('expired → valid false', async () => {
    const token = await mintRnAuthToken({
      grantId,
      organizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      provider: 'higgsfield',
      use: {
        content_type: 'synthetic_video',
        purpose: 'commercial_advertising',
        territory: 'DE',
      },
      grantValidUntil: '2027-12-31T23:59:59.000Z',
      now: new Date('2026-06-17T12:00:00.000Z'),
    });
    const res = await platformVerifyAuth(
      { auth_token: token },
      new Date('2026-06-17T14:00:01.000Z'),
    );
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('EXPIRED');
  });
});
