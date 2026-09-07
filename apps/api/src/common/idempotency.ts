import { transaction, type DB } from '../../../../packages/db/index.js';
import { hash, DomainError } from '../../../../packages/domain/src/index.js';
export async function mutate<T>(
  actorId: string,
  route: string,
  key: string | undefined,
  body: unknown,
  fn: (db: DB) => Promise<T>,
): Promise<T> {
  if (!key || key.length < 8 || key.length > 128)
    throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 422);
  const requestHash = hash(body);
  return transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [actorId + route + key]);
    const prior = (
      await db.query(
        'SELECT * FROM idempotency_records WHERE actor_id=$1 AND route=$2 AND key=$3',
        [actorId, route, key],
      )
    ).rows[0];
    if (prior) {
      if (prior.request_hash !== requestHash) throw new DomainError('IDEMPOTENCY_CONFLICT', 409);
      return prior.response;
    }
    const result = await fn(db);
    await db.query(
      'INSERT INTO idempotency_records(actor_id,route,key,request_hash,response) VALUES($1,$2,$3,$4,$5)',
      [actorId, route, key, requestHash, JSON.stringify(result)],
    );
    return result;
  });
}
