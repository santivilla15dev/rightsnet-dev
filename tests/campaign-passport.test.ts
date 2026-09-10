import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import { createCampaign } from '../apps/api/src/modules/campaigns.js';
import {
  issueCampaignPassport,
  listCampaignPassports,
  revokeCampaignPassport,
  publicVerifyCampaignPassport,
} from '../apps/api/src/modules/campaign-passport.js';
import { DomainError } from '../packages/domain/src/index.js';

const org = randomUUID(),
  ownerId = randomUUID(),
  employeeId = randomUUID(),
  otherId = randomUUID();
let owner: Actor, employee: Actor, other: Actor, campaignId: string;

async function addUser(id: string, role: string) {
  return (
    await pool.query(
      'INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,$4) RETURNING *',
      [id, `${id}@h6.test`, `H6 ${role}`, role],
    )
  ).rows[0] as Actor;
}

describe('H6 campaign passport', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Test DB required');
    await migrate();
    owner = await addUser(ownerId, 'buyer');
    employee = await addUser(employeeId, 'buyer');
    other = await addUser(otherId, 'buyer');
    await pool.query("INSERT INTO organizations(id,legal_name,country) VALUES($1,'H6 Org','DE')", [
      org,
    ]);
    await pool.query('INSERT INTO organization_members VALUES($1,$2,$3),($1,$4,$5)', [
      org,
      ownerId,
      'owner',
      employeeId,
      'employee',
    ]);
    campaignId = (
      await createCampaign(
        owner,
        { organization_id: org, name: 'H6 passport campaign', creative_brief: '' },
        randomUUID(),
      )
    ).id;
  });
  afterAll(() => pool.end());

  it('issues, verifies publicly without private fields, and revokes to generic 404', async () => {
    const expires = new Date(Date.now() + 3 * 86400000).toISOString();
    const issued = await issueCampaignPassport(
      owner,
      campaignId,
      {
        allowlist: [{ type: 'email', value: 'Partner@Example.com' }],
        expires_at: expires,
        label: 'Review',
      },
      randomUUID(),
    );
    expect(issued.public_token).toMatch(/^RN-PAS-\d{4}-\d{6}$/);
    expect(issued.allowlist[0].value).toBe('partner@example.com');
    expect(issued.verify_path).toContain(issued.public_token);

    const pub = await publicVerifyCampaignPassport(issued.public_token);
    expect(pub).toMatchObject({
      token: issued.public_token,
      status: 'ACTIVE',
      campaign: { id: campaignId, name: 'H6 passport campaign' },
      flags: { authority: false, media_verified: false, legal_clearance: false },
    });
    expect(pub).not.toHaveProperty('allowlist');
    expect(pub).not.toHaveProperty('gaps');
    expect(pub).not.toHaveProperty('usage');
    expect(JSON.stringify(pub)).not.toMatch(/signature|uri|note/i);

    const listed = await listCampaignPassports(employee, campaignId);
    expect(listed.can_edit).toBe(false);
    expect(listed.items.some((i) => i.id === issued.id)).toBe(true);

    await expect(
      issueCampaignPassport(
        employee,
        campaignId,
        {
          allowlist: [{ type: 'email', value: 'x@y.com' }],
          expires_at: expires,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listCampaignPassports(other, campaignId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const revoked = await revokeCampaignPassport(owner, campaignId, issued.id, {}, randomUUID());
    expect(revoked.status).toBe('REVOKED');
    await expect(publicVerifyCampaignPassport(issued.public_token)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const again = await revokeCampaignPassport(owner, campaignId, issued.id, {}, randomUUID());
    expect(again.status).toBe('REVOKED');
  });

  it('rejects empty allowlist, overlong expiry, and enforces active limit', async () => {
    const far = new Date(Date.now() + 40 * 86400000).toISOString();
    await expect(
      issueCampaignPassport(
        owner,
        campaignId,
        { allowlist: [], expires_at: new Date(Date.now() + 86400000).toISOString() },
        randomUUID(),
      ),
    ).rejects.toThrow();
    await expect(
      issueCampaignPassport(
        owner,
        campaignId,
        {
          allowlist: [{ type: 'email', value: 'a@b.com' }],
          expires_at: far,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const camp = await createCampaign(
      owner,
      { organization_id: org, name: 'H6 limit', creative_brief: '' },
      randomUUID(),
    );
    const expires = new Date(Date.now() + 2 * 86400000).toISOString();
    for (let i = 0; i < 10; i++) {
      await issueCampaignPassport(
        owner,
        camp.id,
        {
          allowlist: [{ type: 'email', value: `u${i}@ex.com` }],
          expires_at: expires,
        },
        randomUUID(),
      );
    }
    await expect(
      issueCampaignPassport(
        owner,
        camp.id,
        {
          allowlist: [{ type: 'email', value: 'overflow@ex.com' }],
          expires_at: expires,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PASSPORT_LIMIT' });
  });

  it('treats expired passports as generic 404', async () => {
    const issued = await issueCampaignPassport(
      owner,
      campaignId,
      {
        allowlist: [{ type: 'email', value: 'expire@ex.com' }],
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
      randomUUID(),
    );
    await pool.query(`UPDATE campaign_passports SET expires_at=now() - interval '1 minute' WHERE id=$1`, [
      issued.id,
    ]);
    await expect(publicVerifyCampaignPassport(issued.public_token)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
