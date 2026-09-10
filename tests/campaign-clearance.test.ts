import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { createCampaign } from '../apps/api/src/modules/campaigns.js';
import { addCampaignTalent } from '../apps/api/src/modules/talent-inventory.js';
import {
  getCampaignClearance,
  updateCampaignUsage,
} from '../apps/api/src/modules/campaign-clearance.js';
import {
  evaluateCampaignClearance,
  type CampaignUsage,
  type ClearanceTalent,
} from '../packages/domain/src/rights-core/campaign-clearance.js';

const now = new Date('2030-01-01T00:00:00.000Z');
const org = randomUUID(),
  ownerId = randomUUID(),
  employeeId = randomUUID(),
  otherId = randomUUID();
const creatorId = randomUUID(),
  assetId = randomUUID(),
  grantId = randomUUID();
let owner: Actor, employee: Actor, other: Actor, campaignId: string;
const usage: CampaignUsage = {
  industry: 'beauty',
  operation: 'synthetic_video',
  purpose: 'commercial_advertising',
  territories: ['DE'],
  channels: ['instagram'],
  start_at: '2030-01-02T00:00:00.000Z',
  duration_days: 30,
};

function talent(overrides: Partial<NonNullable<ClearanceTalent['grant']>> = {}): ClearanceTalent {
  const sourceId = randomUUID();
  return {
    asset_id: assetId,
    display_name: 'H3 real talent',
    selected_grant_id: grantId,
    grant: {
      id: grantId,
      status: 'ACTIVE',
      valid_from: '2029-12-01T00:00:00.000Z',
      valid_until: '2030-06-01T00:00:00.000Z',
      payload: {
        schema_version: 'rightsnet.rights-grant/0.1',
        grant_id: grantId,
        grantor_user_id: ownerId,
        grantee_organization_id: org,
        asset_id: assetId,
        source: { type: 'EXISTING_AGREEMENT', id: sourceId },
        rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
        industry: ['beauty'],
        territories: ['DE'],
        approval: {},
        valid_from: '2029-12-01T00:00:00.000Z',
        valid_until: '2030-06-01T00:00:00.000Z',
        status: 'ACTIVE',
        scope_snapshot: { channels: ['instagram'], duration_days: 30 },
      },
      ...overrides,
    },
  };
}
async function addUser(id: string, role: string) {
  return (
    await pool.query(
      'INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,$4) RETURNING *',
      [id, `${id}@h3.test`, `H3 ${role}`, role],
    )
  ).rows[0] as Actor;
}

