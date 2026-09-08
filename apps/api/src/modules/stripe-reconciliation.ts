import { randomUUID } from 'node:crypto';
import { scanStripePages } from './stripe-pagination.js';
import { audit, pool } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { config } from '../common/config.js';
import {
  assertLiveCommerceAllowed,
  stripeEnvironment,
  stripeReconciliationPort,
  type StripeBalanceTransaction,
} from '../integrations/stripe.js';
import { ingestStripeCheckoutEvent } from './stripe-events.js';
import { ingestConnectAccountEvent, isConnectAccountEvent } from './stripe-connect.js';
import { ingestStripeRefundEvent, isRefundEvent } from './stripe-refunds.js';
import { ingestMoneyMovementEvent, isMoneyMovementEvent } from './stripe-money.js';

const PLATFORM = 'platform';
const RECOVERABLE_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'refund.created',
  'refund.updated',
  'refund.failed',
  'transfer.created',
  'transfer.updated',
  'transfer.reversed',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'payout.created',
  'payout.updated',
  'payout.paid',
  'payout.failed',
  'payout.canceled',
];

type DiffInput = {
  runId: string;
  environment: string;
  accountRef: string;
  kind: string;
  severity?: 'info' | 'warning' | 'critical';
  providerRef?: string | null;
  localRef?: string | null;
  amountMinor?: number | null;
  detail: string;
};

async function insertDiff(d: DiffInput) {
  await pool.query(
    `INSERT INTO reconciliation_differences(
      id, run_id, environment, account_ref, kind, severity, provider_ref, local_ref,
      amount_minor, currency, detail
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'EUR',$10)`,
    [
      randomUUID(),
      d.runId,
      d.environment,
      d.accountRef,
      d.kind,
      d.severity ?? 'warning',
      d.providerRef ?? null,
      d.localRef ?? null,
      d.amountMinor ?? null,
      d.detail,
    ],
  );
}

async function loadCursor(environment: string, accountRef: string, kind: string) {
  return (
    await pool.query(
      `SELECT cursor_ref, cursor_created_at FROM reconciliation_cursors
       WHERE environment=$1 AND account_ref=$2 AND kind=$3`,
      [environment, accountRef, kind],
    )
  ).rows[0] as { cursor_ref: string | null; cursor_created_at: Date | null } | undefined;
}

async function upsertBalanceTx(
  environment: string,
  accountRef: string,
  tx: StripeBalanceTransaction,
) {
  if (tx.currency !== 'eur') {
    return { skipped: true as const, reason: 'non_eur' };
  }
  if (Boolean(tx.livemode) !== (environment === 'live')) {
    return { skipped: true as const, reason: 'environment_mismatch' };
  }
  const inserted = await pool.query(
    `INSERT INTO stripe_balance_transactions(
      id, provider_ref, environment, account_ref, type, amount_minor, fee_minor, net_minor,
      currency, source_ref, description, available_on, created_at_stripe
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'EUR',$9,$10,to_timestamp($11),to_timestamp($12))
    ON CONFLICT (provider_ref, account_ref, environment) DO UPDATE SET
      type=EXCLUDED.type,
      amount_minor=EXCLUDED.amount_minor,
      fee_minor=EXCLUDED.fee_minor,
      net_minor=EXCLUDED.net_minor,
      source_ref=EXCLUDED.source_ref,
      description=EXCLUDED.description,
      available_on=EXCLUDED.available_on
    RETURNING (xmax = 0) AS is_insert`,
    [
      randomUUID(),
      tx.id,
      environment,
      accountRef,
      tx.type,
      tx.amount,
      tx.fee,
      tx.net,
      tx.source,
      tx.description,
      tx.available_on,
      tx.created,
    ],
  );
  if (!inserted.rows[0]?.is_insert) {
    return { skipped: true as const, reason: 'duplicate' };
  }
  return { skipped: false as const };
}

/**
 * Import balance transactions with a forward watermark.
 *
 * Stripe lists newest-first: `starting_after` alone only walks OLDER history and
 * permanently misses charges created after the cursor. We therefore filter with
 * `created[gte]` (small overlap) and advance the cursor to the newest txn seen.
 */
