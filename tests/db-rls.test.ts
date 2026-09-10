import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { migrate, migrateConnectionString } from '../packages/db/migrate.js';
import { pool } from '../packages/db/index.js';

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test')) throw new Error('Tests require _test database');
  await migrate();
});

afterAll(async () => {
  await pool.end();
});

describe('DB RLS org pilot v0.1', () => {
  it('aísla organizations/campaigns por membership sin bypass', async () => {
    const migrateUrl = migrateConnectionString();
    const migratePool = new pg.Pool({ connectionString: migrateUrl, max: 1 });
    const appUrl = new URL(migrateUrl);
    appUrl.username = 'rightsnet_app';
    appUrl.password = '';
    const appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });

    const userA = randomUUID();
    const userB = randomUUID();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const campaignA = randomUUID();
    const campaignB = randomUUID();

    try {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query(
        `INSERT INTO users(id,email,display_name,role) VALUES
          ($1,$2,'RLS A','buyer'),
          ($3,$4,'RLS B','buyer')`,
        [userA, `rls-a-${userA}@example.com`, userB, `rls-b-${userB}@example.com`],
      );
      await migratePool.query(
        `INSERT INTO organizations(id,legal_name,country) VALUES
          ($1,'RLS Org A','AT'),
          ($2,'RLS Org B','AT')`,
        [orgA, orgB],
      );
      await migratePool.query(
        `INSERT INTO organization_members(organization_id,user_id,role) VALUES
          ($1,$2,'owner'),
          ($3,$4,'owner')`,
        [orgA, userA, orgB, userB],
      );
      await migratePool.query(
        `INSERT INTO campaigns(id,organization_id,name,creative_brief,created_by) VALUES
          ($1,$2,'Camp A','brief', $3),
          ($4,$5,'Camp B','brief', $6)`,
        [campaignA, orgA, userA, campaignB, orgB, userB],
      );

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userA]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);

        const orgs = await client.query('SELECT id FROM organizations ORDER BY legal_name');
        expect(orgs.rows.map((r) => r.id)).toEqual([orgA]);

        const camps = await client.query('SELECT id FROM campaigns ORDER BY name');
        expect(camps.rows.map((r) => r.id)).toEqual([campaignA]);

        const members = await client.query(
          'SELECT organization_id FROM organization_members ORDER BY organization_id',
        );
        expect(members.rows.map((r) => r.organization_id)).toEqual([orgA]);

        await client.query('ROLLBACK');

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', '', true)`);
        const none = await client.query('SELECT count(*)::int AS n FROM campaigns');
        expect(none.rows[0].n).toBe(0);
        await client.query('ROLLBACK');

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '1', true)`);
        const all = await client.query('SELECT count(*)::int AS n FROM campaigns WHERE id=ANY($1::uuid[])', [
          [campaignA, campaignB],
        ]);
        expect(all.rows[0].n).toBe(2);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query('DELETE FROM campaigns WHERE id=ANY($1::uuid[])', [[campaignA, campaignB]]);
      await migratePool.query('DELETE FROM organization_members WHERE organization_id=ANY($1::uuid[])', [
        [orgA, orgB],
      ]);
      await migratePool.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[orgA, orgB]]);
      await migratePool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[userA, userB]]);
      await appPool.end();
      await migratePool.end();
    }
  });

  it('aísla rights_grants y external_agreements por org o grantor', async () => {
    const migrateUrl = migrateConnectionString();
    const migratePool = new pg.Pool({ connectionString: migrateUrl, max: 1 });
    const appUrl = new URL(migrateUrl);
    appUrl.username = 'rightsnet_app';
    appUrl.password = '';
    const appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });

    const userA = randomUUID();
    const userB = randomUUID();
    const grantor = randomUUID();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const creatorId = randomUUID();
    const assetId = randomUUID();
    const grantA = randomUUID();
    const grantB = randomUUID();
    const dealA = randomUUID();
    const dealB = randomUUID();
    const now = new Date();
    const later = new Date(now.getTime() + 86400000 * 30);

    try {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query(
        `INSERT INTO users(id,email,display_name,role) VALUES
          ($1,$2,'RLS GA','buyer'),
          ($3,$4,'RLS GB','buyer'),
          ($5,$6,'RLS Grantor','creator')`,
        [
          userA,
          `rls-ga-${userA}@example.com`,
          userB,
          `rls-gb-${userB}@example.com`,
          grantor,
          `rls-g-${grantor}@example.com`,
        ],
      );
      await migratePool.query(
        `INSERT INTO organizations(id,legal_name,country) VALUES
          ($1,'RLS Grant Org A','AT'),
          ($2,'RLS Grant Org B','AT')`,
        [orgA, orgB],
      );
      await migratePool.query(
        `INSERT INTO organization_members(organization_id,user_id,role) VALUES
          ($1,$2,'owner'),
          ($3,$4,'owner')`,
        [orgA, userA, orgB, userB],
      );
      await migratePool.query(
        `INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES
          ($1,$2,'Grantor','bio','AT','x')`,
        [creatorId, grantor],
      );
      await migratePool.query(`INSERT INTO assets(id,creator_id,status) VALUES($1,$2,'published')`, [
        assetId,
        creatorId,
      ]);
      const payload = JSON.stringify({ rights: {}, territories: ['AT'] });
      await migratePool.query(
        `INSERT INTO rights_grants(
           id,grantor_user_id,grantee_organization_id,asset_id,source_type,source_id,payload,status,valid_from,valid_until)
         VALUES
           ($1,$2,$3,$4,'EXISTING_AGREEMENT',$5,$6::jsonb,'ACTIVE',$7,$8),
           ($9,$2,$10,$4,'EXISTING_AGREEMENT',$11,$6::jsonb,'ACTIVE',$7,$8)`,
        [
          grantA,
          grantor,
          orgA,
          assetId,
          dealA,
          payload,
          now.toISOString(),
          later.toISOString(),
          grantB,
          orgB,
          dealB,
        ],
      );
      await migratePool.query(
        `INSERT INTO external_agreements(
           id,organization_id,asset_id,grantor_user_id,status,title,proposed_rights)
         VALUES
           ($1,$2,$3,$4,'pending_confirm','Deal A',$5::jsonb),
           ($6,$7,$3,$4,'pending_confirm','Deal B',$5::jsonb)`,
        [dealA, orgA, assetId, grantor, payload, dealB, orgB],
      );

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userA]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);

        const grants = await client.query(
          'SELECT id FROM rights_grants WHERE id=ANY($1::uuid[]) ORDER BY id',
          [[grantA, grantB]],
        );
        expect(grants.rows.map((r) => r.id)).toEqual([grantA]);

        const deals = await client.query(
          'SELECT id FROM external_agreements WHERE id=ANY($1::uuid[]) ORDER BY id',
          [[dealA, dealB]],
        );
        expect(deals.rows.map((r) => r.id)).toEqual([dealA]);
        await client.query('ROLLBACK');

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [grantor]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);
        const asGrantor = await client.query(
          'SELECT count(*)::int AS n FROM rights_grants WHERE id=ANY($1::uuid[])',
          [[grantA, grantB]],
        );
        expect(asGrantor.rows[0].n).toBe(2);
        const dealsGrantor = await client.query(
          'SELECT count(*)::int AS n FROM external_agreements WHERE id=ANY($1::uuid[])',
          [[dealA, dealB]],
        );
        expect(dealsGrantor.rows[0].n).toBe(2);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query('DELETE FROM rights_grants WHERE id=ANY($1::uuid[])', [[grantA, grantB]]);
      await migratePool.query('DELETE FROM external_agreements WHERE id=ANY($1::uuid[])', [
        [dealA, dealB],
      ]);
      await migratePool.query('DELETE FROM assets WHERE id=$1', [assetId]);
      await migratePool.query('DELETE FROM creators WHERE id=$1', [creatorId]);
      await migratePool.query('DELETE FROM organization_members WHERE organization_id=ANY($1::uuid[])', [
        [orgA, orgB],
      ]);
      await migratePool.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[orgA, orgB]]);
      await migratePool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
        [userA, userB, grantor],
      ]);
      await appPool.end();
      await migratePool.end();
    }
  });

  it('aísla generation_auths/records por org; licenses tiene FORCE RLS', async () => {
    const migrateUrl = migrateConnectionString();
    const migratePool = new pg.Pool({ connectionString: migrateUrl, max: 1 });
    const appUrl = new URL(migrateUrl);
    appUrl.username = 'rightsnet_app';
    appUrl.password = '';
    const appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });

    const userA = randomUUID();
    const userB = randomUUID();
    const grantor = randomUUID();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const creatorId = randomUUID();
    const assetId = randomUUID();
    const grantA = randomUUID();
    const grantB = randomUUID();
    const authA = randomUUID();
    const authB = randomUUID();
    const recA = randomUUID();
    const recB = randomUUID();
    const now = new Date();
    const later = new Date(now.getTime() + 86400000);

    try {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      const force = await migratePool.query(
        `SELECT c.relrowsecurity AND c.relforcerowsecurity AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='licenses'`,
      );
      expect(force.rows[0].forced).toBe(true);

      await migratePool.query(
        `INSERT INTO users(id,email,display_name,role) VALUES
          ($1,$2,'RLS LA','buyer'),
          ($3,$4,'RLS LB','buyer'),
          ($5,$6,'RLS LG','creator')`,
        [
          userA,
          `rls-la-${userA}@example.com`,
          userB,
          `rls-lb-${userB}@example.com`,
          grantor,
          `rls-lg-${grantor}@example.com`,
        ],
      );
      await migratePool.query(
        `INSERT INTO organizations(id,legal_name,country) VALUES ($1,'RLS Lic A','AT'),($2,'RLS Lic B','AT')`,
        [orgA, orgB],
      );
      await migratePool.query(
        `INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,$2,'owner'),($3,$4,'owner')`,
        [orgA, userA, orgB, userB],
      );
      await migratePool.query(
        `INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES ($1,$2,'G','b','AT','x')`,
        [creatorId, grantor],
      );
      await migratePool.query(`INSERT INTO assets(id,creator_id,status) VALUES($1,$2,'published')`, [
        assetId,
        creatorId,
      ]);
      const payload = JSON.stringify({ rights: {} });
      await migratePool.query(
        `INSERT INTO rights_grants(
           id,grantor_user_id,grantee_organization_id,asset_id,source_type,source_id,payload,status,valid_from,valid_until)
         VALUES
           ($1,$2,$3,$4,'EXISTING_AGREEMENT',$5,$6::jsonb,'ACTIVE',$7,$8),
           ($9,$2,$10,$4,'EXISTING_AGREEMENT',$11,$6::jsonb,'ACTIVE',$7,$8)`,
        [
          grantA,
          grantor,
          orgA,
          assetId,
          randomUUID(),
          payload,
          now.toISOString(),
          later.toISOString(),
          grantB,
          orgB,
          randomUUID(),
        ],
      );
      const authPayload = JSON.stringify({ auth_id: authA });
      await migratePool.query(
        `INSERT INTO generation_auths(
           id,grant_id,organization_id,asset_id,provider,use_snapshot,payload,signature,key_id,status,issued_at,expires_at)
         VALUES
           ($1,$2,$3,$4,'test','{}'::jsonb,$5::jsonb,'sig','kid','ISSUED',$6,$7),
           ($8,$9,$10,$4,'test','{}'::jsonb,$11::jsonb,'sig','kid','ISSUED',$6,$7)`,
        [
          authA,
          grantA,
          orgA,
          assetId,
          authPayload,
          now.toISOString(),
          later.toISOString(),
          authB,
          grantB,
          orgB,
          JSON.stringify({ auth_id: authB }),
        ],
      );
      await migratePool.query(
        `INSERT INTO generation_records(
           id,auth_id,grant_id,organization_id,asset_id,provider,payload)
         VALUES
           ($1,$2,$3,$4,$5,'test','{}'::jsonb),
           ($6,$7,$8,$9,$5,'test','{}'::jsonb)`,
        [recA, authA, grantA, orgA, assetId, recB, authB, grantB, orgB],
      );

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userA]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);

        expect(
          (
            await client.query('SELECT id FROM generation_auths WHERE id=ANY($1::uuid[]) ORDER BY id', [
              [authA, authB],
            ])
          ).rows.map((r) => r.id),
        ).toEqual([authA]);
        expect(
          (
            await client.query(
              'SELECT id FROM generation_records WHERE id=ANY($1::uuid[]) ORDER BY id',
              [[recA, recB]],
            )
          ).rows.map((r) => r.id),
        ).toEqual([recA]);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query('DELETE FROM generation_records WHERE id=ANY($1::uuid[])', [
        [recA, recB],
      ]);
      await migratePool.query('DELETE FROM generation_auths WHERE id=ANY($1::uuid[])', [
        [authA, authB],
      ]);
      await migratePool.query('DELETE FROM rights_grants WHERE id=ANY($1::uuid[])', [
        [grantA, grantB],
      ]);
      await migratePool.query('DELETE FROM assets WHERE id=$1', [assetId]);
      await migratePool.query('DELETE FROM creators WHERE id=$1', [creatorId]);
      await migratePool.query('DELETE FROM organization_members WHERE organization_id=ANY($1::uuid[])', [
        [orgA, orgB],
      ]);
      await migratePool.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[orgA, orgB]]);
      await migratePool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
        [userA, userB, grantor],
      ]);
      await appPool.end();
      await migratePool.end();
    }
  });

  it('aísla campaign_talent/evidence/deal_requests/passports por org de campaña', async () => {
    const migrateUrl = migrateConnectionString();
    const migratePool = new pg.Pool({ connectionString: migrateUrl, max: 1 });
    const appUrl = new URL(migrateUrl);
    appUrl.username = 'rightsnet_app';
    appUrl.password = '';
    const appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });

    const userA = randomUUID();
    const userB = randomUUID();
    const grantor = randomUUID();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const campaignA = randomUUID();
    const campaignB = randomUUID();
    const creatorId = randomUUID();
    const assetA = randomUUID();
    const assetB = randomUUID();
    const dealA = randomUUID();
    const dealB = randomUUID();
    const passA = randomUUID();
    const passB = randomUUID();
    const evidenceIdA = randomUUID();
    const evidenceIdB = randomUUID();
    const later = new Date(Date.now() + 86400000 * 7);

    try {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      const force = await migratePool.query(
        `SELECT c.relname, c.relforcerowsecurity AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public'
           AND c.relname=ANY($1::text[])
         ORDER BY c.relname`,
        [['campaign_talent', 'campaign_evidence', 'campaign_deal_requests', 'campaign_passports']],
      );
      expect(force.rows.every((r) => r.forced === true)).toBe(true);

      await migratePool.query(
        `INSERT INTO users(id,email,display_name,role) VALUES
          ($1,$2,'RLS CA','buyer'),
          ($3,$4,'RLS CB','buyer'),
          ($5,$6,'RLS CG','creator')`,
        [
          userA,
          `rls-ca-${userA}@example.com`,
          userB,
          `rls-cb-${userB}@example.com`,
          grantor,
          `rls-cg-${grantor}@example.com`,
        ],
      );
      await migratePool.query(
        `INSERT INTO organizations(id,legal_name,country) VALUES ($1,'RLS Camp A','AT'),($2,'RLS Camp B','AT')`,
        [orgA, orgB],
      );
      await migratePool.query(
        `INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,$2,'owner'),($3,$4,'owner')`,
        [orgA, userA, orgB, userB],
      );
      await migratePool.query(
        `INSERT INTO campaigns(id,organization_id,name,creative_brief,created_by) VALUES
          ($1,$2,'Camp A','brief',$3),
          ($4,$5,'Camp B','brief',$6)`,
        [campaignA, orgA, userA, campaignB, orgB, userB],
      );
      await migratePool.query(
        `INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES ($1,$2,'G','b','AT','x')`,
        [creatorId, grantor],
      );
      await migratePool.query(
        `INSERT INTO assets(id,creator_id,status) VALUES ($1,$3,'published'),($2,$3,'published')`,
        [assetA, assetB, creatorId],
      );
      await migratePool.query(
        `INSERT INTO campaign_talent(campaign_id,asset_id,added_by) VALUES ($1,$2,$3),($4,$5,$6)`,
        [campaignA, assetA, userA, campaignB, assetB, userB],
      );
      await migratePool.query(
        `INSERT INTO campaign_evidence(campaign_id,kind,evidence_id,added_by) VALUES
          ($1,'AUTH',$2,$3),($4,'AUTH',$5,$6)`,
        [campaignA, evidenceIdA, userA, campaignB, evidenceIdB, userB],
      );
      await migratePool.query(
        `INSERT INTO campaign_deal_requests(
           id,campaign_id,organization_id,asset_id,status,created_by,updated_by)
         VALUES
           ($1,$2,$3,$4,'DRAFT',$5,$5),
           ($6,$7,$8,$9,'DRAFT',$10,$10)`,
        [dealA, campaignA, orgA, assetA, userA, dealB, campaignB, orgB, assetB, userB],
      );
      await migratePool.query(
        `INSERT INTO campaign_passports(
           id,campaign_id,organization_id,public_token,status,expires_at,created_by)
         VALUES
           ($1,$2,$3,$4,'ACTIVE',$5,$6),
           ($7,$8,$9,$10,'ACTIVE',$5,$11)`,
        [
          passA,
          campaignA,
          orgA,
          `tokA${passA.replace(/-/g, '').slice(0, 12)}`,
          later.toISOString(),
          userA,
          passB,
          campaignB,
          orgB,
          `tokB${passB.replace(/-/g, '').slice(0, 12)}`,
          userB,
        ],
      );

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userA]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);

        expect(
          (
            await client.query(
              'SELECT asset_id FROM campaign_talent WHERE campaign_id=ANY($1::uuid[]) ORDER BY asset_id',
              [[campaignA, campaignB]],
            )
          ).rows.map((r) => r.asset_id),
        ).toEqual([assetA]);
        expect(
          (
            await client.query(
              'SELECT evidence_id FROM campaign_evidence WHERE campaign_id=ANY($1::uuid[]) ORDER BY evidence_id',
              [[campaignA, campaignB]],
            )
          ).rows.map((r) => r.evidence_id),
        ).toEqual([evidenceIdA]);
        expect(
          (
            await client.query(
              'SELECT id FROM campaign_deal_requests WHERE id=ANY($1::uuid[]) ORDER BY id',
              [[dealA, dealB]],
            )
          ).rows.map((r) => r.id),
        ).toEqual([dealA]);
        expect(
          (
            await client.query(
              'SELECT id FROM campaign_passports WHERE id=ANY($1::uuid[]) ORDER BY id',
              [[passA, passB]],
            )
          ).rows.map((r) => r.id),
        ).toEqual([passA]);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query('DELETE FROM campaign_passports WHERE id=ANY($1::uuid[])', [
        [passA, passB],
      ]);
      await migratePool.query('DELETE FROM campaign_deal_requests WHERE id=ANY($1::uuid[])', [
        [dealA, dealB],
      ]);
      await migratePool.query('DELETE FROM campaign_evidence WHERE campaign_id=ANY($1::uuid[])', [
        [campaignA, campaignB],
      ]);
      await migratePool.query('DELETE FROM campaign_talent WHERE campaign_id=ANY($1::uuid[])', [
        [campaignA, campaignB],
      ]);
      await migratePool.query('DELETE FROM assets WHERE id=ANY($1::uuid[])', [[assetA, assetB]]);
      await migratePool.query('DELETE FROM creators WHERE id=$1', [creatorId]);
      await migratePool.query('DELETE FROM campaigns WHERE id=ANY($1::uuid[])', [
        [campaignA, campaignB],
      ]);
      await migratePool.query('DELETE FROM organization_members WHERE organization_id=ANY($1::uuid[])', [
        [orgA, orgB],
      ]);
      await migratePool.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[orgA, orgB]]);
      await migratePool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
        [userA, userB, grantor],
      ]);
      await appPool.end();
      await migratePool.end();
    }
  });

  it('aísla requests/quotes/orders por org; creador ve ambas; licenses sigue OK', async () => {
    const migrateUrl = migrateConnectionString();
    const migratePool = new pg.Pool({ connectionString: migrateUrl, max: 1 });
    const appUrl = new URL(migrateUrl);
    appUrl.username = 'rightsnet_app';
    appUrl.password = '';
    const appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });

    const userA = randomUUID();
    const userB = randomUUID();
    const grantor = randomUUID();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const creatorId = randomUUID();
    const assetId = randomUUID();
    const policyId = randomUUID();
    const reqA = randomUUID();
    const reqB = randomUUID();
    const quoteA = randomUUID();
    const quoteB = randomUUID();
    const orderA = randomUUID();
    const orderB = randomUUID();
    const licA = randomUUID();
    const licB = randomUUID();
    const later = new Date(Date.now() + 86400000 * 30);
    const now = new Date();

    try {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      const force = await migratePool.query(
        `SELECT c.relname, c.relforcerowsecurity AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public'
           AND c.relname=ANY($1::text[])
         ORDER BY c.relname`,
        [['orders', 'quotes', 'requests']],
      );
      expect(force.rows.every((r) => r.forced === true)).toBe(true);

      await migratePool.query(
        `INSERT INTO users(id,email,display_name,role) VALUES
          ($1,$2,'RLS OA','buyer'),
          ($3,$4,'RLS OB','buyer'),
          ($5,$6,'RLS OG','creator')`,
        [
          userA,
          `rls-oa-${userA}@example.com`,
          userB,
          `rls-ob-${userB}@example.com`,
          grantor,
          `rls-og-${grantor}@example.com`,
        ],
      );
      await migratePool.query(
        `INSERT INTO organizations(id,legal_name,country) VALUES ($1,'RLS Ord A','AT'),($2,'RLS Ord B','AT')`,
        [orgA, orgB],
      );
      await migratePool.query(
        `INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,$2,'owner'),($3,$4,'owner')`,
        [orgA, userA, orgB, userB],
      );
      await migratePool.query(
        `INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES ($1,$2,'G','b','AT','x')`,
        [creatorId, grantor],
      );
      await migratePool.query(
        `INSERT INTO assets(id,creator_id,status,relationship_status) VALUES($1,$2,'published','reviewed')`,
        [assetId, creatorId],
      );
      await migratePool.query(
        `INSERT INTO policies(id,asset_id,version,payload,sha256) VALUES($1,$2,1,'{}'::jsonb,'sha')`,
        [policyId, assetId],
      );
      await migratePool.query(`UPDATE assets SET policy_id=$1 WHERE id=$2`, [policyId, assetId]);

      const usage = JSON.stringify({});
      await migratePool.query(
        `INSERT INTO requests(
           id,organization_id,asset_id,policy_id,usage,usage_hash,decision,reason_codes)
         VALUES
           ($1,$2,$3,$4,$5::jsonb,'uh','ALLOW','[]'::jsonb),
           ($6,$7,$3,$4,$5::jsonb,'uh','ALLOW','[]'::jsonb)`,
        [reqA, orgA, assetId, policyId, usage, reqB, orgB],
      );
      await migratePool.query(
        `INSERT INTO quotes(id,request_id,scope,price,policy_hash,expires_at) VALUES
           ($1,$2,'{}'::jsonb,'{"amount_minor":100,"currency":"EUR"}'::jsonb,'ph',$3),
           ($4,$5,'{}'::jsonb,'{"amount_minor":100,"currency":"EUR"}'::jsonb,'ph',$3)`,
        [quoteA, reqA, later.toISOString(), quoteB, reqB],
      );
      await migratePool.query(
        `INSERT INTO orders(
           id,quote_id,organization_id,asset_id,status,price,scope,policy_snapshot,
           contract_text,contract_hash,expires_at)
         VALUES
           ($1,$2,$3,$4,'awaiting_payment','{"amount_minor":100,"currency":"EUR"}'::jsonb,
            '{}'::jsonb,'{}'::jsonb,'c','ch',$5),
           ($6,$7,$8,$4,'awaiting_payment','{"amount_minor":100,"currency":"EUR"}'::jsonb,
            '{}'::jsonb,'{}'::jsonb,'c','ch',$5)`,
        [orderA, quoteA, orgA, assetId, later.toISOString(), orderB, quoteB, orgB],
      );
      await migratePool.query(
        `INSERT INTO licenses(
           id,order_id,public_token,status,starts_at,ends_at,payload,signature,key_id)
         VALUES
           ($1,$2,$3,'issued',$4,$5,'{}'::jsonb,'sig','kid'),
           ($6,$7,$8,'issued',$4,$5,'{}'::jsonb,'sig','kid')`,
        [
          licA,
          orderA,
          `tokA${licA.replace(/-/g, '').slice(0, 20)}`,
          now.toISOString(),
          later.toISOString(),
          licB,
          orderB,
          `tokB${licB.replace(/-/g, '').slice(0, 20)}`,
        ],
      );

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userA]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);

        expect(
          (
            await client.query('SELECT id FROM requests WHERE id=ANY($1::uuid[]) ORDER BY id', [
              [reqA, reqB],
            ])
          ).rows.map((r) => r.id),
        ).toEqual([reqA]);
        expect(
          (
            await client.query('SELECT id FROM quotes WHERE id=ANY($1::uuid[]) ORDER BY id', [
              [quoteA, quoteB],
            ])
          ).rows.map((r) => r.id),
        ).toEqual([quoteA]);
        expect(
          (
            await client.query('SELECT id FROM orders WHERE id=ANY($1::uuid[]) ORDER BY id', [
              [orderA, orderB],
            ])
          ).rows.map((r) => r.id),
        ).toEqual([orderA]);
        expect(
          (
            await client.query('SELECT id FROM licenses WHERE id=ANY($1::uuid[]) ORDER BY id', [
              [licA, licB],
            ])
          ).rows.map((r) => r.id),
        ).toEqual([licA]);
        await client.query('ROLLBACK');

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [grantor]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);
        expect(
          (
            await client.query('SELECT count(*)::int AS n FROM orders WHERE id=ANY($1::uuid[])', [
              [orderA, orderB],
            ])
          ).rows[0].n,
        ).toBe(2);
        expect(
          (
            await client.query('SELECT count(*)::int AS n FROM licenses WHERE id=ANY($1::uuid[])', [
              [licA, licB],
            ])
          ).rows[0].n,
        ).toBe(2);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      // Commerce snapshots are append-only; disable delete guards only for test cleanup.
      await migratePool.query('ALTER TABLE licenses DISABLE TRIGGER prevent_license_delete');
      await migratePool.query('ALTER TABLE orders DISABLE TRIGGER prevent_order_delete');
      await migratePool.query('ALTER TABLE quotes DISABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM licenses WHERE id=ANY($1::uuid[])', [[licA, licB]]);
      await migratePool.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [[orderA, orderB]]);
      await migratePool.query('DELETE FROM quotes WHERE id=ANY($1::uuid[])', [[quoteA, quoteB]]);
      await migratePool.query('ALTER TABLE quotes ENABLE TRIGGER immutable_evidence');
      await migratePool.query('ALTER TABLE orders ENABLE TRIGGER prevent_order_delete');
      await migratePool.query('ALTER TABLE licenses ENABLE TRIGGER prevent_license_delete');
      await migratePool.query('DELETE FROM requests WHERE id=ANY($1::uuid[])', [[reqA, reqB]]);
      await migratePool.query('UPDATE assets SET policy_id=NULL WHERE id=$1', [assetId]);
      await migratePool.query('ALTER TABLE policies DISABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM policies WHERE id=$1', [policyId]);
      await migratePool.query('ALTER TABLE policies ENABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM assets WHERE id=$1', [assetId]);
      await migratePool.query('DELETE FROM creators WHERE id=$1', [creatorId]);
      await migratePool.query('DELETE FROM organization_members WHERE organization_id=ANY($1::uuid[])', [
        [orgA, orgB],
      ]);
      await migratePool.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[orgA, orgB]]);
      await migratePool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
        [userA, userB, grantor],
      ]);
      await appPool.end();
      await migratePool.end();
    }
  });

  it('aísla outbox/journals/ledger_entries por org de la orden', async () => {
    const migrateUrl = migrateConnectionString();
    const migratePool = new pg.Pool({ connectionString: migrateUrl, max: 1 });
    const appUrl = new URL(migrateUrl);
    appUrl.username = 'rightsnet_app';
    appUrl.password = '';
    const appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });

    const userA = randomUUID();
    const userB = randomUUID();
    const grantor = randomUUID();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const creatorId = randomUUID();
    const assetId = randomUUID();
    const policyId = randomUUID();
    const reqA = randomUUID();
    const reqB = randomUUID();
    const quoteA = randomUUID();
    const quoteB = randomUUID();
    const orderA = randomUUID();
    const orderB = randomUUID();
    const outA = randomUUID();
    const outB = randomUUID();
    const journalA = randomUUID();
    const journalB = randomUUID();
    const entryA1 = randomUUID();
    const entryA2 = randomUUID();
    const entryB1 = randomUUID();
    const entryB2 = randomUUID();
    const later = new Date(Date.now() + 86400000 * 30);

    try {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      const force = await migratePool.query(
        `SELECT c.relname, c.relforcerowsecurity AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public'
           AND c.relname=ANY($1::text[])
         ORDER BY c.relname`,
        [['journals', 'ledger_entries', 'outbox']],
      );
      expect(force.rows.every((r) => r.forced === true)).toBe(true);

      await migratePool.query(
        `INSERT INTO users(id,email,display_name,role) VALUES
          ($1,$2,'RLS FA','buyer'),
          ($3,$4,'RLS FB','buyer'),
          ($5,$6,'RLS FG','creator')`,
        [
          userA,
          `rls-fa-${userA}@example.com`,
          userB,
          `rls-fb-${userB}@example.com`,
          grantor,
          `rls-fg-${grantor}@example.com`,
        ],
      );
      await migratePool.query(
        `INSERT INTO organizations(id,legal_name,country) VALUES ($1,'RLS Fin A','AT'),($2,'RLS Fin B','AT')`,
        [orgA, orgB],
      );
      await migratePool.query(
        `INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,$2,'owner'),($3,$4,'owner')`,
        [orgA, userA, orgB, userB],
      );
      await migratePool.query(
        `INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES ($1,$2,'G','b','AT','x')`,
        [creatorId, grantor],
      );
      await migratePool.query(
        `INSERT INTO assets(id,creator_id,status,relationship_status) VALUES($1,$2,'published','reviewed')`,
        [assetId, creatorId],
      );
      await migratePool.query(
        `INSERT INTO policies(id,asset_id,version,payload,sha256) VALUES($1,$2,1,'{}'::jsonb,'sha')`,
        [policyId, assetId],
      );
      await migratePool.query(`UPDATE assets SET policy_id=$1 WHERE id=$2`, [policyId, assetId]);

      const usage = JSON.stringify({});
      await migratePool.query(
        `INSERT INTO requests(
           id,organization_id,asset_id,policy_id,usage,usage_hash,decision,reason_codes)
         VALUES
           ($1,$2,$3,$4,$5::jsonb,'uh','ALLOW','[]'::jsonb),
           ($6,$7,$3,$4,$5::jsonb,'uh','ALLOW','[]'::jsonb)`,
        [reqA, orgA, assetId, policyId, usage, reqB, orgB],
      );
      await migratePool.query(
        `INSERT INTO quotes(id,request_id,scope,price,policy_hash,expires_at) VALUES
           ($1,$2,'{}'::jsonb,'{"amount_minor":100,"currency":"EUR"}'::jsonb,'ph',$3),
           ($4,$5,'{}'::jsonb,'{"amount_minor":100,"currency":"EUR"}'::jsonb,'ph',$3)`,
        [quoteA, reqA, later.toISOString(), quoteB, reqB],
      );
      await migratePool.query(
        `INSERT INTO orders(
           id,quote_id,organization_id,asset_id,status,price,scope,policy_snapshot,
           contract_text,contract_hash,expires_at)
         VALUES
           ($1,$2,$3,$4,'paid','{"amount_minor":100,"currency":"EUR"}'::jsonb,
            '{}'::jsonb,'{}'::jsonb,'c','ch',$5),
           ($6,$7,$8,$4,'paid','{"amount_minor":100,"currency":"EUR"}'::jsonb,
            '{}'::jsonb,'{}'::jsonb,'c','ch',$5)`,
        [orderA, quoteA, orgA, assetId, later.toISOString(), orderB, quoteB, orgB],
      );
      await migratePool.query(
        `INSERT INTO outbox(id,order_id,kind,status) VALUES ($1,$2,'issue_license','pending'),($3,$4,'issue_license','pending')`,
        [outA, orderA, outB, orderB],
      );

      await migratePool.query('BEGIN');
      await migratePool.query(
        `INSERT INTO journals(id,order_id,kind,currency) VALUES ($1,$2,'sale','EUR'),($3,$4,'sale','EUR')`,
        [journalA, orderA, journalB, orderB],
      );
      await migratePool.query(
        `INSERT INTO ledger_entries(id,journal_id,account,side,amount_minor) VALUES
           ($1,$2,'cash','debit',100),
           ($3,$2,'revenue','credit',100),
           ($4,$5,'cash','debit',100),
           ($6,$5,'revenue','credit',100)`,
        [entryA1, journalA, entryA2, entryB1, journalB, entryB2],
      );
      await migratePool.query('COMMIT');

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userA]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);

        expect(
          (
            await client.query('SELECT id FROM outbox WHERE id=ANY($1::uuid[]) ORDER BY id', [
              [outA, outB],
            ])
          ).rows.map((r) => r.id),
        ).toEqual([outA]);
        expect(
          (
            await client.query('SELECT id FROM journals WHERE id=ANY($1::uuid[]) ORDER BY id', [
              [journalA, journalB],
            ])
          ).rows.map((r) => r.id),
        ).toEqual([journalA]);
        expect(
          (
            await client.query(
              'SELECT id FROM ledger_entries WHERE id=ANY($1::uuid[]) ORDER BY id',
              [[entryA1, entryA2, entryB1, entryB2]],
            )
          ).rows.map((r) => r.id),
        ).toEqual([entryA1, entryA2].sort());
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query('DELETE FROM outbox WHERE id=ANY($1::uuid[])', [[outA, outB]]);
      await migratePool.query('ALTER TABLE ledger_entries DISABLE TRIGGER immutable_evidence');
      await migratePool.query('ALTER TABLE journals DISABLE TRIGGER immutable_evidence');
      await migratePool.query('ALTER TABLE orders DISABLE TRIGGER prevent_order_delete');
      await migratePool.query('ALTER TABLE quotes DISABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM ledger_entries WHERE id=ANY($1::uuid[])', [
        [entryA1, entryA2, entryB1, entryB2],
      ]);
      await migratePool.query('DELETE FROM journals WHERE id=ANY($1::uuid[])', [
        [journalA, journalB],
      ]);
      await migratePool.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [[orderA, orderB]]);
      await migratePool.query('DELETE FROM quotes WHERE id=ANY($1::uuid[])', [[quoteA, quoteB]]);
      await migratePool.query('ALTER TABLE quotes ENABLE TRIGGER immutable_evidence');
      await migratePool.query('ALTER TABLE orders ENABLE TRIGGER prevent_order_delete');
      await migratePool.query('ALTER TABLE journals ENABLE TRIGGER immutable_evidence');
      await migratePool.query('ALTER TABLE ledger_entries ENABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM requests WHERE id=ANY($1::uuid[])', [[reqA, reqB]]);
      await migratePool.query('UPDATE assets SET policy_id=NULL WHERE id=$1', [assetId]);
      await migratePool.query('ALTER TABLE policies DISABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM policies WHERE id=$1', [policyId]);
      await migratePool.query('ALTER TABLE policies ENABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM assets WHERE id=$1', [assetId]);
      await migratePool.query('DELETE FROM creators WHERE id=$1', [creatorId]);
      await migratePool.query('DELETE FROM organization_members WHERE organization_id=ANY($1::uuid[])', [
        [orgA, orgB],
      ]);
      await migratePool.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[orgA, orgB]]);
      await migratePool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
        [userA, userB, grantor],
      ]);
      await appPool.end();
      await migratePool.end();
    }
  });

  it('aísla payment_attempts y refunds por org de la orden', async () => {
    const migrateUrl = migrateConnectionString();
    const migratePool = new pg.Pool({ connectionString: migrateUrl, max: 1 });
    const appUrl = new URL(migrateUrl);
    appUrl.username = 'rightsnet_app';
    appUrl.password = '';
    const appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });

    const userA = randomUUID();
    const userB = randomUUID();
    const grantor = randomUUID();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const creatorId = randomUUID();
    const assetId = randomUUID();
    const policyId = randomUUID();
    const reqA = randomUUID();
    const reqB = randomUUID();
    const quoteA = randomUUID();
    const quoteB = randomUUID();
    const orderA = randomUUID();
    const orderB = randomUUID();
    const payA = randomUUID();
    const payB = randomUUID();
    const refA = randomUUID();
    const refB = randomUUID();
    const later = new Date(Date.now() + 86400000 * 30);

    try {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      const force = await migratePool.query(
        `SELECT c.relname, c.relforcerowsecurity AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public'
           AND c.relname=ANY($1::text[])
         ORDER BY c.relname`,
        [['payment_attempts', 'refunds']],
      );
      expect(force.rows.every((r) => r.forced === true)).toBe(true);

      await migratePool.query(
        `INSERT INTO users(id,email,display_name,role) VALUES
          ($1,$2,'RLS PA','buyer'),
          ($3,$4,'RLS PB','buyer'),
          ($5,$6,'RLS PG','creator')`,
        [
          userA,
          `rls-pa-${userA}@example.com`,
          userB,
          `rls-pb-${userB}@example.com`,
          grantor,
          `rls-pg-${grantor}@example.com`,
        ],
      );
      await migratePool.query(
        `INSERT INTO organizations(id,legal_name,country) VALUES ($1,'RLS Pay A','AT'),($2,'RLS Pay B','AT')`,
        [orgA, orgB],
      );
      await migratePool.query(
        `INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,$2,'owner'),($3,$4,'owner')`,
        [orgA, userA, orgB, userB],
      );
      await migratePool.query(
        `INSERT INTO creators(id,user_id,display_name,bio,location,portrait) VALUES ($1,$2,'G','b','AT','x')`,
        [creatorId, grantor],
      );
      await migratePool.query(
        `INSERT INTO assets(id,creator_id,status,relationship_status) VALUES($1,$2,'published','reviewed')`,
        [assetId, creatorId],
      );
      await migratePool.query(
        `INSERT INTO policies(id,asset_id,version,payload,sha256) VALUES($1,$2,1,'{}'::jsonb,'sha')`,
        [policyId, assetId],
      );
      await migratePool.query(`UPDATE assets SET policy_id=$1 WHERE id=$2`, [policyId, assetId]);

      const usage = JSON.stringify({});
      await migratePool.query(
        `INSERT INTO requests(
           id,organization_id,asset_id,policy_id,usage,usage_hash,decision,reason_codes)
         VALUES
           ($1,$2,$3,$4,$5::jsonb,'uh','ALLOW','[]'::jsonb),
           ($6,$7,$3,$4,$5::jsonb,'uh','ALLOW','[]'::jsonb)`,
        [reqA, orgA, assetId, policyId, usage, reqB, orgB],
      );
      await migratePool.query(
        `INSERT INTO quotes(id,request_id,scope,price,policy_hash,expires_at) VALUES
           ($1,$2,'{}'::jsonb,'{"amount_minor":100,"currency":"EUR"}'::jsonb,'ph',$3),
           ($4,$5,'{}'::jsonb,'{"amount_minor":100,"currency":"EUR"}'::jsonb,'ph',$3)`,
        [quoteA, reqA, later.toISOString(), quoteB, reqB],
      );
      await migratePool.query(
        `INSERT INTO orders(
           id,quote_id,organization_id,asset_id,status,price,scope,policy_snapshot,
           contract_text,contract_hash,expires_at)
         VALUES
           ($1,$2,$3,$4,'refunded','{"amount_minor":100,"currency":"EUR"}'::jsonb,
            '{}'::jsonb,'{}'::jsonb,'c','ch',$5),
           ($6,$7,$8,$4,'refunded','{"amount_minor":100,"currency":"EUR"}'::jsonb,
            '{}'::jsonb,'{}'::jsonb,'c','ch',$5)`,
        [orderA, quoteA, orgA, assetId, later.toISOString(), orderB, quoteB, orgB],
      );
      await migratePool.query(
        `INSERT INTO payment_attempts(id,order_id,provider,provider_ref,status) VALUES
           ($1,$2,'stripe',$3,'succeeded'),
           ($4,$5,'stripe',$6,'succeeded')`,
        [payA, orderA, `pi_${payA}`, payB, orderB, `pi_${payB}`],
      );
      await migratePool.query(
        `INSERT INTO refunds(id,order_id,reason,status,provider_ref) VALUES
           ($1,$2,'test','succeeded',$3),
           ($4,$5,'test','succeeded',$6)`,
        [refA, orderA, `re_${refA}`, refB, orderB, `re_${refB}`],
      );

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.rls_bypass', '0', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userA]);
        await client.query(`SELECT set_config('app.is_admin', '0', true)`);

        expect(
          (
            await client.query(
              'SELECT id FROM payment_attempts WHERE id=ANY($1::uuid[]) ORDER BY id',
              [[payA, payB]],
            )
          ).rows.map((r) => r.id),
        ).toEqual([payA]);
        expect(
          (
            await client.query('SELECT id FROM refunds WHERE id=ANY($1::uuid[]) ORDER BY id', [
              [refA, refB],
            ])
          ).rows.map((r) => r.id),
        ).toEqual([refA]);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await migratePool.query(`SELECT set_config('app.rls_bypass', '1', false)`);
      await migratePool.query('DELETE FROM refunds WHERE id=ANY($1::uuid[])', [[refA, refB]]);
      await migratePool.query('DELETE FROM payment_attempts WHERE id=ANY($1::uuid[])', [
        [payA, payB],
      ]);
      await migratePool.query('ALTER TABLE orders DISABLE TRIGGER prevent_order_delete');
      await migratePool.query('ALTER TABLE quotes DISABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [[orderA, orderB]]);
      await migratePool.query('DELETE FROM quotes WHERE id=ANY($1::uuid[])', [[quoteA, quoteB]]);
      await migratePool.query('ALTER TABLE quotes ENABLE TRIGGER immutable_evidence');
      await migratePool.query('ALTER TABLE orders ENABLE TRIGGER prevent_order_delete');
      await migratePool.query('DELETE FROM requests WHERE id=ANY($1::uuid[])', [[reqA, reqB]]);
      await migratePool.query('UPDATE assets SET policy_id=NULL WHERE id=$1', [assetId]);
      await migratePool.query('ALTER TABLE policies DISABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM policies WHERE id=$1', [policyId]);
      await migratePool.query('ALTER TABLE policies ENABLE TRIGGER immutable_evidence');
      await migratePool.query('DELETE FROM assets WHERE id=$1', [assetId]);
      await migratePool.query('DELETE FROM creators WHERE id=$1', [creatorId]);
      await migratePool.query('DELETE FROM organization_members WHERE organization_id=ANY($1::uuid[])', [
        [orgA, orgB],
      ]);
      await migratePool.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[orgA, orgB]]);
      await migratePool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
        [userA, userB, grantor],
      ]);
      await appPool.end();
      await migratePool.end();
    }
  });
});
