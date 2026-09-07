import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://rightsnet@127.0.0.1:55432/rightsnet',
  max: 10,
});
export type DB = Pick<pg.PoolClient, 'query'>;
export async function transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function audit(
  db: DB,
  actor: string | null,
  action: string,
  id: string,
  details: unknown = {},
) {
  await db.query(
    'INSERT INTO audit_events(id,actor_id,action,resource_id,details) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), actor, action, id, JSON.stringify(details)],
  );
}
