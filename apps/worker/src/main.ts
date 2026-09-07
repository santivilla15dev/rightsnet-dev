import { assertConfiguration } from '../../api/src/common/config.js';
import { processPaymentEvents, issueLicenses } from '../../api/src/modules/payments.js';
import { processStripeRefunds } from '../../api/src/modules/stripe-refunds.js';
import { processExternalReconciliation } from '../../api/src/modules/stripe-reconciliation.js';
import { pool } from '../../../packages/db/index.js';
assertConfiguration();
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
  });
loop().finally(() => pool.end());
