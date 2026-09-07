import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { config } from '../common/config.js';
import { stripeClient } from './stripe.js';

export type IdentitySessionResult = {
  provider: 'sandbox' | 'stripe';
  provider_ref: string;
  status: 'pending' | 'verified';
  url: string | null;
  client_secret: string | null;
};

export type IdentityKycPort = {
  createVerificationSession(input: {
    creatorId: string;
    userId: string;
    assetId: string;
    returnUrl: string;
  }): Promise<IdentitySessionResult>;
  retrieveSessionStatus(providerRef: string): Promise<{
    status: string;
    livemode: boolean;
  }>;
};

let injected: IdentityKycPort | null = null;

export function setIdentityKycPort(port: IdentityKycPort | null) {
  injected = port;
}

/** Params for Stripe Identity document + matching selfie (hosted UI; no biometrics stored in RightsNet). */
export function stripeIdentityCreateParams(input: {
  creatorId: string;
  userId: string;
  assetId: string;
  returnUrl: string;
}): Stripe.Identity.VerificationSessionCreateParams {
  return {
    type: 'document',
    return_url: input.returnUrl,
    client_reference_id: input.creatorId,
    options: {
      document: {
        require_matching_selfie: true,
      },
    },
    metadata: {
      creator_id: input.creatorId,
      user_id: input.userId,
      asset_id: input.assetId,
      rightsnet: 'identity_kyc_v0_1_1',
    },
  };
}

function sandboxPort(): IdentityKycPort {
  return {
    async createVerificationSession() {
      return {
        provider: 'sandbox',
        provider_ref: 'sandbox_vs_' + randomUUID(),
        status: 'verified',
        url: null,
        client_secret: null,
      };
    },
    async retrieveSessionStatus() {
      return { status: 'verified', livemode: false };
    },
  };
}

function stripePort(): IdentityKycPort {
  return {
    async createVerificationSession({ creatorId, userId, assetId, returnUrl }) {
      const client = stripeClient();
      const session = await client.identity.verificationSessions.create(
        stripeIdentityCreateParams({ creatorId, userId, assetId, returnUrl }),
      );
      if (session.livemode)
        throw new DomainError(
          'LIVE_IDENTITY_BLOCKED',
          503,
          'Solo se admiten sesiones Identity en modo test.',
        );
      return {
        provider: 'stripe',
        provider_ref: session.id,
        status: 'pending',
        url: session.url,
        client_secret: session.client_secret,
      };
    },
    async retrieveSessionStatus(providerRef) {
      const session = await stripeClient().identity.verificationSessions.retrieve(providerRef);
      return { status: session.status, livemode: session.livemode };
    },
  };
}

export function identityKyc(): IdentityKycPort {
  if (injected) return injected;
  if (config.identity === 'stripe') return stripePort();
  return sandboxPort();
}

export function identityProvider(): 'sandbox' | 'stripe' {
  return config.identity;
}
