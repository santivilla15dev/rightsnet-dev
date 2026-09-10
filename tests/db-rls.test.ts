import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { migrate, migrateConnectionString } from '../packages/db/migrate.js';
import { pool } from '../packages/db/index.js';

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test')) throw new Error('Tests require _test database');
  await migrate();
});

afterAll(async () => {
  await pool.end();
});

describe('DB RLS org pilot v0.1', () => {
  it('aísla organizations/campaigns por membership sin bypass', async () => {
    const migrateUrl = migrateConnectionString();
    const migratePool = new pg.Pool({ connectionString: migrateUrl, max: 1 });
    const appUrl = new URL(migrateUrl);
    appUrl.username = 'rightsnet_app';
    appUrl.password = '';
    const appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });

    const userA = randomUUID();
    const userB = randomUUID();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const campaignA = randomUUID();
    const campaignB = randomUUID();

    try {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query(
        `INSERT INTO users(id,email,display_name,role) VALUES
          ($1,$2,'RLS A','buyer'),
          ($3,$4,'RLS B','buyer')`,
        [userA, `rls-a-${userA}@example.com`, userB, `rls-b-${userB}@example.com`],
      );
      await migratePool.query(
        `INSERT INTO organizations(id,legal_name,country) VALUES
          ($1,'RLS Org A','AT'),
          ($2,'RLS Org B','AT')`,
        [orgA, orgB],
      );
      await migratePool.query(
        `INSERT INTO organization_members(organization_id,user_id,role) VALUES
          ($1,$2,'owner'),
          ($3,$4,'owner')`,
        [orgA, userA, orgB, userB],
      );
      await migratePool.query(
        `INSERT INTO campaigns(id,organization_id,name,creative_brief,created_by) VALUES
          ($1,$2,'Camp A','brief', $3),
          ($4,$5,'Camp B','brief', $6)`,
        [campaignA, orgA, userA, campaignB, orgB, userB],
      );

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userA]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);

        const orgs = await client.query('SELECT id FROM organizations ORDER BY legal_name');
        expect(orgs.rows.map((r) => r.id)).toEqual([orgA]);

        const camps = await client.query('SELECT id FROM campaigns ORDER BY name');
        expect(camps.rows.map((r) => r.id)).toEqual([campaignA]);

        const members = await client.query(
          'SELECT organization_id FROM organization_members ORDER BY organization_id',
        );
        expect(members.rows.map((r) => r.organization_id)).toEqual([orgA]);

        await client.query('ROLLBACK');

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', '', true)`);
        const none = await client.query('SELECT count(*)::int AS n FROM campaigns');
        expect(none.rows[0].n).toBe(0);
        await client.query('ROLLBACK');

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '1', true)`);
        const all = await client.query('SELECT count(*)::int AS n FROM campaigns WHERE id=ANY($1::uuid[])', [
          [campaignA, campaignB],
        ]);
        expect(all.rows[0].n).toBe(2);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query('DELETE FROM campaigns WHERE id=ANY($1::uuid[])', [[campaignA, campaignB]]);
      await migratePool.query('DELETE FROM organization_members WHERE organization_id=ANY($1::uuid[])', [
        [orgA, orgB],
      ]);
      await migratePool.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[orgA, orgB]]);
      await migratePool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[userA, userB]]);
      await appPool.end();
      await migratePool.end();
    }
  });
});
