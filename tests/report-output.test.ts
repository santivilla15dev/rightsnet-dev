import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { DomainError } from '../packages/domain/src/index.js';
import { mintRnAuthToken } from '../apps/api/src/modules/generation-auth.js';
import { platformReportOutput } from '../apps/api/src/modules/report-output.js';

describe('report_output / GenerationRecord', () => {
  let grantId: string;

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

    grantId = '60000000-0000-4000-8000-000000000081';
    await pool.query(
      `INSERT INTO rights_grants(
         id, source_type, source_id, grantee_organization_id, asset_id, grantor_user_id,
         status, payload, valid_from, valid_until
       ) VALUES (
         $1, 'EXISTING_AGREEMENT', $2, $3, $4, $5, 'ACTIVE', $6::jsonb, $7, $8
       )
       ON CONFLICT (id) DO UPDATE SET status='ACTIVE'`,
      [
        grantId,
        '60000000-0000-4000-8000-000000000080',
        demoIds.org,
        demoIds.rightsCoreAsset,
        demoIds.rightsCoreCreatorUser,
        JSON.stringify({
          rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
          industry: ['beauty'],
          territories: ['DE'],
          approval: {},
        }),
        '2026-01-01T00:00:00.000Z',
        '2027-12-31T23:59:59.000Z',
      ],
    );
  });

  afterAll(() => pool.end());

  async function mint(now = new Date('2026-06-15T12:00:00.000Z')) {
    return mintRnAuthToken({
      grantId,
      organizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      provider: 'higgsfield',
      use: {
        content_type: 'synthetic_video',
        purpose: 'commercial_advertising',
        territory: 'DE',
        industry: 'beauty',
      },
      grantValidUntil: '2027-12-31T23:59:59.000Z',
      now,
    });
  }

  it('records output, consumes auth, rejects second report', async () => {
    const token = await mint();
    const now = new Date('2026-06-15T12:30:00.000Z');
    const idem = `job-report-${randomUUID()}`;
    const first = await platformReportOutput(
      {
        auth_id: token.payload.auth_id,
        organization_id: demoIds.org,
        provider: 'higgsfield',
        idempotency_key: idem,
        output: {
          content_type: 'synthetic_video',
          external_job_id: 'hf_1',
          uri: 'https://partner.example/out/1',
        },
      },
      now,
    );
    expect(first.status).toBe('RECORDED');
    expect(first.consumed).toBe(true);
    expect(first.generation_id).toBeTruthy();
    expect(first.public_token).toMatch(/^RN-GEN-\d{4}-\d{6}$/);
    expect(first.verify_hint).toContain('/verify/generation/');

    const auth = (
      await pool.query('SELECT status FROM generation_auths WHERE id=$1', [token.payload.auth_id])
    ).rows[0];
    expect(auth.status).toBe('CONSUMED');

    const replay = await platformReportOutput(
      {
        auth_id: token.payload.auth_id,
        organization_id: demoIds.org,
        provider: 'higgsfield',
        idempotency_key: idem,
        output: {
          content_type: 'synthetic_video',
          external_job_id: 'hf_1',
          uri: 'https://partner.example/out/1',
        },
      },
      now,
    );
    expect(replay.generation_id).toBe(first.generation_id);

    try {
      await platformReportOutput(
        {
          auth_id: token.payload.auth_id,
          organization_id: demoIds.org,
          provider: 'higgsfield',
          output: {
            content_type: 'synthetic_video',
            external_job_id: 'hf_2',
          },
        },
        now,
      );
      expect.unreachable('expected AUTH_CONSUMED');
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe('AUTH_CONSUMED');
    }
  });

  it('rejects org mismatch and content_type mismatch without consuming', async () => {
    const token = await mint(new Date('2026-06-16T12:00:00.000Z'));
    const now = new Date('2026-06-16T12:10:00.000Z');

    try {
      await platformReportOutput(
        {
          auth_id: token.payload.auth_id,
          organization_id: demoIds.otherOrg,
          provider: 'higgsfield',
          output: { content_type: 'synthetic_video', sha256: 'a'.repeat(64) },
        },
        now,
      );
      expect.unreachable('expected ORG_MISMATCH');
    } catch (e) {
      expect((e as DomainError).code).toBe('ORG_MISMATCH');
    }

    try {
      await platformReportOutput(
        {
          auth_id: token.payload.auth_id,
          organization_id: demoIds.org,
          provider: 'higgsfield',
          output: { content_type: 'synthetic_image', external_job_id: 'x' },
        },
        now,
      );
      expect.unreachable('expected OUTPUT_MISMATCH');
    } catch (e) {
      expect((e as DomainError).code).toBe('OUTPUT_MISMATCH');
    }

    const auth = (
      await pool.query('SELECT status FROM generation_auths WHERE id=$1', [token.payload.auth_id])
    ).rows[0];
    expect(auth.status).toBe('ISSUED');
  });

  it('rejects expired auth', async () => {
    const token = await mint(new Date('2026-06-17T12:00:00.000Z'));
    try {
      await platformReportOutput(
        {
          auth_id: token.payload.auth_id,
          organization_id: demoIds.org,
          provider: 'higgsfield',
          output: { content_type: 'synthetic_video', external_job_id: 'late' },
        },
        new Date('2026-06-17T14:00:01.000Z'),
      );
      expect.unreachable('expected AUTH_EXPIRED');
    } catch (e) {
      expect((e as DomainError).code).toBe('AUTH_EXPIRED');
    }
  });
});
