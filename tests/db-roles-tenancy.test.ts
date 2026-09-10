import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
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

describe('DB roles / tenancy v0.1', () => {
  it('provisiona rightsnet_app y le niega CREATE TABLE', async () => {
    const migrateUrl = migrateConnectionString();
    const migratePool = new pg.Pool({ connectionString: migrateUrl, max: 1 });
    try {
      const role = await migratePool.query("SELECT 1 FROM pg_roles WHERE rolname='rightsnet_app'");
      expect(role.rowCount).toBe(1);

      const appUrl = new URL(migrateUrl);
      appUrl.username = 'rightsnet_app';
      appUrl.password = '';
      const appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });
      try {
        await expect(
          appPool.query('CREATE TABLE __rightsnet_app_should_fail(id int)'),
        ).rejects.toThrow(/permission denied|must be owner|InsufficientPrivilege/i);
        const readable = await appPool.query('SELECT 1 AS ok FROM schema_migrations LIMIT 1');
        expect(readable.rows[0].ok).toBe(1);
      } finally {
        await appPool.end();
      }
    } finally {
      await migratePool.end();
    }
  });
});
