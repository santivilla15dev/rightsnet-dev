/**
 * R1 smoke: new sandbox creator with location "Berlin, DE" → Connect account country.
 * Uses live Stripe test keys from .env. Does not print secrets or Account Link URLs.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pool, transaction } from '../packages/db/index.js';
import { createCreator } from '../apps/api/src/modules/marketplace.js';
import { ensureConnectAccount, resolveConnectCountry } from '../apps/api/src/modules/stripe-connect.js';
import { stripeConnectPort } from '../apps/api/src/integrations/stripe.js';
import { defaultPolicy } from '../packages/domain/src/index.js';

async function main() {
  const email = `r1-de-${randomUUID().slice(0, 8)}@example.com`;
  const userId = randomUUID();
  await pool.query(
    `INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,'creator')`,
    [userId, email, 'R1 Berlin Creator'],
  );
  const user = (await pool.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0];
  await transaction((db) =>
    createCreator(db, user, {
      display_name: 'R1 Berlin Creator',
      bio: 'Perfil de ensayo Connect país DE.',
      location: 'Berlin, DE',
      languages: ['de'],
      gender: 'unspecified',
      age_band: '25_34',
      policy: defaultPolicy,
    }),
  );
  const creator = (
    await pool.query('SELECT id, location FROM creators WHERE user_id=$1', [userId])
  ).rows[0];
  const resolved = resolveConnectCountry(creator.location);
  console.log('resolved_country', resolved);
  const account = await ensureConnectAccount(user);
  const retrieved = await stripeConnectPort().retrieveAccount(account.id);
  const identityCountry =
    (retrieved as { identity?: { country?: string } }).identity?.country ??
    (retrieved as { country?: string }).country ??
    null;
  const out = {
    creator_id: creator.id,
    location: creator.location,
    resolved_connect_country: resolved,
    stripe_account_id_prefix: String(account.id).slice(0, 14) + '…',
    stripe_identity_country: identityCountry,
    pass: String(identityCountry || '').toLowerCase() === 'de',
    created_at: new Date().toISOString(),
  };
  writeFileSync('work/r1-connect-country.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  if (!out.pass) process.exit(2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
