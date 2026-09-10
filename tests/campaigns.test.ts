import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
} from '../apps/api/src/modules/campaigns.js';

describe('Campaign H1 persistence and boundaries', () => {
  let owner: Actor, other: Actor, employee: Actor, viewer: Actor;
  const body = {
    organization_id: demoIds.org,
    name: 'Campaign fixture',
    creative_brief: 'Private brief',
  };
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Test DB required');
    await migrate();
    await seed();
    const users = (await pool.query('SELECT * FROM users')).rows;
    owner = users.find((u) => u.id === demoIds.buyer);
    other = users.find((u) => u.id === demoIds.other);
    for (const role of ['employee', 'viewer']) {
      const id = randomUUID();
      const user = (
        await pool.query(
          "INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,'buyer') RETURNING *",
          [id, id + '@example.test', role],
        )
      ).rows[0];
      await pool.query('INSERT INTO organization_members VALUES($1,$2,$3)', [
        demoIds.org,
        id,
        role,
      ]);
      if (role === 'employee') employee = user;
      else viewer = user;
    }
  });
  afterAll(() => pool.end());
  it('persists drafts with one audit event across retries; rejects mismatched retry', async () => {
    const key = randomUUID();
    const created = await createCampaign(owner, body, key);
    const retry = await createCampaign(owner, body, key);
    expect(retry.id).toBe(created.id);
    const fetched = await getCampaign(owner, created.id);
    expect(fetched).toMatchObject({
      name: body.name,
      creative_brief: body.creative_brief,
      revision: 1,
      status: 'DRAFT',
      clearance_status: 'NOT_EVALUATED',
    });
    expect(fetched.activity).toHaveLength(1);
    await expect(createCampaign(owner, { ...body, name: 'Changed' }, key)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
  it('enforces isolation and owner-only writes including cached responses', async () => {
    const key = randomUUID();
    const created = await createCampaign(owner, body, key);
    for (const user of [other, viewer]) {
      await expect(getCampaign(user, created.id)).rejects.toMatchObject({ status: 404 });
      await expect(listCampaigns(user, { organization_id: demoIds.org })).rejects.toMatchObject({
        status: 404,
      });
      await expect(createCampaign(user, body, randomUUID())).rejects.toMatchObject({ status: 404 });
      await expect(
        updateCampaign(
          user,
          created.id,
          { name: 'hack', creative_brief: '', expected_revision: 1 },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect((await getCampaign(employee, created.id)).can_edit).toBe(false);
    await expect(createCampaign(employee, body, randomUUID())).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      updateCampaign(
        employee,
        created.id,
        { name: 'hack', creative_brief: '', expected_revision: 1 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await pool.query(
      "UPDATE organization_members SET role='employee' WHERE organization_id=$1 AND user_id=$2",
      [demoIds.org, owner.id],
    );
    try {
      await expect(createCampaign(owner, body, key)).rejects.toMatchObject({ status: 403 });
    } finally {
      await pool.query(
        "UPDATE organization_members SET role='owner' WHERE organization_id=$1 AND user_id=$2",
        [demoIds.org, owner.id],
      );
    }
  });
  it('concurrent edits permit one winner, roll back loser audit, retry is idempotent', async () => {
    const created = await createCampaign(owner, body, randomUUID());
    const edit = { name: 'Revised', creative_brief: 'Second version', expected_revision: 1 };
    const keys = [randomUUID(), randomUUID()];
    const results = await Promise.allSettled(
      keys.map((key) => updateCampaign(owner, created.id, edit, key)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason.code).toBe('CAMPAIGN_CONFLICT');
    const winner = results.findIndex((r) => r.status === 'fulfilled');
    expect((await updateCampaign(owner, created.id, edit, keys[winner])).revision).toBe(2);
    const fetched = await getCampaign(owner, created.id);
    expect(fetched.activity).toHaveLength(2);
    expect(fetched.creative_brief).toBe('Second version');
  });
  it('rejects malformed, authority fields, organization reassignment and missing idempotency', async () => {
    for (const bad of [
      { ...body, name: ' ' },
      { ...body, creative_brief: 'x'.repeat(10001) },
      { ...body, status: 'ACTIVE' },
      { ...body, clearance_status: 'ALLOW' },
    ]) {
      await expect(createCampaign(owner, bad, randomUUID())).rejects.toThrow();
    }
    await expect(createCampaign(owner, body)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    const created = await createCampaign(owner, body, randomUUID());
    await expect(
      updateCampaign(
        owner,
        created.id,
        { name: 'a', creative_brief: '', expected_revision: 1, organization_id: demoIds.otherOrg },
        randomUUID(),
      ),
    ).rejects.toThrow();
    await expect(getCampaign(owner, 'invalid')).rejects.toThrow();
  });
  it('paginates deterministically and does not list another org campaign', async () => {
    const foreign = await createCampaign(
      other,
      { ...body, organization_id: demoIds.otherOrg },
      randomUUID(),
    );
    const first = await listCampaigns(owner, { organization_id: demoIds.org, limit: 1 });
    const second = await listCampaigns(owner, {
      organization_id: demoIds.org,
      limit: 1,
      offset: first.next_offset,
    });
    expect(first.items[0].id).not.toBe(second.items[0].id);
    expect(first.items[0].id).not.toBe(foreign.id);
    await expect(
      listCampaigns(owner, { organization_id: demoIds.org, limit: 1000 }),
    ).rejects.toThrow();
  });
});
