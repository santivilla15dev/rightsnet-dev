import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { config } from '../apps/api/src/common/config.js';
import {
  runHiggsfieldAdapter,
  sandboxHiggsfieldJob,
  assertHiggsfieldAdapterEnabled,
} from '../apps/api/src/modules/adapters/higgsfield.js';
import {
  liveHiggsfieldJob,
  resolveHiggsfieldCredentials,
} from '../apps/api/src/modules/adapters/higgsfield-live-client.js';
import { DomainError } from '../packages/domain/src/index.js';

describe('Higgsfield adapter (sandbox + live L1)', () => {
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
    } catch (e) {
      expect((e as DomainError).code).toBe('HIGGSFIELD_ADAPTER_DISABLED');
      const job = sandboxHiggsfieldJob({
        auth_id: '00000000-0000-4000-8000-000000000001',
        organization_id: demoIds.org,
        asset_id: demoIds.rightsCoreAsset,
        content_type: 'synthetic_video',
      });
      expect(job.hf_job_id).toMatch(/^hf_sandbox_/);
      expect(job.uri).toContain('sandbox.higgsfield.invalid');
      return;
    }
    expect.unreachable('expected disabled');
  });

  it('AUTHORIZED sandbox: authorize → stub → report → RN-GEN', async () => {
    config.higgsfieldAdapterEnabled = true;
    (config as { higgsfieldMode: string }).higgsfieldMode = 'sandbox';

    const result = await runHiggsfieldAdapter(
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
      { requireFlag: true, mode: 'sandbox' },
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
    const liveJobFn = vi.fn();
    const result = await runHiggsfieldAdapter(
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
      { requireFlag: false, mode: 'live', liveJobFn },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.decision).toBe('DENIED');
    expect(result.hf_called).toBe(false);
    expect(liveJobFn).not.toHaveBeenCalled();
  });

  it('AUTHORIZED live L1 with injected job (no network HF)', async () => {
    config.higgsfieldAdapterEnabled = true;
    const fakeId = `hf_live_test_${Date.now().toString(36)}`;
    const liveJobFn = vi.fn(async () => ({
      hf_job_id: fakeId,
      uri: `https://cdn.example.com/out/${fakeId}.jpg`,
      sha256: 'a'.repeat(64),
      content_type: 'image',
      status: 'completed' as const,
    }));

    const result = await runHiggsfieldAdapter(
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
        brief: 'live injected brief',
      },
      { requireFlag: true, mode: 'live', liveJobFn },
    );

    expect(liveJobFn).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('live');
    expect(result.hf_job_id).toBe(fakeId);
    expect(result.public_token).toMatch(/^RN-GEN-\d{4}-\d{6}$/);
  });

  it('live without credentials fails closed (not sandbox stub)', async () => {
    await expect(
      liveHiggsfieldJob(
        { prompt: 'x' },
        { credentials: null, fetchFn: vi.fn() as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ code: 'HIGGSFIELD_API_KEY_MISSING' });
  });
});

describe('Higgsfield live client (mocked HTTP)', () => {
  it('resolveHiggsfieldCredentials parses combined key', () => {
    expect(
      resolveHiggsfieldCredentials({
        HIGGSFIELD_API_KEY: 'kid:ksecret',
      } as NodeJS.ProcessEnv),
    ).toEqual({ keyId: 'kid', keySecret: 'ksecret' });
  });

  it('submit + poll completed yields uri and sha256', async () => {
    const requestId = 'd7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff';
    let calls = 0;
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls += 1;
      const u = String(url);
      if (init?.method === 'POST' || u.includes('/soul/')) {
        return new Response(
          JSON.stringify({
            status: 'queued',
            request_id: requestId,
            status_url: `https://api.higgsfield.ai/requests/${requestId}/status`,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          status: 'completed',
          request_id: requestId,
          images: [{ url: 'https://cdn.example.com/out.jpg' }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await liveHiggsfieldJob(
      { prompt: 'alpine lake' },
      {
        credentials: { keyId: 'id', keySecret: 'secret' },
        fetchFn,
        sleepFn: async () => undefined,
        timeoutMs: 60_000,
        baseUrl: 'https://api.higgsfield.ai',
        modelPath: 'higgsfield-ai/soul/v2/standard',
      },
    );

    expect(result.hf_job_id).toBe(requestId);
    expect(result.uri).toBe('https://cdn.example.com/out.jpg');
    expect(result.sha256).toHaveLength(64);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('HF submit error surfaces DomainError (not silent stub)', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'Invalid credentials' }), { status: 401 }),
    ) as unknown as typeof fetch;

    await expect(
      liveHiggsfieldJob(
        { prompt: 'x' },
        {
          credentials: { keyId: 'bad', keySecret: 'bad' },
          fetchFn,
          sleepFn: async () => undefined,
        },
      ),
    ).rejects.toMatchObject({ code: 'HIGGSFIELD_SUBMIT_FAILED' });
  });
});
