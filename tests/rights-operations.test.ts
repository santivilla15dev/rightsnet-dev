import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import {
  classifyAssetForCampaign,
  rightsOperationsCampaignQuery,
  rightsOperationsOverview,
} from '../apps/api/src/modules/rights-operations.js';

describe('Rights Operations read-model', () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!url.pathname.endsWith('_test'))
      throw new Error('Tests require a dedicated database ending _test');
    const name = url.pathname.slice(1);
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Unsafe test DB name');
    url.pathname = '/postgres';
    const management = new pg.Pool({ connectionString: url.toString() });
    if (!(await management.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
      await management.query('CREATE DATABASE ' + name);
    await management.end();
    await migrate();
    await seed();
  });

  afterAll(() => pool.end());

  it('classifyAssetForCampaign: approval vs cleared vs deny', () => {
    const base = {
      organization_id: demoIds.org,
      industry: 'beauty',
      territory: 'DE',
      window_start: '2026-10-01T00:00:00.000Z',
      window_end: '2026-10-31T23:59:59.000Z',
      content_type: 'synthetic_video',
      purpose: 'commercial_advertising',
    };
    const covering = {
      id: 'g1',
      asset_id: 'a1',
      status: 'ACTIVE',
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: '2027-12-31T00:00:00.000Z',
      payload: {
        rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
        industry: ['beauty'],
        territories: ['DE'],
        approval: {},
      },
    };
    expect(classifyAssetForCampaign([covering], false, base)).toBe('fully_cleared');
    expect(
      classifyAssetForCampaign(
        [{ ...covering, payload: { ...covering.payload, approval: { creative_approval: 'REQUIRED' } } }],
        false,
        base,
      ),
    ).toBe('approval_required');
    expect(
      classifyAssetForCampaign(
        [
          {
            ...covering,
            payload: {
              ...covering.payload,
              rights: { synthetic_video: 'DENY' },
            },
          },
        ],
        false,
        base,
      ),
    ).toBe('not_permitted');
    expect(classifyAssetForCampaign([], true, base)).toBe('agreement_unclear');
  });

  it('overview for seed org has active grants; otherOrg is empty-ish', async () => {
    const nike = await rightsOperationsOverview(demoIds.org);
    expect(nike.surface).toBe('rights_operations');
    expect(nike.metrics.active_talent_agreements).toBeGreaterThanOrEqual(1);
    expect(nike.metrics.approval_required).toBeGreaterThanOrEqual(1);

    const adidas = await rightsOperationsOverview(demoIds.otherOrg);
    expect(adidas.metrics.active_talent_agreements).toBe(0);
    expect(adidas.metrics.missing_structured_rights).toBe(0);
  });

  it('campaign query buckets seed grant as approval_required for beauty/DE', async () => {
    const result = await rightsOperationsCampaignQuery({
      organization_id: demoIds.org,
      industry: 'beauty',
      territory: 'DE',
      window_start: '2026-06-01T00:00:00.000Z',
      window_end: '2026-06-30T23:59:59.000Z',
      content_type: 'synthetic_video',
      purpose: 'commercial_advertising',
    });
    expect(result.surface).toBe('rights_operations');
    expect(result.relationships).toBeGreaterThanOrEqual(1);
    expect(result.approval_required).toBeGreaterThanOrEqual(1);

    const empty = await rightsOperationsCampaignQuery({
      organization_id: demoIds.otherOrg,
      industry: 'beauty',
      territory: 'DE',
      window_start: '2026-06-01T00:00:00.000Z',
      window_end: '2026-06-30T23:59:59.000Z',
      content_type: 'synthetic_video',
    });
    expect(empty.relationships).toBe(0);
    expect(empty.fully_cleared + empty.approval_required).toBe(0);
  });
});
