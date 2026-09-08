import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { config } from '../apps/api/src/common/config.js';
import {
  completeSandboxPendingJob,
  startHiggsfieldAsyncAdapter,
  handleHiggsfieldWebhook,
  assertHiggsfieldWebhookSecret,
} from '../apps/api/src/modules/adapters/higgsfield-async.js';
import { DomainError } from '../packages/domain/src/index.js';

describe('Higgsfield L3 async + webhook', () => {
  const previousFlag = config.higgsfieldAdapterEnabled;
  const previousMode = config.higgsfieldMode;
  const previousSecret = config.higgsfieldWebhookSecret;

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

    await pool.query(
      `INSERT INTO rights_grants(
         id, source_type, source_id, grantee_organization_id, asset_id, grantor_user_id,
         status, payload, valid_from, valid_until
       ) VALUES (
         $1, 'EXISTING_AGREEMENT', $2, $3, $4, $5, 'ACTIVE', $6::jsonb, $7, $8
       )
       ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, status='ACTIVE'`,
      [
        '60000000-0000-4000-8000-000000000071',
        '60000000-0000-4000-8000-000000000070',
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
    config.higgsfieldWebhookSecret = previousSecret;
    await pool.end();
  });

  it('sandbox async → webhook completes → RN-GEN; idempotent replay', async () => {
    config.higgsfieldAdapterEnabled = true;
    (config as { higgsfieldMode: string }).higgsfieldMode = 'sandbox';

    const started = await startHiggsfieldAsyncAdapter(
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
        brief: 'async sandbox',
      },
      { mode: 'sandbox' },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.pending).toBe(true);
    expect(started.hf_job_id).toMatch(/^hf_sandbox_/);

    const first = await completeSandboxPendingJob(started.hf_job_id);
    expect(first.ok).toBe(true);
    if (!('reported' in first) || !first.reported) throw new Error('expected reported');
    expect(first.public_token).toMatch(/^RN-GEN-/);

    const second = await handleHiggsfieldWebhook({
      request_id: started.hf_job_id,
      status: 'completed',
      error: null,
      payload: {
        images: [{ url: `https://sandbox.higgsfield.invalid/outputs/${started.hf_job_id}.jpg` }],
      },
    });
    expect(second.ok).toBe(true);
    expect('idempotent' in second && second.idempotent).toBe(true);
  });

  it('webhook secret rejects bad bearer', () => {
    config.higgsfieldWebhookSecret = 'test-secret';
    expect(() => assertHiggsfieldWebhookSecret('Bearer wrong')).toThrowError(DomainError);
    expect(() => assertHiggsfieldWebhookSecret('Bearer test-secret')).not.toThrow();
    config.higgsfieldWebhookSecret = '';
  });
});
