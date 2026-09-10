import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import {
  confirmExternalAgreement,
  createExternalAgreement,
} from '../apps/api/src/modules/external-agreements.js';
import {
  extractExternalAgreement,
  listExternalAgreementFiles,
  sandboxExtractProposedRights,
  uploadExternalAgreementFile,
} from '../apps/api/src/modules/external-agreement-ocr.js';

/** Minimal valid PNG (1x1) — magic bytes checked by upload. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Existing Deal OCR L1 (upload + sandbox extract)', () => {
  let admin: Actor;
  let assetId: string;

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
  });

  afterAll(() => pool.end());

  it('sandboxExtractProposedRights stamps ocr_extract without inventing grant', () => {
    const out = sandboxExtractProposedRights(
      {
        rights: { synthetic_video: 'ALLOW' },
        industry: ['beauty'],
        territories: ['DE'],
        approval: {},
        valid_from: '2026-01-01T00:00:00.000Z',
        valid_until: '2027-01-01T00:00:00.000Z',
      },
      { filename: 'deal.pdf', mime_type: 'application/pdf' },
    );
    expect(out.approval.ocr_extract).toBe('sandbox_v0.1');
    expect(out.territories).toContain('DE');
  });

  it('upload → extract → confirm; extract alone creates no grant; second file 409', async () => {
    const proposed = {
      rights: {
        synthetic_video: 'ALLOW',
        commercial_advertising: 'ALLOW',
      },
      industry: ['beauty'],
      territories: ['DE'],
      approval: {},
      valid_from: '2026-06-01T00:00:00.000Z',
      valid_until: '2027-06-01T00:00:00.000Z',
    };

    const created = await transaction((db) =>
      createExternalAgreement(db, admin, {
        organization_id: demoIds.org,
        asset_id: assetId,
        title: 'OCR L1 contract ' + randomUUID().slice(0, 8),
        status: 'pending_confirm',
        proposed_rights: proposed,
      }),
    );

    const uploaded = await transaction((db) =>
      uploadExternalAgreementFile(db, admin, created.id, {
        base64: PNG_1X1.toString('base64'),
        mime_type: 'image/png',
        original_filename: 'contract.png',
      }),
    );
    expect(uploaded.scan_status).toBe('clean');
    expect(uploaded.mime_type).toBe('image/png');

    const listed = await listExternalAgreementFiles(created.id);
    expect(listed.items).toHaveLength(1);

    await expect(
      transaction((db) =>
        uploadExternalAgreementFile(db, admin, created.id, {
          base64: PNG_1X1.toString('base64'),
          mime_type: 'image/png',
        }),
      ),
    ).rejects.toMatchObject({ code: 'FILE_ALREADY_ATTACHED' });

    const extracted = await transaction((db) =>
      extractExternalAgreement(db, admin, created.id, { mode: 'sandbox' }),
    );
    expect(extracted.grant_created).toBe(false);
    expect(extracted.extract_status).toBe('ready');
    expect(extracted.agreement.extract_status).toBe('ready');
    expect(extracted.proposed_rights.approval.ocr_extract).toBe('sandbox_v0.1');

    const grantsBefore = (
      await pool.query(
        "SELECT count(*)::int AS n FROM rights_grants WHERE source_type='EXISTING_AGREEMENT' AND source_id=$1",
        [created.id],
      )
    ).rows[0].n;
    expect(grantsBefore).toBe(0);

    const confirmed = await transaction((db) => confirmExternalAgreement(db, admin, created.id));
    expect(confirmed.grant.source_type).toBe('EXISTING_AGREEMENT');
    expect(confirmed.grant.status).toBe('ACTIVE');
    expect(confirmed.agreement.proposed_rights.approval.ocr_extract).toBe('sandbox_v0.1');
  });

  it('proposed-rights update then confirm (OCR L2 review path)', async () => {
    const created = await transaction((db) =>
      createExternalAgreement(db, admin, {
        organization_id: demoIds.org,
        asset_id: assetId,
        title: 'Review draft ' + randomUUID().slice(0, 8),
        status: 'pending_confirm',
        proposed_rights: {
          rights: { synthetic_video: 'ALLOW' },
          industry: ['beauty'],
          territories: ['DE'],
          approval: {},
          valid_from: '2026-01-01T00:00:00.000Z',
          valid_until: '2027-01-01T00:00:00.000Z',
        },
      }),
    );
    const { updateExternalAgreementProposedRights } = await import(
      '../apps/api/src/modules/external-agreements.js'
    );
    const updated = await transaction((db) =>
      updateExternalAgreementProposedRights(db, admin, created.id, {
        proposed_rights: {
          rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
          industry: ['beauty'],
          territories: ['AT'],
          approval: { reviewed: 'human' },
          valid_from: '2026-01-01T00:00:00.000Z',
          valid_until: '2027-01-01T00:00:00.000Z',
        },
      }),
    );
    expect(updated.proposed_rights.territories).toContain('AT');
    const confirmed = await transaction((db) => confirmExternalAgreement(db, admin, created.id));
    expect(confirmed.grant.status).toBe('ACTIVE');
  });

  it('extract without file fails; live without flag fails; live with mock succeeds', async () => {
    const created = await transaction((db) =>
      createExternalAgreement(db, admin, {
        organization_id: demoIds.org,
        asset_id: assetId,
        title: 'No file ' + randomUUID().slice(0, 8),
        status: 'draft',
        proposed_rights: {
          rights: { synthetic_video: 'ALLOW' },
          industry: ['beauty'],
          territories: ['AT'],
          approval: {},
          valid_from: '2026-01-01T00:00:00.000Z',
          valid_until: '2027-01-01T00:00:00.000Z',
        },
      }),
    );

    await expect(
      transaction((db) => extractExternalAgreement(db, admin, created.id, {})),
    ).rejects.toMatchObject({ code: 'FILE_REQUIRED' });

    await transaction((db) =>
      uploadExternalAgreementFile(db, admin, created.id, {
        base64: PNG_1X1.toString('base64'),
        mime_type: 'image/png',
      }),
    );

    await expect(
      transaction((db) =>
        extractExternalAgreement(db, admin, created.id, { mode: 'live' }, {
          liveOcr: { enabled: false },
        }),
      ),
    ).rejects.toMatchObject({ code: 'OCR_LIVE_DISABLED' });

    const live = await transaction((db) =>
      extractExternalAgreement(
        db,
        admin,
        created.id,
        { mode: 'live' },
        {
          liveOcrFn: async () => ({
            rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
            industry: ['beauty'],
            territories: ['DE'],
            approval: { ocr_extract: 'live_v0.1' },
            valid_from: '2026-01-01T00:00:00.000Z',
            valid_until: '2027-01-01T00:00:00.000Z',
          }),
        },
      ),
    );
    expect(live.mode).toBe('live');
    expect(live.grant_created).toBe(false);
    expect(live.proposed_rights.approval.ocr_extract).toBe('live_v0.1');
    expect(live.agreement.extract_status).toBe('ready');
  });
});
