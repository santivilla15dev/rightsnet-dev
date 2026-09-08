import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { assertOpsWriteAccess } from '../apps/api/src/common/auth.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import {
  confirmExternalAgreement,
  createExternalAgreement,
} from '../apps/api/src/modules/external-agreements.js';
import { DomainError } from '../packages/domain/src/index.js';

describe('Org-member L3 writes (owner confirm)', () => {
  let admin: Actor;
  let owner: Actor;
  let employee: Actor;
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

    const users = (await pool.query('SELECT * FROM users')).rows;
    admin = users.find((u) => u.id === demoIds.admin);
    owner = users.find((u) => u.id === demoIds.buyer);
    assetId = (
      await pool.query(
        `SELECT a.id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE c.user_id=$1 LIMIT 1`,
        [demoIds.creator],
      )
    ).rows[0].id;

    const empId = randomUUID();
    await pool.query(
      "INSERT INTO users(id,email,display_name,role) VALUES($1,$2,'Emp Write','buyer')",
      [empId, empId + '@example.test'],
    );
    await pool.query('INSERT INTO organization_members VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [
      demoIds.org,
      empId,
      'employee',
    ]);
    employee = (await pool.query('SELECT * FROM users WHERE id=$1', [empId])).rows[0];
  });

  afterAll(() => pool.end());

  it('owner can write; employee forbidden; outsider 404', async () => {
    await expect(assertOpsWriteAccess(admin, demoIds.org)).resolves.toMatchObject({
      access: 'admin',
    });
    await expect(assertOpsWriteAccess(owner, demoIds.org)).resolves.toMatchObject({
      access: 'owner',
    });
    await expect(assertOpsWriteAccess(employee, demoIds.org)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(assertOpsWriteAccess(owner, demoIds.otherOrg)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('owner can create + confirm agreement for own org', async () => {
    const created = await transaction((db) =>
      createExternalAgreement(db, owner, {
        organization_id: demoIds.org,
        asset_id: assetId,
        title: 'Owner deal ' + randomUUID().slice(0, 8),
        status: 'pending_confirm',
        proposed_rights: {
          rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
          industry: ['beauty'],
          territories: ['DE'],
          approval: {},
          valid_from: '2026-01-01T00:00:00.000Z',
          valid_until: '2027-01-01T00:00:00.000Z',
        },
      }),
    );
    await assertOpsWriteAccess(owner, created.organization_id);
    const confirmed = await transaction((db) => confirmExternalAgreement(db, owner, created.id));
    expect(confirmed.grant.status).toBe('ACTIVE');
  });
});
