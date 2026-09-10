import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { createCampaign } from '../apps/api/src/modules/campaigns.js';
import { addCampaignTalent, removeCampaignTalent } from '../apps/api/src/modules/talent-inventory.js';
import { updateCampaignUsage } from '../apps/api/src/modules/campaign-clearance.js';
import {
  getDealBuilder,
  upsertDealRequest,
  sendDealRequest,
  withdrawDealRequest,
  gapsFromClearanceItem,
} from '../apps/api/src/modules/campaign-deal-builder.js';
import type { CampaignUsage } from '../packages/domain/src/rights-core/campaign-clearance.js';
import { DomainError } from '../packages/domain/src/index.js';

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
  territories: ['AT'],
  channels: ['instagram'],
  start_at: '2030-01-02T00:00:00.000Z',
  duration_days: 30,
};

async function addUser(id: string, role: string) {
  return (
    await pool.query(
      'INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,$4) RETURNING *',
      [id, `${id}@h5.test`, `H5 ${role}`, role],
    )
  ).rows[0] as Actor;
}

describe('H5 campaign deal builder', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Test DB required');
    await migrate();
    owner = await addUser(ownerId, 'buyer');
    employee = await addUser(employeeId, 'buyer');
    other = await addUser(otherId, 'buyer');
    await pool.query("INSERT INTO organizations(id,legal_name,country) VALUES($1,'H5 Org','DE')", [
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
      "INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES($1,$2,'H5 talent','fixture','DE','fixture.svg')",
      [creatorId, ownerId],
    );
    await pool.query('INSERT INTO assets(id,creator_id) VALUES($1,$2)', [assetId, creatorId]);
    const sourceId = randomUUID();
    const payload = {
      schema_version: 'rightsnet.rights-grant/0.1',
      grant_id: grantId,
      grantor_user_id: ownerId,
      grantee_organization_id: org,
      asset_id: assetId,
      source: { type: 'EXISTING_AGREEMENT', id: sourceId },
      rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
      industry: ['beauty'],
      territories: ['DE'],
      approval: { human_review: 'required' },
      valid_from: '2029-12-01T00:00:00.000Z',
      valid_until: '2030-06-01T00:00:00.000Z',
      status: 'ACTIVE',
      scope_snapshot: { channels: ['instagram'], duration_days: 30 },
    };
    await pool.query(
      `INSERT INTO rights_grants(id,grantor_user_id,grantee_organization_id,asset_id,source_type,source_id,payload,status,valid_from,valid_until)
      VALUES($1,$2,$3,$4,'EXISTING_AGREEMENT',$5,$6,'ACTIVE',$7,$8)`,
      [
        grantId,
        ownerId,
        org,
        assetId,
        sourceId,
        JSON.stringify(payload),
        payload.valid_from,
        payload.valid_until,
      ],
    );
    campaignId = (
      await createCampaign(
        owner,
        { organization_id: org, name: 'H5 campaign', creative_brief: '' },
        randomUUID(),
      )
    ).id;
    await addCampaignTalent(
      owner,
      campaignId,
      { asset_id: assetId, selected_grant_id: grantId },
      randomUUID(),
    );
    await updateCampaignUsage(
      owner,
      campaignId,
      { usage, expected_revision: 2 },
      randomUUID(),
    );
  });
  afterAll(() => pool.end());

  it('maps clearance gaps without inventing terms', () => {
    const gaps = gapsFromClearanceItem(
      {
        asset_id: assetId,
        display_name: 't',
        selected_grant_id: grantId,
        status: 'DENY',
        checks: [
          { dimension: 'territories', status: 'DENY', reason: 'SCOPE_OUT_OF_BOUNDS' },
          { dimension: 'approval', status: 'REQUIRES_APPROVAL', reason: 'GRANT_APPROVAL_REQUIRED' },
          { dimension: 'status', status: 'ALLOW', reason: 'GRANT_CURRENT' },
        ],
      },
      usage,
    );
    expect(gaps).toEqual([
      { dimension: 'territories', reason: 'SCOPE_OUT_OF_BOUNDS', desired: ['AT'] },
      { dimension: 'approval', reason: 'GRANT_APPROVAL_REQUIRED', desired: null },
    ]);
  });

  it('creates draft, detects stale gaps, sends and withdraws without mutating grants', async () => {
    const builder = await getDealBuilder(owner, campaignId);
    expect(builder.authority).toBe(false);
    expect(builder.items[0].suggested_gaps.some((g) => g.reason === 'SCOPE_OUT_OF_BOUNDS')).toBe(
      true,
    );
    expect(builder.items[0].suggested_gaps.some((g) => g.reason === 'GRANT_APPROVAL_REQUIRED')).toBe(
      true,
    );

    const draft = await upsertDealRequest(
      owner,
      campaignId,
      {
        asset_id: assetId,
        desired_usage: { territories: ['AT'] },
        note: 'Pedir AT',
      },
      randomUUID(),
    );
    expect(draft.status).toBe('DRAFT');
    expect(draft.revision).toBe(1);

    await expect(
      upsertDealRequest(
        owner,
        campaignId,
        {
          asset_id: assetId,
          desired_usage: { territories: ['AT'] },
          note: 'stale',
          expected_revision: 99,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'DEAL_REQUEST_CONFLICT' });

    const updated = await upsertDealRequest(
      owner,
      campaignId,
      {
        asset_id: assetId,
        desired_usage: { territories: ['AT'], industry: 'beauty' },
        note: 'Pedir AT y beauty',
        expected_revision: 1,
      },
      randomUUID(),
    );
    expect(updated.revision).toBe(2);

    const beforeGrant = (
      await pool.query('SELECT payload,status FROM rights_grants WHERE id=$1', [grantId])
    ).rows[0];
    const sent = await sendDealRequest(owner, campaignId, draft.id, {}, randomUUID());
    expect(sent.status).toBe('SENT');
    expect(sent.sent_at).toBeTruthy();
    const again = await sendDealRequest(owner, campaignId, draft.id, {}, randomUUID());
    expect(again.status).toBe('SENT');
    const afterGrant = (
      await pool.query('SELECT payload,status FROM rights_grants WHERE id=$1', [grantId])
    ).rows[0];
    expect(afterGrant).toEqual(beforeGrant);

    const withdrawn = await withdrawDealRequest(owner, campaignId, draft.id, {}, randomUUID());
    expect(withdrawn.status).toBe('WITHDRAWN');
  });

  it('enforces roles and closes requests when talent is removed', async () => {
    await expect(getDealBuilder(other, campaignId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      upsertDealRequest(
        employee,
        campaignId,
        { asset_id: assetId, desired_usage: {} },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await getDealBuilder(employee, campaignId)).can_edit).toBe(false);

    const draft = await upsertDealRequest(
      owner,
      campaignId,
      { asset_id: assetId, desired_usage: { territories: ['AT'] }, note: 'close-me' },
      randomUUID(),
    );
    await removeCampaignTalent(owner, campaignId, assetId, {}, randomUUID());
    const status = (
      await pool.query('SELECT status FROM campaign_deal_requests WHERE id=$1', [draft.id])
    ).rows[0].status;
    expect(status).toBe('CLOSED');
  });

  it('rejects over the 50 request limit', async () => {
    const asset2 = randomUUID();
    await pool.query('INSERT INTO assets(id,creator_id) VALUES($1,$2)', [asset2, creatorId]);
    const grant2 = randomUUID();
    const sourceId = randomUUID();
    await pool.query(
      `INSERT INTO rights_grants(id,grantor_user_id,grantee_organization_id,asset_id,source_type,source_id,payload,status,valid_from,valid_until)
      VALUES($1,$2,$3,$4,'EXISTING_AGREEMENT',$5,$6,'ACTIVE','2029-12-01','2030-06-01')`,
      [
        grant2,
        ownerId,
        org,
        asset2,
        sourceId,
        JSON.stringify({
          schema_version: 'rightsnet.rights-grant/0.1',
          grant_id: grant2,
          grantor_user_id: ownerId,
          grantee_organization_id: org,
          asset_id: asset2,
          source: { type: 'EXISTING_AGREEMENT', id: sourceId },
          rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
          industry: ['beauty'],
          territories: ['DE'],
          approval: {},
          valid_from: '2029-12-01T00:00:00.000Z',
          valid_until: '2030-06-01T00:00:00.000Z',
          status: 'ACTIVE',
          scope_snapshot: { channels: ['instagram'], duration_days: 30 },
        }),
      ],
    );
    const camp = await createCampaign(
      owner,
      { organization_id: org, name: 'H5 limit', creative_brief: '' },
      randomUUID(),
    );
    await addCampaignTalent(
      owner,
      camp.id,
      { asset_id: asset2, selected_grant_id: grant2 },
      randomUUID(),
    );
    for (let i = 0; i < 50; i++) {
      await pool.query(
        `INSERT INTO campaign_deal_requests(
           id,campaign_id,organization_id,asset_id,selected_grant_id,status,gaps,desired_usage,note,revision,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,'WITHDRAWN','[]','{}','',1,$6,$6)`,
        [randomUUID(), camp.id, org, asset2, grant2, ownerId],
      );
    }
    await expect(
      upsertDealRequest(
        owner,
        camp.id,
        { asset_id: asset2, desired_usage: {} },
        randomUUID(),
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      upsertDealRequest(
        owner,
        camp.id,
        { asset_id: asset2, desired_usage: {} },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'DEAL_REQUEST_LIMIT' });
  });
});
