import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { DomainError } from '../packages/domain/src/index.js';
import {
  mintRnAuthToken,
  revokeRnAuthToken,
} from '../apps/api/src/modules/generation-auth.js';
import { platformRevokeAuth, platformVerifyAuth } from '../apps/api/src/modules/platform.js';

describe('RN-AUTH revoke', () => {
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

    grantId = '60000000-0000-4000-8000-000000000094';
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
        '60000000-0000-4000-8000-000000000095',
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

  async function mint() {
    return mintRnAuthToken({
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
      now: new Date('2026-07-01T12:00:00.000Z'),
    });
  }

  it('revokes ISSUED → verify fails; idempotent second revoke', async () => {
    const token = await mint();
    const first = await platformRevokeAuth({
      auth_id: token.payload.auth_id,
      organization_id: demoIds.org,
    });
    expect(first.status).toBe('REVOKED');
    expect(first.idempotent).toBe(false);

    const check = await platformVerifyAuth(
      { auth_token: token },
      new Date('2026-07-01T12:10:00.000Z'),
    );
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('REVOKED');

    const second = await platformRevokeAuth({
      auth_id: token.payload.auth_id,
      organization_id: demoIds.org,
    });
    expect(second.idempotent).toBe(true);
  });

  it('wrong org → NOT_FOUND', async () => {
    const token = await mint();
    await expect(
      platformRevokeAuth({
        auth_id: token.payload.auth_id,
        organization_id: demoIds.otherOrg,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('CONSUMED cannot revoke', async () => {
    const token = await mint();
    await pool.query(`UPDATE generation_auths SET status='CONSUMED' WHERE id=$1`, [
      token.payload.auth_id,
    ]);
    await expect(
      transaction((db) =>
        revokeRnAuthToken(
          { authId: token.payload.auth_id, organizationId: demoIds.org },
          db,
        ),
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      platformRevokeAuth({
        auth_id: token.payload.auth_id,
        organization_id: demoIds.org,
      }),
    ).rejects.toMatchObject({ code: 'AUTH_ALREADY_CONSUMED' });
  });
});
