/**
 * RightsNet Connect (product) — thin wrappers over existing marketplace + rights engine.
 * Named `platform` to avoid collision with Stripe Connect (creator payouts).
 */
import { z } from 'zod';
import { pool, transaction } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { config } from '../common/config.js';
import { admin, type Actor } from '../common/auth.js';
import { search } from './marketplace.js';
import { previewRightsCheck } from './licensing.js';
import { mintRnAuthToken, verifyRnAuthToken, revokeRnAuthToken } from './generation-auth.js';

export function assertPlatformApiAccess(user: Actor) {
  if (!config.platformApiEnabled) {
    throw new DomainError(
      'PLATFORM_API_DISABLED',
      404,
      'RightsNet Connect (platform API) no está habilitado en este entorno.',
    );
  }
  admin(user);
}

/** Partner-gated search — identical SQL/filters to marketplace.search. */
export async function platformSearch(query: Record<string, unknown>) {
  const result = await search(query);
  return {
    ...result,
    surface: 'platform' as const,
  };
}

/**
 * Partner-gated rights check — calls previewRightsCheck (evaluateRightsDecision / evaluateLicense).
 * Non-binding preview; does not create requests or licenses.
 */
export async function platformCheck(body: unknown) {
  const result = await previewRightsCheck(pool, body);
  return {
    ...result,
    surface: 'platform' as const,
  };
}

const AuthorizeGenerationSchema = z
  .object({
    organization_id: z.string().uuid(),
    asset_id: z.string().uuid(),
    provider: z.string().trim().min(1).max(64).default('rightsnet'),
    use: z
      .object({
        content_type: z.string().trim().min(1).max(64),
        purpose: z.string().trim().min(1).max(64).default('commercial_advertising'),
        territory: z.string().trim().min(1).max(16),
        industry: z.string().trim().min(1).max(64).optional(),
        at: z.string().datetime().optional(),
      })
      .strict(),
  })
  .strict();

type GrantRow = {
  id: string;
  status: string;
  valid_from: Date | string;
  valid_until: Date | string;
  payload: {
    rights?: Record<string, string>;
    industry?: string[];
    territories?: string[];
    approval?: Record<string, string>;
  };
};

/**
 * Executable authority via ACTIVE RightsGrant (not policy preview).
 * AUTHORIZED mints a short-lived signed RN-AUTH token (ledger + Ed25519).
 */
