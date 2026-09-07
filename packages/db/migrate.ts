import { readFile, readdir } from 'node:fs/promises';
import { pool, transaction } from './index.js';
export async function migrate() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
  );
  for (const name of (await readdir(new URL('./migrations/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(918321)');
      if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount)
        return;
      await db.query(await readFile(new URL('./migrations/' + name, import.meta.url), 'utf8'));
      await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      console.log('Applied', name);
    });
  }
}
if (process.argv[1]?.endsWith('migrate.ts'))
  migrate()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
