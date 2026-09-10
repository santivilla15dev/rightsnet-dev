import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { buildMarketplaceGrantPayload } from '../packages/domain/src/index.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { createCampaign, getCampaign } from '../apps/api/src/modules/campaigns.js';
import { updateCampaignUsage } from '../apps/api/src/modules/campaign-clearance.js';
import {
  addCampaignTalent,
  removeCampaignTalent,
} from '../apps/api/src/modules/talent-inventory.js';
import { mintRnAuthToken } from '../apps/api/src/modules/generation-auth.js';
import { platformReportOutput } from '../apps/api/src/modules/report-output.js';
import {
  changeCampaignEvidence,
  getCampaignFlight,
} from '../apps/api/src/modules/campaign-flight.js';

const now = new Date('2030-01-01T00:00:00.000Z');
let owner: Actor, employee: Actor, outsider: Actor;
const org = randomUUID(),
  creator = randomUUID();
async function user() {
  const id = randomUUID();
  return (
    await pool.query(
      "INSERT INTO users(id,email,display_name,role) VALUES($1,$2,'H4 fixture','buyer') RETURNING *",
      [id, id + '@h4.test'],
    )
  ).rows[0] as Actor;
}
async function fixture(territory = 'DE') {
  const asset = randomUUID(),
    grant = randomUUID();
  await pool.query('INSERT INTO assets(id,creator_id) VALUES($1,$2)', [asset, creator]);
  const payload = buildMarketplaceGrantPayload({
    grantId: grant,
    grantorUserId: owner.id,
    granteeOrganizationId: org,
    assetId: asset,
    licenseId: randomUUID(),
    validFrom: '2029-01-01T00:00:00.000Z',
    validUntil: '2031-01-01T00:00:00.000Z',
    status: 'ACTIVE',
    scope: {
      operation: 'synthetic_video',
      purpose: 'commercial_advertising',
      industry: 'beauty',
      territories: ['DE'],
      channels: ['instagram'],
      duration_days: 30,
    },
  });
  await pool.query(
    `INSERT INTO rights_grants(id,grantor_user_id,grantee_organization_id,asset_id,source_type,source_id,payload,status,valid_from,valid_until) VALUES($1,$2,$3,$4,'MARKETPLACE_LICENSE',$5,$6,'ACTIVE',$7,$8)`,
    [
      grant,
      owner.id,
      org,
      asset,
      payload.source.id,
      JSON.stringify(payload),
      payload.valid_from,
      payload.valid_until,
    ],
  );
  const campaign = (
    await createCampaign(
      owner,
      { organization_id: org, name: 'H4 fixture', creative_brief: '' },
      randomUUID(),
    )
  ).id;
  await addCampaignTalent(
    owner,
    campaign,
    { asset_id: asset, selected_grant_id: grant },
    randomUUID(),
  );
  await updateCampaignUsage(
    owner,
    campaign,
    {
      expected_revision: 2,
      usage: {
        industry: 'beauty',
        operation: 'synthetic_video',
        purpose: 'commercial_advertising',
        territories: ['DE'],
        channels: ['instagram'],
        duration_days: 30,
        start_at: '2030-01-02T00:00:00.000Z',
      },
    },
    randomUUID(),
  );
  const token = await mintRnAuthToken({
    grantId: grant,
    organizationId: org,
    assetId: asset,
    provider: 'higgsfield',
    use: {
      content_type: 'synthetic_video',
      purpose: 'commercial_advertising',
      industry: 'beauty',
      territory,
    },
    grantValidUntil: payload.valid_until,
    now,
  });
  return { campaign, asset, grant, token };
}
async function output(f: Awaited<ReturnType<typeof fixture>>) {
  return platformReportOutput(
    {
      auth_id: f.token.payload.auth_id,
      organization_id: org,
      provider: 'higgsfield',
      output: {
        content_type: 'synthetic_video',
        uri: 'https://private.example/secret',
        sha256: 'a'.repeat(64),
      },
      notes: 'PRIVATE NOTE',
    },
    new Date(now.getTime() + 10000),
  );
}
describe('H4 campaign evidence preflight and postflight', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Test DB required');
    await migrate();
    owner = await user();
    employee = await user();
    outsider = await user();
    await pool.query("INSERT INTO organizations(id,legal_name,country) VALUES($1,'H4 org','DE')", [
      org,
    ]);
    await pool.query("INSERT INTO organization_members VALUES($1,$2,'owner'),($1,$3,'employee')", [
      org,
      owner.id,
      employee.id,
    ]);
    await pool.query(
      "INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES($1,$2,'H4 Talent','fixture','DE','fixture.svg')",
      [creator, owner.id],
    );
  });
  afterAll(() => pool.end());
  it('requires explicit authority and reads without consuming or minting', async () => {
    const f = await fixture();
    expect((await getCampaignFlight(owner, f.campaign, now)).preflight.status).toBe('INCOMPLETE');
    const key = randomUUID(),
      body = { kind: 'AUTH', evidence_id: f.token.payload.auth_id };
    await changeCampaignEvidence(owner, f.campaign, body, key);
    await changeCampaignEvidence(owner, f.campaign, body, key);
    await changeCampaignEvidence(owner, f.campaign, body, randomUUID());
    const result = await getCampaignFlight(employee, f.campaign, now);
    expect(result.preflight.status).toBe('ALLOW');
    expect(result.revision).toBe(4);
    expect(
      (await pool.query('SELECT status FROM generation_auths WHERE id=$1', [body.evidence_id]))
        .rows[0].status,
    ).toBe('ISSUED');
    expect(JSON.stringify(result)).not.toContain(f.token.signature);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM audit_events WHERE resource_id=$1 AND action='campaign.evidence_added'",
          [f.campaign],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('enforces org and owner boundaries, including cached retries', async () => {
    const f = await fixture(),
      body = { kind: 'AUTH', evidence_id: f.token.payload.auth_id },
      key = randomUUID();
    await expect(getCampaignFlight(outsider, f.campaign, now)).rejects.toMatchObject({
      status: 404,
    });
    await expect(changeCampaignEvidence(employee, f.campaign, body, key)).rejects.toMatchObject({
      status: 403,
    });
    const other = await fixture();
    await expect(
      changeCampaignEvidence(
        owner,
        f.campaign,
        { kind: 'AUTH', evidence_id: other.token.payload.auth_id },
        key,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await changeCampaignEvidence(owner, f.campaign, body, key);
    await pool.query(
      "UPDATE organization_members SET role='employee' WHERE user_id=$1 AND organization_id=$2",
      [owner.id, org],
    );
    try {
      await expect(changeCampaignEvidence(owner, f.campaign, body, key)).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      await pool.query(
        "UPDATE organization_members SET role='owner' WHERE user_id=$1 AND organization_id=$2",
        [owner.id, org],
      );
    }
  });
  it('blocks expired authority and mismatched use', async () => {
    const f = await fixture('AT');
    await changeCampaignEvidence(
      owner,
      f.campaign,
      { kind: 'AUTH', evidence_id: f.token.payload.auth_id },
      randomUUID(),
    );
    expect(
      (await getCampaignFlight(owner, f.campaign, now)).authorizations[0].checks,
    ).toContainEqual({ status: 'DENY', reason: 'USE_MISMATCH' });
    const expired = await getCampaignFlight(owner, f.campaign, new Date(now.getTime() + 7200000));
    expect(expired.authorizations[0].checks).toContainEqual({ status: 'DENY', reason: 'EXPIRED' });
  });
  it('verifies recorded output after token expiry without exposing private media', async () => {
    const f = await fixture(),
      record = await output(f);
    await changeCampaignEvidence(
      owner,
      f.campaign,
      { kind: 'OUTPUT', evidence_id: record.generation_id },
      randomUUID(),
    );
    const result = await getCampaignFlight(owner, f.campaign, new Date('2030-01-03T00:00:00.000Z'));
    expect(result.outputs[0]).toMatchObject({
      status: 'ALLOW',
      media_verified: false,
      sha256: 'a'.repeat(64),
    });
    expect(result.postflight.status).toBe('ALLOW');
    expect(JSON.stringify(result)).not.toMatch(/private\.example|PRIVATE NOTE|signature/);
    await pool.query("UPDATE rights_grants SET status='REVOKED' WHERE id=$1", [f.grant]);
    expect(
      (await getCampaignFlight(owner, f.campaign, new Date('2030-01-03T00:00:00.000Z'))).outputs[0]
        .status,
    ).toBe('DENY');
  });
  it('marks stale links and removes only the association', async () => {
    const f = await fixture(),
      body = { kind: 'AUTH', evidence_id: f.token.payload.auth_id };
    await changeCampaignEvidence(owner, f.campaign, body, randomUUID());
    await removeCampaignTalent(owner, f.campaign, f.asset, {}, randomUUID());
    expect((await getCampaignFlight(owner, f.campaign, now)).preflight.checks).toContainEqual({
      status: 'DENY',
      reason: 'STALE_LINK',
    });
    await changeCampaignEvidence(owner, f.campaign, body, randomUUID(), true);
    expect((await getCampaignFlight(owner, f.campaign, now)).authorizations).toHaveLength(0);
    expect(
      (await pool.query('SELECT status FROM generation_auths WHERE id=$1', [body.evidence_id]))
        .rows[0].status,
    ).toBe('ISSUED');
    expect((await getCampaign(owner, f.campaign)).activity[0].action).toBe(
      'campaign.evidence_removed',
    );
  });
  it('rejects tampered signatures and checks campaign end', async () => {
    const f = await fixture(),
      record = await output(f);
    await changeCampaignEvidence(
      owner,
      f.campaign,
      { kind: 'OUTPUT', evidence_id: record.generation_id },
      randomUUID(),
    );
    const ended = await getCampaignFlight(owner, f.campaign, new Date('2030-02-01T00:00:00.000Z'));
    expect(ended.outputs[0].checks).toContainEqual({ status: 'DENY', reason: 'CAMPAIGN_ENDED' });
    await pool.query("UPDATE generation_auths SET signature='invalid' WHERE id=$1", [
      f.token.payload.auth_id,
    ]);
    expect((await getCampaignFlight(owner, f.campaign, now)).outputs[0].checks).toContainEqual({
      status: 'DENY',
      reason: 'OUTPUT_EVIDENCE_INVALID',
    });
  });
  it('keeps multiterritory authority incomplete and mismatched output denied', async () => {
    const f = await fixture('AT');
    const record = await output(f);
    await changeCampaignEvidence(
      owner,
      f.campaign,
      { kind: 'OUTPUT', evidence_id: record.generation_id },
      randomUUID(),
    );
    const mismatch = await getCampaignFlight(owner, f.campaign, new Date(now.getTime() + 20000));
    expect(mismatch.outputs[0].checks).toContainEqual({ status: 'DENY', reason: 'USE_MISMATCH' });
    const campaign = await getCampaign(owner, f.campaign);
    await updateCampaignUsage(
      owner,
      f.campaign,
      {
        expected_revision: campaign.revision,
        usage: { ...campaign.usage, territories: ['DE', 'AT'] },
      },
      randomUUID(),
    );
    const multiple = await getCampaignFlight(owner, f.campaign, new Date(now.getTime() + 20000));
    expect(multiple.outputs[0].checks).toContainEqual({
      status: 'INCOMPLETE',
      reason: 'AUTH_SINGLE_TERRITORY_ONLY',
    });
  });
  it('exposes missing references and enforces the evidence cap without truncation', async () => {
    const f = await fixture();
    const ids = Array.from({ length: 100 }, () => randomUUID());
    await pool.query(
      "INSERT INTO campaign_evidence(campaign_id,kind,evidence_id,added_by) SELECT $1,'AUTH',unnest($2::uuid[]),$3",
      [f.campaign, ids, owner.id],
    );
    const result = await getCampaignFlight(owner, f.campaign, now);
    expect(result.authorizations).toHaveLength(100);
    expect(result.preflight.checks).toContainEqual({
      status: 'INCOMPLETE',
      reason: 'MISSING_EVIDENCE',
    });
    await expect(
      changeCampaignEvidence(
        owner,
        f.campaign,
        { kind: 'AUTH', evidence_id: f.token.payload.auth_id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'EVIDENCE_LIMIT' });
    await changeCampaignEvidence(
      owner,
      f.campaign,
      { kind: 'AUTH', evidence_id: ids[0] },
      randomUUID(),
      true,
    );
    await changeCampaignEvidence(
      owner,
      f.campaign,
      { kind: 'AUTH', evidence_id: f.token.payload.auth_id },
      randomUUID(),
    );
    expect((await getCampaignFlight(owner, f.campaign, now)).preflight.status).toBe('INCOMPLETE');
  });
});