export async function platformAuthorizeGeneration(body: unknown) {
  const data = AuthorizeGenerationSchema.parse(body);
  const at = data.use.at ? new Date(data.use.at).getTime() : Date.now();

  const grants = (
    await pool.query(
      `SELECT id, status, valid_from, valid_until, payload
       FROM rights_grants
       WHERE grantee_organization_id=$1 AND asset_id=$2 AND status='ACTIVE'`,
      [data.organization_id, data.asset_id],
    )
  ).rows as GrantRow[];

  const covering = grants.filter((g) => {
    const from = new Date(g.valid_from).getTime();
    const until = new Date(g.valid_until).getTime();
    return from <= at && until > at;
  });

  if (covering.length === 0) {
    return {
      surface: 'platform' as const,
      decision: 'DENIED' as const,
      reason_codes: ['NO_ACTIVE_RIGHTS_GRANT'],
      organization_id: data.organization_id,
      asset_id: data.asset_id,
      provider: data.provider,
      grant_id: null,
      auth_token: null,
      preview: false,
    };
  }

  const industry = data.use.industry;
  let matched: GrantRow | null = null;
  let needsApproval = false;
  const reasons: string[] = [];

  for (const g of covering) {
    const rights = g.payload?.rights ?? {};
    const industries = g.payload?.industry ?? [];
    const territories = g.payload?.territories ?? [];
    const approval = g.payload?.approval ?? {};

    if (industry && industries.length > 0 && !industries.includes(industry)) {
      reasons.push('INDUSTRY_OUT_OF_SCOPE');
      continue;
    }
    if (
      territories.length > 0 &&
      !territories.includes(data.use.territory) &&
      !territories.includes('WORLDWIDE')
    ) {
      reasons.push('TERRITORY_OUT_OF_SCOPE');
      continue;
    }

    const content = rights[data.use.content_type];
    const purpose = rights[data.use.purpose];
    if (content === 'DENY' || purpose === 'DENY') {
      reasons.push('RIGHT_DENIED_BY_GRANT');
      continue;
    }

    const allowContent = content === 'ALLOW';
    const allowPurpose = purpose === 'ALLOW';
    const reqContent = content === 'REQUIRES_APPROVAL';
    const reqPurpose = purpose === 'REQUIRES_APPROVAL';

    if (!allowContent && !allowPurpose && !reqContent && !reqPurpose) {
      reasons.push('RIGHT_NOT_ALLOW');
      continue;
    }

    matched = g;
    needsApproval = Object.keys(approval).length > 0 || reqContent || reqPurpose;
    break;
  }

  if (!matched) {
    return {
      surface: 'platform' as const,
      decision: 'DENIED' as const,
      reason_codes: reasons.length ? [...new Set(reasons)] : ['NO_MATCHING_RIGHTS_GRANT'],
      organization_id: data.organization_id,
      asset_id: data.asset_id,
      provider: data.provider,
      grant_id: null,
      auth_token: null,
      preview: false,
    };
  }

  if (needsApproval) {
    return {
      surface: 'platform' as const,
      decision: 'REQUIRES_APPROVAL' as const,
      reason_codes: ['GRANT_APPROVAL_REQUIRED'],
      organization_id: data.organization_id,
      asset_id: data.asset_id,
      provider: data.provider,
      grant_id: matched.id,
      auth_token: null,
      preview: false,
    };
  }

  const auth_token = await mintRnAuthToken({
    grantId: matched.id,
    organizationId: data.organization_id,
    assetId: data.asset_id,
    provider: data.provider,
    use: {
      content_type: data.use.content_type,
      purpose: data.use.purpose,
      territory: data.use.territory,
      ...(data.use.industry ? { industry: data.use.industry } : {}),
    },
    grantValidUntil: matched.valid_until,
  });

  return {
    surface: 'platform' as const,
    decision: 'AUTHORIZED' as const,
    reason_codes: ['ACTIVE_RIGHTS_GRANT'],
    organization_id: data.organization_id,
    asset_id: data.asset_id,
    provider: data.provider,
    grant_id: matched.id,
    auth_token,
    preview: false,
  };
}

const VerifyAuthBodySchema = z
  .object({
    auth_token: z.unknown(),
  })
  .strict();

/**
 * Partner read-only RN-AUTH check. Does not consume (report_output does).
 */
export async function platformVerifyAuth(body: unknown, now: Date = new Date()) {
  const data = VerifyAuthBodySchema.parse(body);
  const result = await verifyRnAuthToken(data.auth_token, pool, now);
  if (result.ok) {
    return {
      surface: 'platform' as const,
      valid: true as const,
      reason: null,
      status: result.status,
      payload: result.payload,
    };
  }
  return {
    surface: 'platform' as const,
    valid: false as const,
    reason: result.reason,
    status: null,
    payload: null,
  };
}

const RevokeAuthBodySchema = z
  .object({
    auth_id: z.string().uuid(),
    organization_id: z.string().uuid(),
  })
  .strict();

/**
 * Partner revoke ISSUED RN-AUTH. Idempotent if already REVOKED. Not for CONSUMED.
 */
export async function platformRevokeAuth(body: unknown) {
  const data = RevokeAuthBodySchema.parse(body);
  const result = await transaction((db) =>
    revokeRnAuthToken(
      { authId: data.auth_id, organizationId: data.organization_id },
      db,
    ),
  );
  return {
    surface: 'platform' as const,
    auth_id: result.auth_id,
    status: result.status,
    idempotent: result.idempotent,
  };
}
