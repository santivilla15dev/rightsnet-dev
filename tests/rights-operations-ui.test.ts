import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_BUCKET_ROWS,
  DEMO_ORGANIZATIONS,
  OVERVIEW_METRIC_ROWS,
} from '../apps/web/src/lib/rights-operations-ui.js';

describe('Rights Operations UI constants', () => {
  it('covers all overview metric keys from the API contract', () => {
    expect(OVERVIEW_METRIC_ROWS.map((r) => r.key)).toEqual([
      'active_talent_agreements',
      'expiring_in_30_days',
      'ai_rights_enabled',
      'ai_use_prohibited',
      'approval_required',
      'conflicting_exclusivity',
      'missing_structured_rights',
    ]);
  });

  it('covers campaign buckets and seed demo orgs', () => {
    expect(CAMPAIGN_BUCKET_ROWS.map((r) => r.key)).toEqual([
      'fully_cleared',
      'approval_required',
      'not_permitted',
      'agreement_unclear',
    ]);
    expect(DEMO_ORGANIZATIONS[0].id).toBe('20000000-0000-4000-8000-000000000001');
    expect(DEMO_ORGANIZATIONS[1].legal_name).toContain('Otra empresa');
  });
});
