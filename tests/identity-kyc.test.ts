import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { config } from '../apps/api/src/common/config.js';
import {
  setIdentityKycPort,
  stripeIdentityCreateParams,
  assertIdentityLivemodeAllowed,
  type IdentityKycPort,
} from '../apps/api/src/integrations/identity-kyc.js';
import {
  ingestIdentityEvent,
  simulateIdentitySandbox,
  startIdentitySession,
} from '../apps/api/src/modules/identity-kyc.js';
import { DomainError } from '../packages/domain/src/index.js';
import type { Actor } from '../apps/api/src/common/auth.js';

let previousIdentity: typeof config.identity;
let previousLive: boolean;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test'))
    throw new Error('Tests require a dedicated database ending _test');
  await migrate();
  await seed();
});

beforeEach(() => {
  previousIdentity = config.identity;
  previousLive = config.identityLiveEnabled;
});

afterEach(() => {
  setIdentityKycPort(null);
  (config as { identity: 'sandbox' | 'stripe' }).identity = previousIdentity;
  (config as { identityLiveEnabled: boolean }).identityLiveEnabled = previousLive;
});

afterAll(async () => {
  await pool.end();
});

function actorOf(id: string): Actor {
  return { id, role: 'creator', email: 't@test', display_name: 'T' } as Actor;
}

function mockStripePort(): IdentityKycPort {
  return {
    async createVerificationSession({ creatorId }) {
      const id = 'vs_test_' + randomUUID().slice(0, 8);
      return {
        provider: 'stripe',
        provider_ref: id,
        status: 'pending',
        url: 'https://verify.stripe.com/start/' + id,
        client_secret: 'vs_secret_' + id,
      };
    },
    async retrieveSessionStatus() {
      return { status: 'requires_input', livemode: false };
    },
  };
}

