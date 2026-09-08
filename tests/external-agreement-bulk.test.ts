import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import {
  bulkCreateExternalAgreementsFromCsv,
  parseCsv,
  rowToCreateBody,
} from '../apps/api/src/modules/external-agreement-bulk.js';

describe('Existing Deal bulk CSV', () => {
  let admin: Actor;
  let assetId: string;

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
    admin = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.admin])).rows[0];
    assetId = demoIds.rightsCoreAsset;
  });

  afterAll(() => pool.end());

  it('parseCsv handles quotes and pipes', () => {
    const rows = parseCsv('a,b\n"x,y",z\n');
    expect(rows[0]).toEqual(['a', 'b']);
    expect(rows[1]).toEqual(['x,y', 'z']);
  });

  it('rowToCreateBody builds proposed_rights', () => {
    const headers = [
      'organization_id',
      'asset_id',
      'title',
      'territories',
      'industry',
      'rights',
      'valid_from',
      'valid_until',
      'external_ref',
    ];
    const body = rowToCreateBody(headers, [
      demoIds.org,
      assetId,
      'Bulk Nike DE',
      'DE|AT',
      'beauty',
      'synthetic_video:ALLOW|commercial_advertising:ALLOW',
      '2026-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
      'BULK-1',
    ]);
    expect(body.status).toBe('pending_confirm');
    expect(body.proposed_rights.territories).toEqual(['DE', 'AT']);
    expect(body.proposed_rights.rights.synthetic_video).toBe('ALLOW');
  });

  it('bulk creates pending_confirm only (no grants)', async () => {
    const csv = [
      'organization_id,asset_id,title,territories,industry,rights,valid_from,valid_until,external_ref',
      `${demoIds.org},${assetId},Bulk A,DE,beauty,synthetic_video:ALLOW,2026-01-01T00:00:00.000Z,2027-01-01T00:00:00.000Z,BA`,
      `${demoIds.org},${assetId},Bulk B,AT,beauty,synthetic_video:ALLOW|commercial_advertising:ALLOW,2026-01-01T00:00:00.000Z,2027-01-01T00:00:00.000Z,BB`,
      `${demoIds.org},not-a-uuid,Bad,DE,beauty,synthetic_video:ALLOW,2026-01-01T00:00:00.000Z,2027-01-01T00:00:00.000Z,BC`,
    ].join('\n');

    const result = await transaction((db) =>
      bulkCreateExternalAgreementsFromCsv(
        db,
        admin,
        { csv, organization_id: demoIds.org },
        { requireOrganizationId: demoIds.org },
      ),
    );

    expect(result.created).toHaveLength(2);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.total_rows).toBe(3);

    for (const c of result.created) {
      const grants = (
        await pool.query(
          "SELECT count(*)::int AS n FROM rights_grants WHERE source_type='EXISTING_AGREEMENT' AND source_id=$1",
          [c.id],
        )
      ).rows[0].n;
      expect(grants).toBe(0);
      const st = (
        await pool.query('SELECT status FROM external_agreements WHERE id=$1', [c.id])
      ).rows[0].status;
      expect(st).toBe('pending_confirm');
    }
  });
});
