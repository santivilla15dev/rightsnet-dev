import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { pool } from './index.js';

/** Migrator connection: DDL owner. Falls back to app DATABASE_URL for single-role local setups. */
export function migrateConnectionString() {
  return (
    process.env.MIGRATE_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://rightsnet@127.0.0.1:55432/rightsnet'
  );
}

export async function migrate() {
  const migrateUrl = migrateConnectionString();
  const appUrl =
    process.env.DATABASE_URL ?? 'postgresql://rightsnet@127.0.0.1:55432/rightsnet';
  const useSeparate = migrateUrl !== appUrl;
  const migratePool = useSeparate
    ? new pg.Pool({ connectionString: migrateUrl, max: 2 })
    : pool;

  try {
    await migratePool.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
    );
    for (const name of (await readdir(new URL('./migrations/', import.meta.url)))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const client = await migratePool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(918321)');
        if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) {
          await client.query('COMMIT');
          continue;
        }
        await client.query(await readFile(new URL('./migrations/' + name, import.meta.url), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
        await client.query('COMMIT');
        console.log('Applied', name);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  } finally {
    if (useSeparate) await migratePool.end();
  }
}

if (process.argv[1]?.endsWith('migrate.ts'))
  migrate()
    .then(async () => {
      await pool.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
