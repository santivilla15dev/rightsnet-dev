import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://rightsnet@127.0.0.1:55432/rightsnet',
  max: 10,
});

/** Session bypass so existing API/worker/tests keep working under FORCE RLS (v0.1). */
const defaultBypass = process.env.DB_RLS_BYPASS_DEFAULT !== 'false';
pool.on('connect', (client) => {
  if (!defaultBypass) return;
  void client.query(`SELECT set_config('app.rls_bypass', '1', false)`);
});

export type DB = Pick<pg.PoolClient, 'query'>;

export type RlsActor = { userId: string; isAdmin?: boolean };

/** Transaction-local bypass (service paths, migrate/seed helpers). */
export async function setRlsBypass(db: DB, on = true) {
  await db.query(`SELECT set_config('app.rls_bypass', $1, true)`, [on ? '1' : '0']);
}

/** Transaction-local actor context; clears bypass so policies apply. */
export async function setRlsActor(db: DB, actor: RlsActor) {
  await db.query(`SELECT set_config('app.rls_bypass', '0', true)`);
  await db.query(`SELECT set_config('app.current_user_id', $1, true)`, [actor.userId]);
  await db.query(`SELECT set_config('app.is_admin', $1, true)`, [actor.isAdmin ? '1' : '0']);
}

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

/** Run work inside a transaction with RLS actor or explicit bypass. */
export async function withRlsActor<T>(
  actor: RlsActor | 'bypass',
  fn: (db: DB) => Promise<T>,
): Promise<T> {
  return transaction(async (db) => {
    if (actor === 'bypass') await setRlsBypass(db, true);
    else await setRlsActor(db, actor);
    return fn(db);
  });
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
