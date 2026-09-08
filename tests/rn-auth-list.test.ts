import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import {
  listPlatformGenerationAuths,
  mintRnAuthToken,
  revokeRnAuthToken,
} from '../apps/api/src/modules/generation-auth.js';
import { transaction } from '../packages/db/index.js';

describe('RN-AUTH list generation-auths', () => {
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

    grantId = '60000000-0000-4000-8000-000000000096';
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
        '60000000-0000-4000-8000-000000000097',
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

  it('lists by org; filters status; never returns signature', async () => {
    const a = await mintRnAuthToken({
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
      now: new Date('2026-08-01T10:00:00.000Z'),
    });
    const b = await mintRnAuthToken({
      grantId,
      organizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      provider: 'higgsfield',
      use: {
        content_type: 'synthetic_video',
        purpose: 'commercial_advertising',
        territory: 'AT',
      },
      grantValidUntil: '2027-12-31T23:59:59.000Z',
      now: new Date('2026-08-01T11:00:00.000Z'),
    });
    await transaction((db) =>
      revokeRnAuthToken({ authId: b.payload.auth_id, organizationId: demoIds.org }, db),
    );

    const all = await listPlatformGenerationAuths({
      organization_id: demoIds.org,
      asset_id: demoIds.rightsCoreAsset,
      limit: 50,
    });
    const ids = all.items.map((i) => i.auth_id);
    expect(ids).toContain(a.payload.auth_id);
    expect(ids).toContain(b.payload.auth_id);
    for (const item of all.items) {
      expect(item).not.toHaveProperty('signature');
      expect(JSON.stringify(item)).not.toMatch(/signature/i);
    }

    const revoked = await listPlatformGenerationAuths({
      organization_id: demoIds.org,
      status: 'REVOKED',
      limit: 50,
    });
    expect(revoked.items.some((i) => i.auth_id === b.payload.auth_id)).toBe(true);
    expect(revoked.items.every((i) => i.status === 'REVOKED')).toBe(true);

    const other = await listPlatformGenerationAuths({
      organization_id: demoIds.otherOrg,
      limit: 20,
    });
    expect(other.items.every((i) => i.organization_id === demoIds.otherOrg)).toBe(true);
    expect(other.items.some((i) => i.auth_id === a.payload.auth_id)).toBe(false);
  });

  it('requires organization_id', async () => {
    await expect(listPlatformGenerationAuths({})).rejects.toThrow();
  });

  it('GET one by id; org mismatch 404; no signature', async () => {
    const { getPlatformGenerationAuth } = await import(
      '../apps/api/src/modules/generation-auth.js'
    );
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
      now: new Date('2026-08-02T10:00:00.000Z'),
    });
    const one = await getPlatformGenerationAuth(token.payload.auth_id, demoIds.org);
    expect(one.auth_id).toBe(token.payload.auth_id);
    expect(one.status).toBe('ISSUED');
    expect(one).not.toHaveProperty('signature');

    await expect(
      getPlatformGenerationAuth(token.payload.auth_id, demoIds.otherOrg),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
