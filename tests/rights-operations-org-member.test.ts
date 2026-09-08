import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { assertOpsReadAccess } from '../apps/api/src/common/auth.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { DomainError } from '../packages/domain/src/index.js';
import {
  rightsOperationsCampaignQuery,
  rightsOperationsOverview,
} from '../apps/api/src/modules/rights-operations.js';

describe('Rights Operations org-member read access (L1)', () => {
  let adminUser: Actor;
  let ownerUser: Actor;
  let otherOwner: Actor;
  let outsider: Actor;
  let employeeUser: Actor;

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
    adminUser = users.find((u) => u.id === demoIds.admin);
    ownerUser = users.find((u) => u.id === demoIds.buyer);
    otherOwner = users.find((u) => u.id === demoIds.other);
    outsider = users.find((u) => u.id === demoIds.creator);

    const empId = randomUUID();
    await pool.query(
      "INSERT INTO users(id,email,display_name,role) VALUES($1,$2,'Empleado Ops','buyer')",
      [empId, empId + '@example.test'],
    );
    await pool.query('INSERT INTO organization_members VALUES($1,$2,$3)', [
      demoIds.org,
      empId,
      'employee',
    ]);
    employeeUser = (
      await pool.query('SELECT * FROM users WHERE id=$1', [empId])
    ).rows[0];
  });

  afterAll(() => pool.end());

  it('admin can read any org', async () => {
    await expect(assertOpsReadAccess(adminUser, demoIds.org)).resolves.toMatchObject({
      access: 'admin',
    });
    await expect(assertOpsReadAccess(adminUser, demoIds.otherOrg)).resolves.toMatchObject({
      access: 'admin',
    });
    const overview = await rightsOperationsOverview(demoIds.org);
    expect(overview.organization_id).toBe(demoIds.org);
  });

  it('owner can read own org; 404 for other org', async () => {
    await expect(assertOpsReadAccess(ownerUser, demoIds.org)).resolves.toMatchObject({
      access: 'member',
      role: 'owner',
    });
    try {
      await assertOpsReadAccess(ownerUser, demoIds.otherOrg);
      expect.unreachable('expected 404');
    } catch (e) {
      expect((e as DomainError).code).toBe('NOT_FOUND');
      expect((e as DomainError).status).toBe(404);
    }
  });

  it('employee can read own org', async () => {
    await expect(assertOpsReadAccess(employeeUser, demoIds.org)).resolves.toMatchObject({
      access: 'member',
      role: 'employee',
    });
  });

  it('outsider and other-org owner cannot read', async () => {
    await expect(assertOpsReadAccess(outsider, demoIds.org)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(assertOpsReadAccess(otherOwner, demoIds.org)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('buyer/viewer membership denied (404)', async () => {
    const viewerId = randomUUID();
    await pool.query(
      "INSERT INTO users(id,email,display_name,role) VALUES($1,$2,'Viewer','viewer')",
      [viewerId, viewerId + '@example.test'],
    );
    await pool.query('INSERT INTO organization_members VALUES($1,$2,$3)', [
      demoIds.org,
      viewerId,
      'viewer',
    ]);
    const viewer = (await pool.query('SELECT * FROM users WHERE id=$1', [viewerId])).rows[0];
    await expect(assertOpsReadAccess(viewer, demoIds.org)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('member-scoped campaign query still only returns that org', async () => {
    await assertOpsReadAccess(ownerUser, demoIds.org);
    const result = await rightsOperationsCampaignQuery({
      organization_id: demoIds.org,
      industry: 'beauty',
      territory: 'DE',
      window_start: '2026-10-01T00:00:00.000Z',
      window_end: '2026-10-31T23:59:59.000Z',
      content_type: 'synthetic_video',
      purpose: 'commercial_advertising',
    });
    expect(result.organization_id).toBe(demoIds.org);
  });
});
