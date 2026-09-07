/**
 * RightsNet Connect (product) — thin wrappers over existing marketplace + rights engine.
 * Named `platform` to avoid collision with Stripe Connect (creator payouts).
 */
import { pool } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { config } from '../common/config.js';
import { admin, type Actor } from '../common/auth.js';
import { search } from './marketplace.js';
import { previewRightsCheck } from './licensing.js';

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
