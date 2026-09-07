import type { Request } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool, type DB } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { config } from './config.js';
import { resolveSupabaseActor } from '../integrations/supabase-auth.js';

export type Actor = { id: string; email: string; display_name: string; role: string };

export async function actor(req: Request): Promise<Actor> {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) throw new DomainError('UNAUTHENTICATED', 401, 'Inicia sesión para continuar.');
  if (config.auth === 'supabase') return resolveSupabaseActor(token);
  const user = (
    await pool.query(
      'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
      [createHash('sha256').update(token).digest('hex')],
    )
  ).rows[0];
  if (!user) throw new DomainError('UNAUTHENTICATED', 401, 'La sesión ha caducado.');
  return user;
}

export async function demoLogin(role: string) {
  if (config.env !== 'sandbox' || config.auth !== 'sandbox')
    throw new DomainError('SANDBOX_DISABLED', 404);
  const emails: Record<string, string> = {
    buyer: 'brand@example.test',
    creator: 'creator@example.test',
    admin: 'admin@example.test',
    viewer: 'viewer@example.test',
    other: 'other@example.test',
  };
  let user;
  if (role === 'new_creator') {
    const id = randomUUID();
    user = (
      await pool.query(
        "INSERT INTO users(id,email,display_name,role) VALUES($1,$2,'Nuevo creador','creator') RETURNING *",
        [id, id + '@example.test'],
      )
    ).rows[0];
  } else user = (await pool.query('SELECT * FROM users WHERE email=$1', [emails[role]])).rows[0];
  if (!user) throw new DomainError('UNKNOWN_PERSONA', 422);
  const token = randomBytes(32).toString('base64url');
  await pool.query("INSERT INTO sessions VALUES($1,$2,now()+interval '8 hours')", [
    createHash('sha256').update(token).digest('hex'),
    user.id,
  ]);
  return { token, user };
}

export async function member(db: DB, user: Actor, orgId: string, write = false) {
  const m = (
    await db.query('SELECT * FROM organization_members WHERE user_id=$1 AND organization_id=$2', [
      user.id,
      orgId,
    ])
  ).rows[0];
  if (!m) throw new DomainError('NOT_FOUND', 404);
  if (write && m.role === 'viewer') throw new DomainError('FORBIDDEN', 403);
  return m;
}

export function admin(user: Actor) {
  if (user.role !== 'admin') throw new DomainError('FORBIDDEN', 403);
}