export async function importBalanceTransactions(
  runId: string,
  accountRef = PLATFORM,
  options: { maxPages?: number } = {},
) {
  const environment = stripeEnvironment();
  const port = stripeReconciliationPort();
  let imported = 0;
  const stripeAccount = accountRef === PLATFORM ? undefined : accountRef;
  const scan = await scanStripePages({
    environment,
    accountRef,
    kind: 'balance_transactions',
    maxPages: options.maxPages ?? 20,
    fetch: (params) => port.listBalanceTransactions({ ...params, stripeAccount }),
    consume: async (tx) => {
      const saved = await upsertBalanceTx(environment, accountRef, tx);
      if (saved.skipped && ['non_eur', 'environment_mismatch'].includes(saved.reason)) {
        await insertDiff({
          runId,
          environment,
          accountRef,
          kind: saved.reason === 'non_eur' ? 'unsupported_currency' : 'environment_mismatch',
          severity: 'critical',
          providerRef: tx.id,
          amountMinor: tx.amount,
          detail: `Balance transaction ${tx.id} incompatible con EUR/test.`,
        });
      } else if (!saved.skipped) imported++;
    },
  });
  if (!scan.complete)
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'import_incomplete',
      detail:
        'Quedan páginas pendientes; el siguiente ciclo continuará sin adelantar el watermark.',
    });
  return { imported, lastId: scan.newestRef, complete: scan.complete };
}

async function matchChargeLike(
  runId: string,
  environment: string,
  accountRef: string,
  row: {
    provider_ref: string;
    type: string;
    amount_minor: number;
    fee_minor: number;
    net_minor: number;
    source_ref: string | null;
  },
) {
  // Amount alone is never proof of identity: many licenses have the same fixed price.
  const attempt =
    accountRef === PLATFORM && row.source_ref
      ? (
          await pool.query(
            `SELECT a.id, a.order_id, a.payment_intent_ref, o.price
         FROM payment_attempts a JOIN orders o ON o.id=a.order_id
         WHERE a.provider='stripe' AND a.status='succeeded'
           AND (a.charge_ref=$1 OR a.payment_intent_ref=$1)
         LIMIT 1`,
            [row.source_ref],
          )
        ).rows[0]
      : null;
  if (!attempt) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'orphan_balance_transaction',
      severity: 'warning',
      providerRef: row.provider_ref,
      amountMinor: row.amount_minor,
      detail: `Cargo/pago Stripe ${row.provider_ref} sin intento local coincidente.`,
    });
    return;
  }

  const total = Number(attempt.price.total_minor);
  const fee = Number(attempt.price.fee_minor);
  if (total !== row.amount_minor) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'amount_mismatch',
      severity: 'critical',
      providerRef: row.provider_ref,
      localRef: attempt.order_id,
      amountMinor: row.amount_minor,
      detail: `Importe BT ${row.amount_minor} ≠ orden ${total}.`,
    });
  }
  // Net should equal total - stripe fee; platform fee is application_fee (separate BT).
  if (row.net_minor !== row.amount_minor - row.fee_minor) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'fee_net_inconsistency',
      severity: 'critical',
      providerRef: row.provider_ref,
      localRef: attempt.id,
      amountMinor: row.fee_minor,
      detail: `fee+net inconsistente en ${row.provider_ref}.`,
    });
  }
  const journal = (
    await pool.query(`SELECT id FROM journals WHERE order_id=$1 AND kind='payment'`, [
      attempt.order_id,
    ])
  ).rows[0];
  if (!journal) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'missing_journal',
      severity: 'critical',
      providerRef: row.provider_ref,
      localRef: attempt.order_id,
      amountMinor: total,
      detail: `Pago Stripe sin journal local payment.`,
    });
  }
  // Platform application fee expectation is informational when BT fee is only Stripe's processing fee.
  if (fee > 0 && row.fee_minor === 0) {
    // Destination charge: Stripe fee on charge BT; application fee is separate — OK.
  }
}

