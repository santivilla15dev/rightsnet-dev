import { describe, expect, it } from 'vitest';
import {
  allChecksOk,
  evaluateHealthPayload,
} from '../scripts/lib/staging-health.mjs';

describe('Staging health smoke v0.1', () => {
  it('acepta payload sandbox típico', () => {
    const checks = evaluateHealthPayload(200, {
      status: 'ok',
      environment: 'sandbox',
      commerce: 'sandbox_only',
    });
    expect(allChecksOk(checks)).toBe(true);
  });

  it('rechaza production y live_enabled', () => {
    const prod = evaluateHealthPayload(200, {
      status: 'ok',
      environment: 'production',
      commerce: 'sandbox_only',
    });
    expect(prod.find((c) => c.id === 'env.not_production')?.ok).toBe(false);

    const live = evaluateHealthPayload(200, {
      status: 'ok',
      environment: 'sandbox',
      commerce: 'live_enabled',
    });
    expect(live.find((c) => c.id === 'commerce.sandbox_default')?.ok).toBe(false);

    const allowed = evaluateHealthPayload(
      200,
      { status: 'ok', environment: 'sandbox', commerce: 'live_enabled' },
      { allowLiveCommerce: true },
    );
    expect(allowed.find((c) => c.id === 'commerce.sandbox_default')?.ok).toBe(true);
  });

  it('rechaza HTTP no OK o status distinto', () => {
    expect(allChecksOk(evaluateHealthPayload(503, { status: 'ok' }))).toBe(false);
    expect(allChecksOk(evaluateHealthPayload(200, { status: 'degraded' }))).toBe(false);
  });
});
