import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { createExternalAgreement } from '../apps/api/src/modules/external-agreements.js';
import { bulkConfirmExternalAgreements } from '../apps/api/src/modules/external-agreement-bulk-confirm.js';

const proposed = {
  rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
  industry: ['beauty'],
  territories: ['DE'],
  approval: {},
  valid_from: '2026-01-01T00:00:00.000Z',
  valid_until: '2027-01-01T00:00:00.000Z',
};

describe('Existing Deal bulk confirm', () => {
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

  async function makePending(title: string) {
    return transaction((db) =>
      createExternalAgreement(db, admin, {
        organization_id: demoIds.org,
        asset_id: assetId,
        title,
        status: 'pending_confirm',
        proposed_rights: proposed,
      }),
    );
  }

  it('confirms several pending → RightsGrant ACTIVE', async () => {
    const a = await makePending('BulkConfirm A ' + randomUUID().slice(0, 6));
    const b = await makePending('BulkConfirm B ' + randomUUID().slice(0, 6));

    const result = await transaction((db) =>
      bulkConfirmExternalAgreements(db, admin, {
        organization_id: demoIds.org,
        agreement_ids: [a.id, b.id],
      }),
    );

    expect(result.confirmed).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.total).toBe(2);
    for (const c of result.confirmed) {
      expect(c.grant_status).toBe('ACTIVE');
      expect(c.idempotent).toBe(false);
    }
  });

  it('partial success: bad id + org mismatch + idempotent reconfirm', async () => {
    const ok = await makePending('BulkConfirm OK ' + randomUUID().slice(0, 6));
    const first = await transaction((db) =>
      bulkConfirmExternalAgreements(db, admin, {
        organization_id: demoIds.org,
        agreement_ids: [ok.id],
      }),
    );
    expect(first.confirmed).toHaveLength(1);

    const otherOrgPending = await transaction((db) =>
      createExternalAgreement(db, admin, {
        organization_id: demoIds.otherOrg,
        asset_id: assetId,
        title: 'Wrong org ' + randomUUID().slice(0, 6),
        status: 'pending_confirm',
        proposed_rights: proposed,
      }),
    );

    const missing = randomUUID();
    const result = await transaction((db) =>
      bulkConfirmExternalAgreements(db, admin, {
        organization_id: demoIds.org,
        agreement_ids: [ok.id, missing, otherOrgPending.id],
      }),
    );

    expect(result.confirmed).toHaveLength(1);
    expect(result.confirmed[0].idempotent).toBe(true);
    expect(result.errors.length).toBe(2);
    expect(result.errors.some((e) => e.id === missing)).toBe(true);
    expect(result.errors.some((e) => e.id === otherOrgPending.id)).toBe(true);
  });

  it('rejects empty agreement_ids', async () => {
    await expect(
      transaction((db) =>
        bulkConfirmExternalAgreements(db, admin, {
          organization_id: demoIds.org,
          agreement_ids: [],
        }),
      ),
    ).rejects.toThrow();
  });
});