async function matchRefundLike(
  runId: string,
  environment: string,
  accountRef: string,
  row: {
    provider_ref: string;
    amount_minor: number;
    source_ref: string | null;
  },
) {
  const abs = Math.abs(row.amount_minor);
  const refund = (
    await pool.query(
      `SELECT id, order_id, amount_minor, provider_ref FROM refunds
       WHERE status IN ('succeeded','pending','requested')
         AND provider_ref=$1
         AND $2='platform'
       LIMIT 1`,
      [row.source_ref, accountRef],
    )
  ).rows[0];
  if (!refund) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'orphan_refund_bt',
      severity: 'warning',
      providerRef: row.provider_ref,
      amountMinor: abs,
      detail: `Refund BT sin fila local en refunds.`,
    });
    return;
  }
  if (Number(refund.amount_minor) !== abs) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'refund_amount_mismatch',
      severity: 'critical',
      providerRef: row.provider_ref,
      localRef: refund.id,
      amountMinor: abs,
      detail: `Refund BT ${abs} ≠ local ${refund.amount_minor}.`,
    });
  }
}

async function matchTransferLike(
  runId: string,
  environment: string,
  accountRef: string,
  row: { provider_ref: string; amount_minor: number; source_ref: string | null; type: string },
) {
  const abs = Math.abs(row.amount_minor);
  const transfer = (
    await pool.query(
      `SELECT id, order_id, amount_minor FROM stripe_transfers
       WHERE provider_ref=$1 OR provider_ref=$2 LIMIT 1`,
      [row.provider_ref, row.source_ref],
    )
  ).rows[0];
  if (!transfer && row.type === 'transfer') {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'orphan_transfer_bt',
      severity: 'warning',
      providerRef: row.provider_ref,
      amountMinor: abs,
      detail: `Transfer BT sin stripe_transfers local.`,
    });
    return;
  }
  if (transfer && Number(transfer.amount_minor) !== abs) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'transfer_amount_mismatch',
      severity: 'critical',
      providerRef: row.provider_ref,
      localRef: transfer.id,
      amountMinor: abs,
      detail: `Transfer BT ${abs} ≠ local ${transfer.amount_minor}.`,
    });
  }
}

async function matchPayoutLike(
  runId: string,
  environment: string,
  accountRef: string,
  row: { provider_ref: string; amount_minor: number; source_ref: string | null },
) {
  const abs = Math.abs(row.amount_minor);
  const payout = (
    await pool.query(
      `SELECT id, amount_minor FROM payout_records
       WHERE provider_payout_id=$1 OR provider_payout_id=$2 LIMIT 1`,
      [row.provider_ref, row.source_ref],
    )
  ).rows[0];
  if (!payout) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'orphan_payout_bt',
      severity: 'warning',
      providerRef: row.provider_ref,
      amountMinor: abs,
      detail: `Payout BT sin payout_records (nunca se vincula a order_id).`,
    });
    return;
  }
  if (Number(payout.amount_minor) !== abs) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'payout_amount_mismatch',
      severity: 'critical',
      providerRef: row.provider_ref,
      localRef: payout.id,
      amountMinor: abs,
      detail: `Payout BT ${abs} ≠ local ${payout.amount_minor}.`,
    });
  }
}

/** Compare imported BTs against local money tables (forward match). */
export async function compareExternalLedger(runId: string, accountRef = PLATFORM) {
  const environment = stripeEnvironment();
  const rows = (
    await pool.query(
      `SELECT provider_ref, type, amount_minor, fee_minor, net_minor, source_ref
       FROM stripe_balance_transactions
       WHERE environment=$1 AND account_ref=$2
       ORDER BY created_at_stripe DESC
       LIMIT 500`,
      [environment, accountRef],
    )
  ).rows as Array<{
    provider_ref: string;
    type: string;
    amount_minor: number;
    fee_minor: number;
    net_minor: number;
    source_ref: string | null;
  }>;

  for (const row of rows) {
    if (['charge', 'payment'].includes(row.type)) {
      await matchChargeLike(runId, environment, accountRef, row);
    } else if (['refund', 'payment_refund'].includes(row.type)) {
      await matchRefundLike(runId, environment, accountRef, row);
    } else if (['transfer', 'transfer_refund'].includes(row.type)) {
      await matchTransferLike(runId, environment, accountRef, row);
    } else if (row.type === 'payout') {
      await matchPayoutLike(runId, environment, accountRef, row);
    }
    // application_fee / stripe_fee / adjustment: retained as imported facts; no forced local journal.
  }
}

