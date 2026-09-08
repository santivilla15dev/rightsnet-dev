import { afterEach, describe, expect, it } from 'vitest';
import { DomainError } from '../packages/domain/src/index.js';
import { config } from '../apps/api/src/common/config.js';
import { assertLiveCommerceAllowed } from '../apps/api/src/integrations/stripe.js';

describe('live commerce L1 gate', () => {
  afterEach(() => {
    (config as { liveCommerceEnabled: boolean }).liveCommerceEnabled = false;
    (config as { payments: string }).payments = process.env.PAYMENTS_PROVIDER ?? 'sandbox';
  });

  it('allows testmode always', () => {
    (config as { liveCommerceEnabled: boolean }).liveCommerceEnabled = false;
    expect(() => assertLiveCommerceAllowed(false)).not.toThrow();
  });

  it('blocks livemode when flag off', () => {
    (config as { liveCommerceEnabled: boolean }).liveCommerceEnabled = false;
    expect(() => assertLiveCommerceAllowed(true)).toThrow(DomainError);
    try {
      assertLiveCommerceAllowed(true);
    } catch (e) {
      expect(e).toMatchObject({ code: 'LIVE_EVENT_BLOCKED', status: 400 });
    }
  });

  it('allows livemode when flag on and payments=stripe', () => {
    (config as { liveCommerceEnabled: boolean }).liveCommerceEnabled = true;
    (config as { payments: string }).payments = 'stripe';
    expect(() => assertLiveCommerceAllowed(true)).not.toThrow();
  });

  it('blocks livemode when flag on but payments is not stripe', () => {
    (config as { liveCommerceEnabled: boolean }).liveCommerceEnabled = true;
    (config as { payments: string }).payments = 'sandbox';
    try {
      assertLiveCommerceAllowed(true);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toMatchObject({ code: 'LIVE_EVENT_BLOCKED', status: 400 });
    }
  });
});
