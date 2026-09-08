import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { pool, audit, type DB } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { config } from '../common/config.js';
import { identityKyc, identityProvider, assertIdentityLivemodeAllowed } from '../integrations/identity-kyc.js';
import { ownedAsset } from './marketplace.js';

function mapStripeStatus(
  status: string,
): 'pending' | 'processing' | 'verified' | 'requires_input' | 'rejected' | 'canceled' {
  if (status === 'verified') return 'verified';
  if (status === 'processing') return 'processing';
  if (status === 'requires_input') return 'requires_input';
  if (status === 'canceled') return 'canceled';
  return 'pending';
}

export async function startIdentitySession(db: DB, user: Actor, assetId: string) {
  const a = await ownedAsset(db, assetId, user);
  const provider = identityProvider();
  const returnUrl = `${config.webUrl.replace(/\/$/, '')}/dashboard?identity=return`;
  const session = await identityKyc().createVerificationSession({
    creatorId: a.creator_id,
    userId: user.id,
    assetId,
    returnUrl,
  });

  const checkStatus = session.status === 'verified' ? 'verified' : 'pending';
  await db.query(
    `INSERT INTO identity_checks(id,creator_id,provider,provider_ref,status,adult_verified,verified_at)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (provider, provider_ref) DO UPDATE SET
       status=EXCLUDED.status,
       adult_verified=COALESCE(EXCLUDED.adult_verified, identity_checks.adult_verified),
       verified_at=COALESCE(EXCLUDED.verified_at, identity_checks.verified_at),
       updated_at=now()`,
    [
      randomUUID(),
      a.creator_id,
      session.provider,
      session.provider_ref,
      checkStatus,
      checkStatus === 'verified' ? true : null,
      checkStatus === 'verified' ? new Date().toISOString() : null,
    ],
  );

  if (checkStatus === 'verified' && provider === 'sandbox') {
    const keepAccount =
      typeof a.connected_account === 'string' && a.connected_account.startsWith('acct_')
        ? a.connected_account
        : 'sandbox_' + a.creator_id;
    await db.query(
      `UPDATE creators SET identity_status='verified', identity_expires_at=now()+interval '1 year',
       adult_verified=true, connected_account=$2 WHERE id=$1`,
      [a.creator_id, keepAccount],
    );
    await audit(db, user.id, 'identity.sandbox_session_verified', a.creator_id, {
      provider_ref: session.provider_ref,
    });
  } else {
    await audit(db, user.id, 'identity.session_started', a.creator_id, {
      provider,
      provider_ref: session.provider_ref,
    });
  }

  return {
    provider: session.provider,
    provider_ref: session.provider_ref,
    status: checkStatus,
    url: session.url,
    sandbox: provider === 'sandbox',
  };
}

/** Legacy simulate button — sandbox provider + APP_ENV=sandbox only. */
export async function simulateIdentitySandbox(db: DB, user: Actor, assetId: string) {
  if (config.env !== 'sandbox' || identityProvider() !== 'sandbox')
    throw new DomainError('SANDBOX_DISABLED', 404);
  const a = await ownedAsset(db, assetId, user);
  const keepAccount =
    typeof a.connected_account === 'string' && a.connected_account.startsWith('acct_')
      ? a.connected_account
      : 'sandbox_' + a.creator_id;
  const providerRef = 'sandbox_sim_' + randomUUID();
  await db.query(
    `INSERT INTO identity_checks(id,creator_id,provider,provider_ref,status,adult_verified,verified_at)
     VALUES($1,$2,'sandbox',$3,'verified',true,now())`,
    [randomUUID(), a.creator_id, providerRef],
  );
  await db.query(
    `UPDATE creators SET identity_status='verified',identity_expires_at=now()+interval '1 year',
     adult_verified=true,connected_account=$2 WHERE id=$1`,
    [a.creator_id, keepAccount],
  );
  await audit(db, user.id, 'identity.sandbox_simulated', assetId);
  return { identity_status: 'verified', sandbox: true };
}

export function isIdentityEvent(event: Stripe.Event) {
  return event.type.startsWith('identity.verification_session.');
}

export async function ingestIdentityEvent(event: Stripe.Event) {
  if (!isIdentityEvent(event)) return { handled: false };
  const session = event.data.object as Stripe.Identity.VerificationSession;
  assertIdentityLivemodeAllowed(Boolean(session.livemode));

  const providerRef = session.id;
  const status = mapStripeStatus(session.status);
  const metaCreator =
    typeof session.metadata?.creator_id === 'string' ? session.metadata.creator_id : null;
  const refCreator =
    typeof session.client_reference_id === 'string' ? session.client_reference_id : null;

  const existing = (
    await pool.query(
      `SELECT id, creator_id FROM identity_checks WHERE provider='stripe' AND provider_ref=$1`,
      [providerRef],
    )
  ).rows[0];

  const creatorId = existing?.creator_id ?? metaCreator ?? refCreator;
  if (!creatorId) return { handled: true, applied: false };

  if (existing) {
    await pool.query(
      `UPDATE identity_checks SET status=$2, adult_verified=$3,
       verified_at=CASE WHEN $2='verified' THEN COALESCE(verified_at, now()) ELSE verified_at END,
       updated_at=now() WHERE id=$1`,
      [existing.id, status, status === 'verified' ? true : null],
    );
  } else {
    await pool.query(
      `INSERT INTO identity_checks(id,creator_id,provider,provider_ref,status,adult_verified,verified_at)
       VALUES($1,$2,'stripe',$3,$4,$5,$6)`,
      [
        randomUUID(),
        creatorId,
        providerRef,
        status,
        status === 'verified' ? true : null,
        status === 'verified' ? new Date().toISOString() : null,
      ],
    );
  }

  if (status === 'verified') {
    await pool.query(
      `UPDATE creators SET identity_status='verified', identity_expires_at=now()+interval '1 year',
       adult_verified=true WHERE id=$1`,
      [creatorId],
    );
    await audit(pool, null, 'identity.stripe_verified', creatorId, { provider_ref: providerRef });
  } else if (status === 'canceled' || status === 'requires_input') {
    const current = (
      await pool.query(`SELECT identity_status FROM creators WHERE id=$1`, [creatorId])
    ).rows[0];
    if (current?.identity_status !== 'verified') {
      await pool.query(`UPDATE creators SET identity_status=$2 WHERE id=$1`, [
        creatorId,
        status === 'canceled' ? 'rejected' : 'pending',
      ]);
    }
    await audit(pool, null, 'identity.stripe_update', creatorId, {
      provider_ref: providerRef,
      status,
    });
  }

  return { handled: true, applied: true, status };
}