/**
 * Reverse scan: local Stripe succeeded payments without a charge/payment BT.
 * Scoped by `since` so historical sandbox fixtures do not flood the queue.
 */
export async function scanMissingBalanceTransactions(
  runId: string,
  accountRef: string,
  since: Date,
) {
  const environment = stripeEnvironment();
  if (accountRef !== PLATFORM) return 0;
  const orphans = (
    await pool.query(
      `SELECT a.id, a.order_id, a.payment_intent_ref, (o.price->>'total_minor')::int AS total_minor
       FROM payment_attempts a
       JOIN orders o ON o.id=a.order_id
       WHERE a.provider='stripe' AND a.status='succeeded'
         AND a.created_at >= $3
         AND NOT EXISTS (
           SELECT 1 FROM stripe_balance_transactions bt
           WHERE bt.environment=$1 AND bt.account_ref=$2
             AND bt.type IN ('charge','payment')
             AND (bt.source_ref=a.charge_ref OR bt.source_ref=a.payment_intent_ref)
         )
       LIMIT 100`,
      [environment, accountRef, since.toISOString()],
    )
  ).rows;

  for (const o of orphans) {
    await insertDiff({
      runId,
      environment,
      accountRef,
      kind: 'missing_balance_transaction',
      severity: 'warning',
      localRef: o.order_id,
      providerRef: o.payment_intent_ref,
      amountMinor: o.total_minor,
      detail: `Pago local succeeded sin balance transaction charge/payment importada.`,
    });
  }
  return orphans.length;
}

/** Recover missed webhooks by listing Events API and re-ingesting idempotently. */
export async function recoverMissedEvents(runId: string, options: { maxPages?: number } = {}) {
  const environment = stripeEnvironment();
  const port = stripeReconciliationPort();
  let recovered = 0;
  const scan = await scanStripePages({
    environment,
    accountRef: PLATFORM,
    kind: 'events',
    maxPages: options.maxPages ?? 10,
    initialSince: Math.floor(Date.now() / 1000) - 7 * 86400,
    fetch: (params) => port.listEvents({ ...params, types: RECOVERABLE_TYPES }),
    consume: async (event) => {
      assertLiveCommerceAllowed(Boolean(event.livemode));
      if (
        (
          await pool.query(
            "SELECT 1 FROM provider_events WHERE provider='stripe' AND event_id=$1",
            [event.id],
          )
        ).rowCount
      )
        return;
      try {
        await ingestStripeCheckoutEvent(event);
        if (isConnectAccountEvent(event)) await ingestConnectAccountEvent(event);
        if (isRefundEvent(event)) await ingestStripeRefundEvent(event);
        if (isMoneyMovementEvent(event)) await ingestMoneyMovementEvent(event);
        recovered++;
      } catch (error) {
        await insertDiff({
          runId,
          environment,
          accountRef: PLATFORM,
          kind: 'event_recovery_failed',
          providerRef: event.id,
          detail: `No se pudo reingestar ${event.type}: ${error instanceof DomainError ? error.code : 'unknown'}`,
        });
        // Keep the page pending: retryable failures must not fall behind the watermark.
        throw error;
      }
    },
  });
  if (!scan.complete)
    await insertDiff({
      runId,
      environment,
      accountRef: PLATFORM,
      kind: 'event_recovery_incomplete',
      detail: 'Recuperación paginada pendiente; el próximo ciclo retomará la página restante.',
    });
  return { recovered, complete: scan.complete };
}

/**
 * Full external reconciliation run. Must NOT be invoked from the internal ledger
 * balance GET — that check stays double-entry only.
 */
