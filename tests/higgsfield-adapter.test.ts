import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { config } from '../apps/api/src/common/config.js';
import {
  runHiggsfieldSandboxAdapter,
  sandboxHiggsfieldJob,
  assertHiggsfieldAdapterEnabled,
} from '../apps/api/src/modules/adapters/higgsfield.js';
import { DomainError } from '../packages/domain/src/index.js';

describe('Higgsfield sandbox adapter', () => {
  let grantId: string;
  const previousFlag = config.higgsfieldAdapterEnabled;
  const previousMode = config.higgsfieldMode;

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

    grantId = '60000000-0000-4000-8000-000000000061';
    await pool.query(
      `INSERT INTO rights_grants(
         id, source_type, source_id, grantee_organization_id, asset_id, grantor_user_id,
         status, payload, valid_from, valid_until
       ) VALUES (
         $1, 'EXISTING_AGREEMENT', $2, $3, $4, $5, 'ACTIVE', $6::jsonb, $7, $8
       )
       ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, status='ACTIVE'`,
      [
        grantId,
        '60000000-0000-4000-8000-000000000060',
        demoIds.org,
        demoIds.rightsCoreAsset,
        demoIds.rightsCoreCreatorUser,
        JSON.stringify({
          rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
          industry: ['beauty'],
          territories: ['DE', 'AT'],
          approval: {},
        }),
        '2026-01-01T00:00:00.000Z',
        '2027-12-31T23:59:59.000Z',
      ],
    );
  });

  afterAll(async () => {
    config.higgsfieldAdapterEnabled = previousFlag;
    (config as { higgsfieldMode: string }).higgsfieldMode = previousMode;
    await pool.end();
  });

  it('flag off throws; stub never calls network', () => {
    config.higgsfieldAdapterEnabled = false;
    try {
      assertHiggsfieldAdapterEnabled();
      expect.unreachable('expected disabled');
    } catch (e) {
      expect((e as DomainError).code).toBe('HIGGSFIELD_ADAPTER_DISABLED');
    }
    const job = sandboxHiggsfieldJob({
      auth_id: '00000000-0000-4000-8000-000000000001',
      organization_id: demoIds.org,
      asset_id: demoIds.rightsCoreAsset,
      content_type: 'synthetic_video',
    });
    expect(job.hf_job_id).toMatch(/^hf_sandbox_/);
    expect(job.uri).toContain('sandbox.higgsfield.invalid');
  });

  it('AUTHORIZED path: authorize → stub → report → RN-GEN', async () => {
    config.higgsfieldAdapterEnabled = true;
    (config as { higgsfieldMode: string }).higgsfieldMode = 'sandbox';

    const result = await runHiggsfieldSandboxAdapter(
      {
        organization_id: demoIds.org,
        asset_id: demoIds.rightsCoreAsset,
        use: {
          content_type: 'synthetic_video',
          purpose: 'commercial_advertising',
          territory: 'DE',
          industry: 'beauty',
          at: '2026-08-01T12:00:00.000Z',
        },
        brief: 'test brief',
      },
      { requireFlag: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe('AUTHORIZED');
    expect(result.mode).toBe('sandbox');
    expect(result.public_token).toMatch(/^RN-GEN-\d{4}-\d{6}$/);
    expect(result.verify_hint).toContain('/verify/generation/');
    expect(result.hf_job_id).toMatch(/^hf_sandbox_/);
    expect(result.grant_id).toBeTruthy();
  });

  it('DENIED path never invents HF success', async () => {
    config.higgsfieldAdapterEnabled = true;
    const result = await runHiggsfieldSandboxAdapter(
      {
        organization_id: demoIds.otherOrg,
        asset_id: demoIds.rightsCoreAsset,
        use: {
          content_type: 'synthetic_video',
          purpose: 'commercial_advertising',
          territory: 'DE',
          industry: 'beauty',
          at: '2026-08-01T12:00:00.000Z',
        },
      },
      { requireFlag: false },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.decision).toBe('DENIED');
    expect(result.hf_called).toBe(false);
  });
});
