import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { createCampaign, getCampaign } from '../apps/api/src/modules/campaigns.js';
import {
  talentInventory,
  campaignTalent,
  addCampaignTalent,
  removeCampaignTalent,
  grantTemporalStatus,
} from '../apps/api/src/modules/talent-inventory.js';

const now = new Date('2030-01-01T00:00:00Z');
const org = randomUUID(),
  otherOrg = randomUUID(),
  creator = randomUUID();
const asset = randomUUID(),
  pendingAsset = randomUUID(),
  foreignAsset = randomUUID();
const current = randomUUID(),
  expired = randomUUID(),
  foreign = randomUUID();
let owner: Actor, employee: Actor, outsider: Actor, viewer: Actor;
let campaign: string;
async function user(role: string): Promise<Actor> {
  const id = randomUUID();
  return (
    await pool.query(
      'INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,$4) RETURNING *',
      [id, id + '@example.test', 'H2 ' + id, role],
    )
  ).rows[0];
}
async function grant(
  id: string,
  orgId: string,
  assetId: string,
  source: string,
  from: string,
  until: string,
  status = 'ACTIVE',
) {
  await pool.query(
    `INSERT INTO rights_grants(id,grantor_user_id,grantee_organization_id,asset_id,source_type,source_id,payload,status,valid_from,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      creator,
      orgId,
      assetId,
      source,
      randomUUID(),
      JSON.stringify({
        rights: { synthetic_video: 'ALLOW' },
        territories: ['DE'],
        industry: ['beauty'],
        approval: {},
        scope_snapshot: { channels: ['instagram'] },
        private_secret: 'never-return',
      }),
      status,
      from,
      until,
    ],
  );
}

describe('H2 talent inventory and explicit campaign links', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Test DB required');
    await migrate();
    owner = await user('buyer');
    employee = await user('buyer');
    outsider = await user('buyer');
    viewer = await user('viewer');
    await pool.query(
      "INSERT INTO users(id,email,display_name,role) VALUES($1,$2,'H2 creator','creator')",
      [creator, creator + '@example.test'],
    );
    for (const id of [org, otherOrg])
      await pool.query(
        "INSERT INTO organizations(id,legal_name,country) VALUES($1,'H2 organization','DE')",
        [id],
      );
    for (const [u, o, r] of [
      [owner.id, org, 'owner'],
      [employee.id, org, 'employee'],
      [viewer.id, org, 'viewer'],
      [outsider.id, otherOrg, 'owner'],
    ])
      await pool.query('INSERT INTO organization_members VALUES($1,$2,$3)', [o, u, r]);
    const cid = randomUUID();
    await pool.query(
      "INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES($1,$2,'H2 Talent Fixture','H2 fixture','DE','fixture.svg')",
      [cid, creator],
    );
    for (const id of [asset, pendingAsset, foreignAsset])
      await pool.query('INSERT INTO assets(id,creator_id) VALUES($1,$2)', [id, cid]);
    await grant(
      current,
      org,
      asset,
      'EXISTING_AGREEMENT',
      '2029-12-01T00:00:00Z',
      '2030-01-20T00:00:00Z',
    );
    await grant(
      expired,
      org,
      asset,
      'MARKETPLACE_LICENSE',
      '2029-01-01T00:00:00Z',
      '2030-01-01T00:00:00Z',
    );
    await grant(
      foreign,
      otherOrg,
      foreignAsset,
      'EXISTING_AGREEMENT',
      '2029-01-01T00:00:00Z',
      '2031-01-01T00:00:00Z',
    );
    await pool.query(
      "INSERT INTO external_agreements(id,organization_id,asset_id,grantor_user_id,status,title,proposed_rights) VALUES($1,$2,$3,$4,'pending_confirm','private title','{}')",
      [randomUUID(), org, pendingAsset, creator],
    );
    campaign = (
      await createCampaign(
        owner,
        { organization_id: org, name: 'H2 campaign', creative_brief: '' },
        randomUUID(),
      )
    ).id;
  });
  afterAll(() => pool.end());
  it('uses exact inclusive start/exclusive end and authoritative status', () => {
    const g = { status: 'ACTIVE', valid_from: now, valid_until: '2030-02-01T00:00:00Z' };
    expect(grantTemporalStatus(g, now)).toBe('CURRENT');
    expect(grantTemporalStatus({ ...g, valid_until: now }, now)).toBe('EXPIRED');
    expect(grantTemporalStatus({ ...g, valid_from: '2030-01-01T00:00:00.001Z' }, now)).toBe(
      'SCHEDULED',
    );
    for (const status of ['REVOKED', 'SUSPENDED', 'EXPIRED'])
      expect(grantTemporalStatus({ ...g, status }, now)).toBe(status);
  });
  it('deduplicates assets, exposes references and omits sensitive payload fields', async () => {
    const result = await talentInventory(owner, { organization_id: org }, now);
    expect(result.items).toHaveLength(2);
    const item = result.items.find((i) => i.asset_id === asset)!;
    expect(item.grants).toHaveLength(2);
    expect(item.grants.find((g) => g.id === current)).toMatchObject({
      temporal_status: 'CURRENT',
      channels: ['instagram'],
    });
    expect(JSON.stringify(result)).not.toContain('private_secret');
    expect(JSON.stringify(result)).not.toContain('private title');
    expect(JSON.stringify(result)).not.toContain(foreign);
    const pending = result.items.find((i) => i.asset_id === pendingAsset)!;
    expect(pending.pending_agreements).toBe(1);
    expect(pending.grants).toEqual([]);
  });
  it('filters current rights within the chosen origin, pending has no authority', async () => {
    const query = { organization_id: org, availability: 'current' };
    expect((await talentInventory(owner, query, now)).items.map((i) => i.asset_id)).toEqual([
      asset,
    ]);
    expect((await talentInventory(owner, { ...query, source: 'marketplace' }, now)).items).toEqual(
      [],
    );
    expect(
      (await talentInventory(owner, { ...query, source: 'existing' }, now)).items,
    ).toHaveLength(1);
    expect(
      (await talentInventory(owner, { organization_id: org, availability: 'expiring' }, now)).items,
    ).toHaveLength(1);
    expect(
      (
        await talentInventory(owner, { organization_id: org, availability: 'not_current' }, now)
      ).items.map((i) => i.asset_id),
    ).toEqual([pendingAsset]);
  });
  it('validates filters and paginates without duplicate assets', async () => {
    const first = await talentInventory(owner, { organization_id: org, limit: 1 }, now);
    const next = await talentInventory(
      owner,
      { organization_id: org, limit: 1, offset: first.next_offset },
      now,
    );
    expect(first.items[0].asset_id).not.toBe(next.items[0].asset_id);
    expect(next.next_offset).toBeNull();
    expect(
      (await talentInventory(owner, { organization_id: org, q: 'missing talent' }, now)).items,
    ).toEqual([]);
    await expect(
      talentInventory(owner, { organization_id: org, availability: 'ALLOW' }, now),
    ).rejects.toThrow();
  });
  it('enforces organization isolation, employee reads and owner writes', async () => {
    for (const actor of [outsider, viewer]) {
      await expect(talentInventory(actor, { organization_id: org }, now)).rejects.toMatchObject({
        status: 404,
      });
      await expect(campaignTalent(actor, campaign)).rejects.toMatchObject({ status: 404 });
      await expect(
        addCampaignTalent(actor, campaign, { asset_id: asset }, randomUUID()),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect((await talentInventory(employee, { organization_id: org }, now)).items).toHaveLength(2);
    await expect(
      addCampaignTalent(employee, campaign, { asset_id: asset }, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      removeCampaignTalent(employee, campaign, asset, {}, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('rejects foreign hidden assets and mismatched grant organization or asset', async () => {
    await expect(
      addCampaignTalent(owner, campaign, { asset_id: foreignAsset }, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      addCampaignTalent(
        owner,
        campaign,
        { asset_id: asset, selected_grant_id: foreign },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      addCampaignTalent(
        owner,
        campaign,
        { asset_id: pendingAsset, selected_grant_id: current },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      addCampaignTalent(owner, campaign, { asset_id: asset, decision: 'ALLOW' }, randomUUID()),
    ).rejects.toThrow();
  });
  it('idempotently links explicit grant and updates revision/audit once', async () => {
    const key = randomUUID();
    const body = { asset_id: asset, selected_grant_id: current };
    await addCampaignTalent(owner, campaign, body, key);
    await addCampaignTalent(owner, campaign, body, key);
    await addCampaignTalent(owner, campaign, body, randomUUID());
    const list = await campaignTalent(owner, campaign, {}, now);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].selected_grant?.id).toBe(current);
    expect(list.revision).toBe(2);
    expect(
      (await getCampaign(owner, campaign)).activity.filter(
        (e: { action: string }) => e.action === 'campaign.talent_added',
      ),
    ).toHaveLength(1);
    await expect(
      addCampaignTalent(
        owner,
        campaign,
        { asset_id: asset, selected_grant_id: expired },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'TALENT_ALREADY_LINKED' });
  });
  it('refreshes status from original grant and never silently replaces it', async () => {
    await pool.query("UPDATE rights_grants SET status='REVOKED' WHERE id=$1", [current]);
    const list = await campaignTalent(owner, campaign, {}, now);
    expect(list.items[0].selected_grant).toMatchObject({ id: current, temporal_status: 'REVOKED' });
    expect(
      (await talentInventory(owner, { organization_id: org, availability: 'current' }, now)).items,
    ).toEqual([]);
  });
  it('removal preserves grant and audit, can link pending without auto-confirm', async () => {
    const before = (
      await pool.query('SELECT payload,status FROM rights_grants WHERE id=$1', [current])
    ).rows[0];
    const key = randomUUID();
    await removeCampaignTalent(owner, campaign, asset, {}, key);
    await removeCampaignTalent(owner, campaign, asset, {}, key);
    expect((await campaignTalent(owner, campaign)).items).toEqual([]);
    expect(
      (await pool.query('SELECT payload,status FROM rights_grants WHERE id=$1', [current])).rows[0],
    ).toEqual(before);
    await addCampaignTalent(owner, campaign, { asset_id: pendingAsset }, randomUUID());
    const list = await campaignTalent(owner, campaign);
    expect(list.items[0].selected_grant).toBeNull();
    expect(
      (await pool.query('SELECT status FROM external_agreements WHERE asset_id=$1', [pendingAsset]))
        .rows[0].status,
    ).toBe('pending_confirm');
  });
});