describe('Identity KYC v0.1', () => {
  it('stripe Identity create params require matching selfie', () => {
    const params = stripeIdentityCreateParams({
      creatorId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      assetId: '33333333-3333-4333-8333-333333333333',
      returnUrl: 'http://localhost:3000/dashboard?identity=return',
    });
    expect(params.type).toBe('document');
    expect(params.options?.document?.require_matching_selfie).toBe(true);
    expect(params.metadata?.rightsnet).toBe('identity_kyc_v0_1_1');
  });

  it('sandbox session verifies creator immediately', async () => {
    (config as { identity: 'sandbox' | 'stripe' }).identity = 'sandbox';
    const row = (
      await pool.query(
        `SELECT a.id, a.creator_id, c.user_id FROM assets a
         JOIN creators c ON c.id=a.creator_id
         JOIN policies p ON p.id=a.policy_id
         WHERE p.payload->>'schema_version' = 'rightsnet.policy/0.1'
         LIMIT 1`,
      )
    ).rows[0];
    await pool.query(
      `UPDATE creators SET identity_status='pending', adult_verified=false, identity_expires_at=NULL WHERE id=$1`,
      [row.creator_id],
    );

    const result = await transaction((db) =>
      startIdentitySession(db, actorOf(row.user_id), row.id),
    );
    expect(result.status).toBe('verified');
    expect(result.sandbox).toBe(true);

    const creator = (
      await pool.query(`SELECT identity_status, adult_verified FROM creators WHERE id=$1`, [
        row.creator_id,
      ])
    ).rows[0];
    expect(creator.identity_status).toBe('verified');
    expect(creator.adult_verified).toBe(true);
  });

  it('stripe session stays pending until webhook verified', async () => {
    (config as { identity: 'sandbox' | 'stripe' }).identity = 'stripe';
    setIdentityKycPort(mockStripePort());

    const row = (
      await pool.query(
        `SELECT a.id, a.creator_id, c.user_id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE a.id=$1`,
        [demoIds.rightsCoreAsset],
      )
    ).rows[0];
    await pool.query(
      `UPDATE creators SET identity_status='pending', adult_verified=false, identity_expires_at=NULL WHERE id=$1`,
      [row.creator_id],
    );

    const started = await transaction((db) =>
      startIdentitySession(db, actorOf(row.user_id), row.id),
    );
    expect(started.status).toBe('pending');
    expect(started.url).toContain('verify.stripe.com');

    const event = {
      id: 'evt_' + randomUUID(),
      object: 'event',
      type: 'identity.verification_session.verified',
      data: {
        object: {
          id: started.provider_ref,
          object: 'identity.verification_session',
          status: 'verified',
          livemode: false,
          metadata: { creator_id: row.creator_id },
          client_reference_id: row.creator_id,
        },
      },
    } as unknown as Stripe.Event;

    const ingested = await ingestIdentityEvent(event);
    expect(ingested.applied).toBe(true);

    const creator = (
      await pool.query(`SELECT identity_status, adult_verified FROM creators WHERE id=$1`, [
        row.creator_id,
      ])
    ).rows[0];
    expect(creator.identity_status).toBe('verified');
    expect(creator.adult_verified).toBe(true);
  });

  it('identity-sandbox rejected when provider is stripe', async () => {
    (config as { identity: 'sandbox' | 'stripe' }).identity = 'stripe';
    const row = (
      await pool.query(
        `SELECT a.id, c.user_id FROM assets a JOIN creators c ON c.id=a.creator_id LIMIT 1`,
      )
    ).rows[0];
    await expect(
      transaction((db) => simulateIdentitySandbox(db, actorOf(row.user_id), row.id)),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('livemode blocked when IDENTITY_LIVE_ENABLED is false', () => {
    (config as { identityLiveEnabled: boolean }).identityLiveEnabled = false;
    expect(() => assertIdentityLivemodeAllowed(true)).toThrow(DomainError);
    expect(() => assertIdentityLivemodeAllowed(false)).not.toThrow();
  });

  it('livemode webhook accepted when IDENTITY_LIVE_ENABLED is true', async () => {
    (config as { identity: 'sandbox' | 'stripe' }).identity = 'stripe';
    (config as { identityLiveEnabled: boolean }).identityLiveEnabled = true;

    const row = (
      await pool.query(
        `SELECT a.id, a.creator_id, c.user_id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE a.id=$1`,
        [demoIds.rightsCoreAsset],
      )
    ).rows[0];
    await pool.query(
      `UPDATE creators SET identity_status='pending', adult_verified=false, identity_expires_at=NULL WHERE id=$1`,
      [row.creator_id],
    );

    setIdentityKycPort(mockStripePort());
    const started = await transaction((db) =>
      startIdentitySession(db, actorOf(row.user_id), row.id),
    );

    const event = {
      id: 'evt_' + randomUUID(),
      object: 'event',
      type: 'identity.verification_session.verified',
      data: {
        object: {
          id: started.provider_ref,
          object: 'identity.verification_session',
          status: 'verified',
          livemode: true,
          metadata: { creator_id: row.creator_id },
          client_reference_id: row.creator_id,
        },
      },
    } as unknown as Stripe.Event;

    const ingested = await ingestIdentityEvent(event);
    expect(ingested.applied).toBe(true);

    const creator = (
      await pool.query(`SELECT identity_status, adult_verified FROM creators WHERE id=$1`, [
        row.creator_id,
      ])
    ).rows[0];
    expect(creator.identity_status).toBe('verified');
    expect(creator.adult_verified).toBe(true);
  });

  it('livemode webhook rejected when flag off', async () => {
    (config as { identity: 'sandbox' | 'stripe' }).identity = 'stripe';
    (config as { identityLiveEnabled: boolean }).identityLiveEnabled = false;

    const event = {
      id: 'evt_' + randomUUID(),
      object: 'event',
      type: 'identity.verification_session.verified',
      data: {
        object: {
          id: 'vs_live_blocked_' + randomUUID().slice(0, 8),
          object: 'identity.verification_session',
          status: 'verified',
          livemode: true,
          metadata: { creator_id: demoIds.rightsCoreCreator },
        },
      },
    } as unknown as Stripe.Event;

    await expect(ingestIdentityEvent(event)).rejects.toMatchObject({
      code: 'LIVE_IDENTITY_BLOCKED',
    });
  });
});
