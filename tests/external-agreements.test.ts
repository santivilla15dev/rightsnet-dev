import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import {
  buildExternalAgreementGrantPayload,
  ExternalProposedRightsSchema,
} from '../packages/domain/src/index.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import {
  confirmExternalAgreement,
  createExternalAgreement,
  listExternalAgreements,
} from '../apps/api/src/modules/external-agreements.js';
import { listRightsGrants } from '../apps/api/src/modules/rights-grants.js';

describe('Existing Deal ingest → RightsGrant', () => {
  let admin: Actor;
  let assetId: string;
  let policySha: string;

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
    assetId = (
      await pool.query(
        `SELECT a.id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE c.user_id=$1 LIMIT 1`,
        [demoIds.creator],
      )
    ).rows[0].id;
    policySha = (
      await pool.query(
        `SELECT p.sha256 FROM policies p JOIN assets a ON a.policy_id=p.id WHERE a.id=$1`,
        [assetId],
      )
    ).rows[0].sha256;
  });

  afterAll(() => pool.end());

  it('buildExternalAgreementGrantPayload is EXISTING_AGREEMENT and does not need policy', () => {
    const proposed = ExternalProposedRightsSchema.parse({
      rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
      industry: ['beauty'],
      territories: ['DE'],
      approval: {},
      valid_from: new Date().toISOString(),
      valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
    });
    const payload = buildExternalAgreementGrantPayload({
      grantId: randomUUID(),
      grantorUserId: demoIds.creator,
      granteeOrganizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      agreementId: randomUUID(),
      status: 'ACTIVE',
      proposed,
    });
    expect(payload.source.type).toBe('EXISTING_AGREEMENT');
    expect(payload.industry).toEqual(['beauty']);
  });

  it('create → confirm projects grant; re-confirm idempotent; other org empty; policy untouched', async () => {
    const proposed = {
      rights: {
        synthetic_video: 'ALLOW',
        synthetic_image: 'ALLOW',
        commercial_advertising: 'ALLOW',
      },
      industry: ['beauty'],
      territories: ['DE'],
      approval: { creative_approval: 'REQUIRED' },
      valid_from: new Date(Date.now() + 86400000).toISOString(),
      valid_until: new Date(Date.now() + 86400000 * 120).toISOString(),
    };

    const created = await transaction((db) =>
      createExternalAgreement(db, admin, {
        organization_id: demoIds.org,
        asset_id: assetId,
        title: 'Test Existing Deal Nike-shaped',
        external_ref: 'TEST-AGR-' + randomUUID().slice(0, 8),
        status: 'pending_confirm',
        proposed_rights: proposed,
      }),
    );
    expect(created.status).toBe('pending_confirm');

    const first = await transaction((db) => confirmExternalAgreement(db, admin, created.id));
    expect(first.idempotent).toBe(false);
    expect(first.agreement.status).toBe('confirmed');
    expect(first.grant.source_type).toBe('EXISTING_AGREEMENT');
    expect(first.grant.grantee_organization_id).toBe(demoIds.org);
    expect(first.grant.asset_id).toBe(assetId);
    expect(first.grant.status).toBe('ACTIVE');

    const second = await transaction((db) => confirmExternalAgreement(db, admin, created.id));
    expect(second.idempotent).toBe(true);
    expect(second.grant.id).toBe(first.grant.id);

    const count = (
      await pool.query(
        "SELECT count(*)::int AS n FROM rights_grants WHERE source_type='EXISTING_AGREEMENT' AND source_id=$1",
        [created.id],
      )
    ).rows[0].n;
    expect(count).toBe(1);

    const nike = await listRightsGrants({ organization_id: demoIds.org, asset_id: assetId });
    expect(
      nike.items.some(
        (g: { source_type: string; source_id: string }) =>
          g.source_type === 'EXISTING_AGREEMENT' && g.source_id === created.id,
      ),
    ).toBe(true);

    const adidas = await listRightsGrants({
      organization_id: demoIds.otherOrg,
      asset_id: assetId,
    });
    expect(
      adidas.items.filter(
        (g: { source_type: string; source_id: string }) =>
          g.source_type === 'EXISTING_AGREEMENT' && g.source_id === created.id,
      ),
    ).toHaveLength(0);

    const shaAfter = (
      await pool.query(
        `SELECT p.sha256 FROM policies p JOIN assets a ON a.policy_id=p.id WHERE a.id=$1`,
        [assetId],
      )
    ).rows[0].sha256;
    expect(shaAfter).toBe(policySha);

    const listed = await listExternalAgreements({ organization_id: demoIds.org });
    expect(listed.items.some((a: { id: string }) => a.id === created.id)).toBe(true);
  });

  it('seed fixture confirms EXISTING_AGREEMENT for demo org', async () => {
    const row = (
      await pool.query('SELECT * FROM external_agreements WHERE id=$1', [demoIds.externalAgreement])
    ).rows[0];
    expect(row?.status).toBe('confirmed');
    const grant = (
      await pool.query(
        "SELECT * FROM rights_grants WHERE source_type='EXISTING_AGREEMENT' AND source_id=$1",
        [demoIds.externalAgreement],
      )
    ).rows[0];
    expect(grant?.grantee_organization_id).toBe(demoIds.org);
    expect(grant?.status).toBe('ACTIVE');
  });
});