describe('H3 deterministic campaign clearance', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Test DB required');
    await migrate();
    owner = await addUser(ownerId, 'buyer');
    employee = await addUser(employeeId, 'buyer');
    other = await addUser(otherId, 'buyer');
    await pool.query("INSERT INTO organizations(id,legal_name,country) VALUES($1,'H3 Org','DE')", [
      org,
    ]);
    await pool.query('INSERT INTO organization_members VALUES($1,$2,$3),($1,$4,$5)', [
      org,
      ownerId,
      'owner',
      employeeId,
      'employee',
    ]);
    await pool.query(
      "INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES($1,$2,'H3 real talent','fixture','DE','fixture.svg')",
      [creatorId, ownerId],
    );
    await pool.query('INSERT INTO assets(id,creator_id) VALUES($1,$2)', [assetId, creatorId]);
    const fixture = talent().grant!;
    await pool.query(
      `INSERT INTO rights_grants(id,grantor_user_id,grantee_organization_id,asset_id,source_type,source_id,payload,status,valid_from,valid_until)
      VALUES($1,$2,$3,$4,'EXISTING_AGREEMENT',$5,$6,'ACTIVE',$7,$8)`,
      [
        grantId,
        ownerId,
        org,
        assetId,
        (fixture.payload as { source: { id: string } }).source.id,
        JSON.stringify(fixture.payload),
        fixture.valid_from,
        fixture.valid_until,
      ],
    );
    campaignId = (
      await createCampaign(
        owner,
        { organization_id: org, name: 'H3 campaign', creative_brief: '' },
        randomUUID(),
      )
    ).id;
    await addCampaignTalent(
      owner,
      campaignId,
      { asset_id: assetId, selected_grant_id: grantId },
      randomUUID(),
    );
  });
  afterAll(() => pool.end());

  it('allows only when all ten declared dimensions are covered', () => {
    expect(evaluateCampaignClearance(usage, [talent()], org, now.toISOString())).toMatchObject({
      status: 'ALLOW',
      score: 100,
      passed_checks: 10,
      total_checks: 10,
      authority: false,
    });
  });
  it('gives DENY precedence and accepts an exact grant end boundary', () => {
    const denied = evaluateCampaignClearance(
      { ...usage, territories: ['AT'] },
      [talent()],
      org,
      now.toISOString(),
    );
    expect(denied.status).toBe('DENY');
    expect(denied.score).toBeLessThan(100);
    expect(denied.reason_codes).toContain('SCOPE_OUT_OF_BOUNDS');
    const exact = evaluateCampaignClearance(
      { ...usage, start_at: '2030-05-02T00:00:00.000Z' },
      [talent()],
      org,
      now.toISOString(),
    );
    expect(exact.items[0].checks.find((c) => c.dimension === 'window')?.status).toBe('ALLOW');
  });
  it('keeps missing terms incomplete and explicit approval pending', () => {
    const missing = talent();
    (missing.grant!.payload as { scope_snapshot: unknown }).scope_snapshot = {};
    expect(evaluateCampaignClearance(usage, [missing], org, now.toISOString()).status).toBe(
      'INCOMPLETE',
    );
    const approval = talent();
    (approval.grant!.payload as { approval: unknown }).approval = { creative_review: 'required' };
    expect(evaluateCampaignClearance(usage, [approval], org, now.toISOString())).toMatchObject({
      status: 'REQUIRES_APPROVAL',
      score: 90,
    });
  });
  it('blocks revoked grants and marks no talent incomplete', () => {
    expect(
      evaluateCampaignClearance(usage, [talent({ status: 'REVOKED' })], org, now.toISOString())
        .status,
    ).toBe('DENY');
    expect(evaluateCampaignClearance(usage, [], org, now.toISOString())).toMatchObject({
      status: 'INCOMPLETE',
      score: 0,
      reason_codes: ['NO_TALENT'],
    });
  });
  it('persists usage with revision, audit and access boundaries', async () => {
    const before = await getCampaignClearance(employee, campaignId, now);
    expect(before.status).toBe('INCOMPLETE');
    const key = randomUUID();
    const saved = await updateCampaignUsage(
      owner,
      campaignId,
      { usage, expected_revision: before.revision },
      key,
    );
    expect(
      (
        await updateCampaignUsage(
          owner,
          campaignId,
          { usage, expected_revision: before.revision },
          key,
        )
      ).revision,
    ).toBe(saved.revision);
    await expect(
      updateCampaignUsage(
        employee,
        campaignId,
        { usage, expected_revision: saved.revision },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(getCampaignClearance(other, campaignId, now)).rejects.toMatchObject({
      status: 404,
    });
    expect(await getCampaignClearance(owner, campaignId, now)).toMatchObject({
      status: 'ALLOW',
      score: 100,
      revision: saved.revision,
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM audit_events WHERE resource_id=$1 AND action='campaign.usage_updated'",
          [campaignId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('rejects invalid usage and stale revisions', async () => {
    const current = await getCampaignClearance(owner, campaignId, now);
    await expect(
      updateCampaignUsage(
        owner,
        campaignId,
        { usage: { ...usage, channels: [] }, expected_revision: current.revision },
        randomUUID(),
      ),
    ).rejects.toBeTruthy();
    await expect(
      updateCampaignUsage(
        owner,
        campaignId,
        { usage, expected_revision: current.revision - 1 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_CONFLICT' });
  });
});
