import { assertConfiguration } from '../../api/src/common/config.js';
import { processPaymentEvents, issueLicenses } from '../../api/src/modules/payments.js';
import { processStripeRefunds } from '../../api/src/modules/stripe-refunds.js';
import { processExternalReconciliation } from '../../api/src/modules/stripe-reconciliation.js';
import { pool } from '../../../packages/db/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

assertConfiguration();

const heartbeatPath = path.resolve(
  process.env.WORKER_HEARTBEAT_PATH ?? '.local/worker.heartbeat',
);
function touchHeartbeat() {
  try {
    mkdirSync(path.dirname(heartbeatPath), { recursive: true, mode: 0o700 });
    writeFileSync(heartbeatPath, new Date().toISOString() + '\n', { mode: 0o600 });
  } catch {
    /* non-fatal */
  }
}
touchHeartbeat();
const heartbeatTimer = setInterval(touchHeartbeat, 2000);

let stopped = false;
async function loop() {
  while (!stopped) {
    try {
      await processPaymentEvents();
      await processStripeRefunds();
      await issueLicenses();
      // External Stripe reconciliation is periodic and separate from ledger balance checks.
      await processExternalReconciliation();
    } catch (e) {
      console.error('Worker cycle failed', e instanceof Error ? e.message : 'unknown');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
for (const sig of ['SIGTERM', 'SIGINT'])
  process.on(sig, () => {
    stopped = true;
    clearInterval(heartbeatTimer);
  });
loop().finally(() => {
  clearInterval(heartbeatTimer);
  pool.end();
});
