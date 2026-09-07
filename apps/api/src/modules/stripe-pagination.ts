import { randomUUID } from 'node:crypto';
import { pool } from '../../../../packages/db/index.js';

/** Resume bounded newest-first scans without moving the completed watermark past unseen pages. */
export async function scanStripePages<T extends { id: string; created: number }>(options: {
  environment: string;
  accountRef: string;
  kind: 'events' | 'balance_transactions';
  maxPages: number;
  initialSince?: number;
  fetch: (params: {
    starting_after?: string;
    created?: { gte: number };
    limit: number;
  }) => Promise<{ data: T[]; has_more: boolean }>;
  consume: (item: T) => Promise<void>;
}) {
  const { environment, accountRef, kind } = options;
  const lock = await pool.connect();
  const lockKey = `stripe-scan:${environment}:${accountRef}:${kind}`;
  try {
    // Admin and worker can request the same scan concurrently. Only one owns its cursor.
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [lockKey]);
    const cursor = (
      await lock.query(
        'SELECT * FROM reconciliation_cursors WHERE environment=$1 AND account_ref=$2 AND kind=$3',
        [environment, accountRef, kind],
      )
    ).rows[0];
    let after: string | undefined = cursor?.scan_after ?? undefined;
    const since = after
      ? cursor.scan_since === null
        ? undefined
        : Number(cursor.scan_since)
      : cursor?.cursor_created_at
        ? Math.floor(new Date(cursor.cursor_created_at).getTime() / 1000) - 120
        : options.initialSince;
    let newestRef: string | null = cursor?.scan_newest_ref ?? cursor?.cursor_ref ?? null;
    let newestCreated: number | null =
      cursor?.scan_newest_created !== null && cursor?.scan_newest_created !== undefined
        ? Number(cursor.scan_newest_created)
        : cursor?.cursor_created_at
          ? Math.floor(new Date(cursor.cursor_created_at).getTime() / 1000)
          : null;
    for (let page = 0; page < options.maxPages; page++) {
      const result = await options.fetch({
        starting_after: after,
        limit: 100,
        created: since === undefined ? undefined : { gte: since },
      });
      if (!result.data.length && result.has_more) throw new Error('STRIPE_EMPTY_PAGE_WITH_MORE');
      for (const item of result.data) {
        await options.consume(item);
        if (newestCreated === null || item.created > newestCreated) {
          newestCreated = item.created;
          newestRef = item.id;
        }
      }
      const complete = !result.has_more;
      after = result.data.at(-1)?.id ?? after;
      await lock.query(
        `INSERT INTO reconciliation_cursors(id,environment,account_ref,kind,cursor_ref,cursor_created_at,
          scan_after,scan_since,scan_newest_ref,scan_newest_created)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(environment,account_ref,kind) DO UPDATE SET cursor_ref=EXCLUDED.cursor_ref,
          cursor_created_at=EXCLUDED.cursor_created_at,scan_after=EXCLUDED.scan_after,
          scan_since=EXCLUDED.scan_since,scan_newest_ref=EXCLUDED.scan_newest_ref,
          scan_newest_created=EXCLUDED.scan_newest_created,updated_at=now()`,
        [
          randomUUID(),
          environment,
          accountRef,
          kind,
          complete ? newestRef : (cursor?.cursor_ref ?? null),
          complete
            ? newestCreated === null
              ? null
              : new Date(newestCreated * 1000)
            : (cursor?.cursor_created_at ?? null),
          complete ? null : after,
          complete ? null : (since ?? null),
          complete ? null : newestRef,
          complete ? null : newestCreated,
        ],
      );
      if (complete) return { complete: true, newestRef };
    }
    return { complete: false, newestRef };
  } finally {
    try {
      await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey]);
    } finally {
      lock.release();
    }
  }
}