export async function runExternalReconciliation(
  options: {
    accountRef?: string;
    recoverEvents?: boolean;
    checkMissingSince?: Date | null;
    actorId?: string | null;
  } = {},
) {
  if (config.payments !== 'stripe') {
    throw new DomainError(
      'STRIPE_NOT_CONFIGURED',
      503,
      'La conciliación externa solo aplica con PAYMENTS_PROVIDER=stripe.',
    );
  }
  const environment = stripeEnvironment();
  // Live keys need LIVE_COMMERCE_ENABLED; production APP_ENV stays blocked at boot.
  assertLiveCommerceAllowed(environment === 'live');

  const accountRef = options.accountRef ?? PLATFORM;
  const runId = randomUUID();
  await pool.query(
    `INSERT INTO reconciliation_runs(id, environment, account_ref, status)
     VALUES($1,$2,$3,'running')`,
    [runId, environment, accountRef],
  );

  try {
    const priorCursor = await loadCursor(environment, accountRef, 'balance_transactions');
    const { imported } = await importBalanceTransactions(runId, accountRef);
    await compareExternalLedger(runId, accountRef);

    // Reverse scan: since prior cursor (or explicit since). Avoids flooding from old sandbox rows.
    const missingSince =
      options.checkMissingSince === null
        ? null
        : (options.checkMissingSince ??
          priorCursor?.cursor_created_at ??
          new Date(Date.now() - 15 * 60 * 1000));
    if (missingSince) {
      await scanMissingBalanceTransactions(runId, accountRef, missingSince);
    }

    let recovered = 0;
    if (options.recoverEvents !== false && accountRef === PLATFORM) {
      recovered = (await recoverMissedEvents(runId)).recovered;
    }
    const diffs = (
      await pool.query(
        `SELECT count(*)::int AS n FROM reconciliation_differences WHERE run_id=$1 AND status='open'`,
        [runId],
      )
    ).rows[0].n as number;

    await pool.query(
      `UPDATE reconciliation_runs SET status='done', imported_count=$2, difference_count=$3,
       recovered_events=$4, finished_at=now() WHERE id=$1`,
      [runId, imported, diffs, recovered],
    );

    if (diffs > 0) {
      await audit(pool, options.actorId ?? null, 'reconciliation.differences', runId, {
        account_ref: accountRef,
        difference_count: diffs,
        imported,
        recovered,
      });
    }

    return {
      run_id: runId,
      environment,
      account_ref: accountRef,
      imported_count: imported,
      difference_count: diffs,
      recovered_events: recovered,
      status: 'done' as const,
    };
  } catch (error) {
    await pool.query(
      `UPDATE reconciliation_runs SET status='failed', error=$2, finished_at=now() WHERE id=$1`,
      [runId, error instanceof Error ? error.message : 'unknown'],
    );
    throw error;
  }
}

/** Worker-safe: skip if a run finished recently; never throws out of loop. */
export async function processExternalReconciliation() {
  if (config.payments !== 'stripe') return { skipped: true as const };
  const recent = (
    await pool.query(
      `SELECT 1 FROM reconciliation_runs
       WHERE status IN ('running','done') AND started_at > now() - interval '5 minutes'
       LIMIT 1`,
    )
  ).rowCount;
  if (recent) return { skipped: true as const };
  return runExternalReconciliation({ recoverEvents: true });
}

export async function listExternalReconciliation() {
  const [runs, diffs, cursors, balanceCount] = await Promise.all([
    pool.query(
      `SELECT id, environment, account_ref, status, imported_count, difference_count,
              recovered_events, error, started_at, finished_at
       FROM reconciliation_runs ORDER BY started_at DESC LIMIT 20`,
    ),
    pool.query(
      `SELECT id, run_id, kind, severity, provider_ref, local_ref, amount_minor, detail, status, created_at
       FROM reconciliation_differences WHERE status='open'
       ORDER BY created_at DESC LIMIT 100`,
    ),
    pool.query(
      `SELECT environment, account_ref, kind, cursor_ref, cursor_created_at, updated_at
       FROM reconciliation_cursors ORDER BY updated_at DESC`,
    ),
    pool.query(`SELECT count(*)::int AS n FROM stripe_balance_transactions`),
  ]);
  return {
    balance_transactions_imported: balanceCount.rows[0].n as number,
    cursors: cursors.rows,
    recent_runs: runs.rows,
    open_differences: diffs.rows,
  };
}

export async function acknowledgeDifference(actor: Actor, id: string, note: string) {
  const row = (
    await pool.query(
      `UPDATE reconciliation_differences
       SET status='acknowledged', acknowledged_at=now(), acknowledged_by=$2
       WHERE id=$1 AND status='open'
       RETURNING id, kind, provider_ref`,
      [id, actor.id],
    )
  ).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404);
  await audit(pool, actor.id, 'reconciliation.difference_acknowledged', id, {
    kind: row.kind,
    note,
  });
  return { id, status: 'acknowledged' as const };
}
