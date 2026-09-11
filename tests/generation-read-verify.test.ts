import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import { DomainError } from '../packages/domain/src/index.js';
import { mintRnAuthToken } from '../apps/api/src/modules/generation-auth.js';
import { platformReportOutput } from '../apps/api/src/modules/report-output.js';
import {
  listPlatformGenerations,
  getPlatformGeneration,
} from '../apps/api/src/modules/generations.js';
import { publicVerifyGeneration } from '../apps/api/src/modules/generation-verify.js';

describe('generation read + public verify', () => {
  const orgId = randomUUID();
  const otherOrgId = randomUUID();
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
    await pool.query(
      "INSERT INTO organizations(id,legal_name,country,verified) VALUES($1,'List fixture','AT',true),($2,'Other list fixture','AT',true)",
      [orgId, otherOrgId],
    );

    grantId = randomUUID();
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
        randomUUID(),
        orgId,
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

  async function reportOne(suffix: string, nowIso: string) {
    const token = await mintRnAuthToken({
      grantId,
      organizationId: orgId,
      assetId: demoIds.rightsCoreAsset,
      provider: 'higgsfield',
      use: {
        content_type: 'synthetic_video',
        purpose: 'commercial_advertising',
        territory: 'DE',
      },
      grantValidUntil: '2027-12-31T23:59:59.000Z',
      now: new Date(nowIso),
    });
    return platformReportOutput(
      {
        auth_id: token.payload.auth_id,
        organization_id: orgId,
        provider: 'higgsfield',
        idempotency_key: `read-${suffix}`,
        output: {
          content_type: 'synthetic_video',
          external_job_id: `job-${suffix}`,
          uri: `https://partner.example/out/${suffix}`,
          sha256: 'b'.repeat(64),
        },
      },
      new Date(new Date(nowIso).getTime() + 60_000),
    );
  }

  it('lists by org, scopes GET, and verifies publicly without uri', async () => {
    const a = await reportOne('a', '2026-07-01T12:00:00.000Z');
    const b = await reportOne('b', '2026-07-02T12:00:00.000Z');

    const listed = await listPlatformGenerations({
      organization_id: orgId,
      provider: 'higgsfield',
      limit: 10,
    });
    const firstPage = await listPlatformGenerations({ organization_id: orgId, limit: 1 });
    expect(firstPage.items.map((i) => i.generation_id)).toEqual([b.generation_id]);
    expect(firstPage.next_cursor).toBeTruthy();
    const secondPage = await listPlatformGenerations({
      organization_id: orgId,
      limit: 1,
      cursor: firstPage.next_cursor,
    });
    expect(secondPage.items.map((i) => i.generation_id)).toEqual([a.generation_id]);
    expect(secondPage.next_cursor).toBeNull();
    expect(listed.surface).toBe('platform');
    expect(listed.items.some((i) => i.generation_id === a.generation_id)).toBe(true);
    expect(listed.items.some((i) => i.generation_id === b.generation_id)).toBe(true);

    const empty = await listPlatformGenerations({ organization_id: otherOrgId });
    expect(empty.items).toHaveLength(0);

    const one = await getPlatformGeneration(a.generation_id!, orgId);
    expect(one.public_token).toBe(a.public_token);
    expect(one.output).toMatchObject({ external_job_id: 'job-a' });

    try {
      await getPlatformGeneration(a.generation_id!, otherOrgId);
      expect.unreachable('expected NOT_FOUND');
    } catch (e) {
      expect((e as DomainError).code).toBe('NOT_FOUND');
    }

    const pub = await publicVerifyGeneration(a.public_token!);
    expect(pub.surface).toBe('public');
    expect(pub.status).toBe('RECORDED');
    expect(pub.public_token).toBe(a.public_token);
    expect(pub.content_type).toBe('synthetic_video');
    expect(pub.sha256).toBe('b'.repeat(64));
    expect(pub.auth_consumed).toBe(true);
    expect(pub).not.toHaveProperty('uri');
    expect(JSON.stringify(pub)).not.toContain('partner.example');

    try {
      await publicVerifyGeneration('RN-GEN-2099-999999');
      expect.unreachable('expected NOT_FOUND');
    } catch (e) {
      expect((e as DomainError).code).toBe('NOT_FOUND');
    }
  });
});
