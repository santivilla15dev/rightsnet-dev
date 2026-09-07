import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { config } from '../apps/api/src/common/config.js';
import { search } from '../apps/api/src/modules/marketplace.js';
import { previewRightsCheck } from '../apps/api/src/modules/licensing.js';
import {
  assertPlatformApiAccess,
  platformSearch,
  platformCheck,
} from '../apps/api/src/modules/platform.js';

describe('RightsNet Connect platform wrappers', () => {
  let admin: Actor;
  let buyer: Actor;
  const previousFlag = config.platformApiEnabled;

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
    const users = (await pool.query('SELECT * FROM users')).rows;
    admin = users.find((u) => u.id === demoIds.admin);
    buyer = users.find((u) => u.id === demoIds.buyer);
    await pool.query("UPDATE assets SET status='published' WHERE relationship_status='reviewed'");
  });

  afterAll(async () => {
    config.platformApiEnabled = previousFlag;
    await pool.end();
  });

  it('denies access when PLATFORM_API_ENABLED is false', () => {
    config.platformApiEnabled = false;
    try {
      assertPlatformApiAccess(admin);
      expect.unreachable('expected PLATFORM_API_DISABLED');
    } catch (e) {
      expect(e).toMatchObject({ code: 'PLATFORM_API_DISABLED', status: 404 });
    }
  });

  it('denies non-admin when enabled', () => {
    config.platformApiEnabled = true;
    try {
      assertPlatformApiAccess(buyer);
      expect.unreachable('expected FORBIDDEN');
    } catch (e) {
      expect(e).toMatchObject({ code: 'FORBIDDEN', status: 403 });
    }
  });

  it('platformSearch matches marketplace.search and tags surface', async () => {
    config.platformApiEnabled = true;
    assertPlatformApiAccess(admin);
    const query = { category: 'beauty', limit: 10 };
    const [a, b] = await Promise.all([search(query), platformSearch(query)]);
    expect(b.surface).toBe('platform');
    expect(b.items.map((x) => String(x.id))).toEqual(a.items.map((x) => String(x.id)));
    expect(b.next_cursor).toEqual(a.next_cursor);
  });

  it('platformCheck matches previewRightsCheck decisions (no second engine)', async () => {
    config.platformApiEnabled = true;
    assertPlatformApiAccess(admin);
    const body = {
      asset_id: demoIds.rightsCoreAsset,
      request: {
        schema_version: 'rightsnet.license-request/0.1',
        campaign_name: 'Platform check parity',
        purpose: 'commercial_advertising',
        generation_type: 'synthetic_video',
        industry: 'beauty',
        territories: ['DE'],
        channels: ['instagram'],
        duration_days: 30,
        starts_at: new Date(Date.now() + 4 * 86400000).toISOString(),
        exclusivity: 'none',
        requested_additional_rights: [],
      },
    };
    const publicPreview = await previewRightsCheck(pool, body);
    const platform = await platformCheck(body);
    expect(platform.surface).toBe('platform');
    expect(platform.preview).toBe(true);
    expect(platform.decision).toBe(publicPreview.decision);
    expect(platform.reason_codes).toEqual(publicPreview.reason_codes);
    // request_id is minted per preview call → hashes differ; decision path must match.
    expect(['ALLOW', 'DENY', 'REQUIRES_APPROVAL', 'INCOMPLETE']).toContain(platform.decision);
  });
});
