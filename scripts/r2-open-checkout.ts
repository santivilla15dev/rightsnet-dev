/**
 * One-shot: create a payable Lucía order and a real Stripe Checkout URL (test).
 * Founder completes payment with card 4242… — does not auto-charge.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { pool, transaction } from '../packages/db/index.js';
import { demoIds } from '../packages/db/seed.js';
import {
  acceptOrder,
  createOrder,
  createQuote,
  createRequest,
  getOrder,
} from '../apps/api/src/modules/licensing.js';
import { stripeCheckout } from '../apps/api/src/modules/stripe-checkout.js';

const usage = {
  campaign_name: 'Reensayo R2 ' + new Date().toISOString().slice(0, 19),
  operation: 'synthetic_video' as const,
  purpose: 'commercial_advertising' as const,
  category: 'beauty' as const,
  territories: ['ES'] as ('ES' | 'DE')[],
  channels: ['instagram'] as ('instagram' | 'tiktok' | 'youtube' | 'web' | 'ooh' | 'tv')[],
  duration_days: 30,
  starts_at: new Date(Date.now() + 4 * 86400000).toISOString(),
  exclusivity: 'none' as const,
  sublicensing: false,
  training: false,
  voice_clone: false,
};

async function main() {
  const buyer = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.buyer])).rows[0];
  if (!buyer) throw new Error('demo buyer missing — run seed');
  const asset = (
    await pool.query(
      `SELECT a.id FROM assets a
       JOIN creators c ON c.id=a.creator_id
       WHERE c.display_name ILIKE '%Luc%' AND a.status='published'
       LIMIT 1`,
    )
  ).rows[0];
  if (!asset) throw new Error('published Lucía asset missing');

  const request = await transaction((db) =>
    createRequest(db, buyer, {
      organization_id: demoIds.org,
      asset_id: asset.id,
      usage,
    }),
  );
  console.log('request', request.id, request.decision);
  if (request.decision === 'DENY') {
    console.error('request denied', request.reason_codes);
    process.exit(2);
  }

  const quote = await transaction((db) => createQuote(db, buyer, { request_id: request.id }));
  const order = await transaction((db) => createOrder(db, buyer, { quote_id: quote.id }));
  await transaction((db) =>
    acceptOrder(db, buyer, order.id, { accepted: true, document_hash: order.contract_hash }),
  );
  const payable = await getOrder(pool, buyer, order.id, true);
  const checkout = await stripeCheckout(buyer, payable.id);

  const out = {
    order_id: payable.id,
    attempt_id: checkout.attempt_id,
    url: checkout.url,
    created_at: new Date().toISOString(),
  };
  writeFileSync('work/r2-checkout.json', JSON.stringify(out, null, 2));
  console.log('order_id', out.order_id);
  console.log('attempt_id', out.attempt_id);
  console.log('OPEN_URL', checkout.url);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
