import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { demoIds, seed } from '../packages/db/seed.js';
import { consent, createCreator } from '../apps/api/src/modules/marketplace.js';
import { reviewAssetRelationship } from '../apps/api/src/modules/asset-relationship.js';
import { defaultPolicy } from '../packages/domain/src/index.js';
import type { Actor } from '../apps/api/src/common/auth.js';

let creator: Actor;
let admin: Actor;
let assetId: string;
let policyHash: string;
let creatorRowId: string;
const uploadDir = path.resolve('.local/uploads');

async function addEvidence(targetAssetId: string, status: 'pending' | 'clean' | 'rejected' = 'clean') {
  const fileId = randomUUID();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  await mkdir(uploadDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(uploadDir, fileId), jpeg, { mode: 0o600, flag: 'wx' });
  await pool.query(
    'INSERT INTO asset_files(id,asset_id,storage_key,sha256,mime_type,size_bytes,scan_status) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      fileId,
      targetAssetId,
      fileId,
      createHash('sha256').update(jpeg).digest('hex'),
      'image/jpeg',
      jpeg.length,
      status,
    ],
  );
  return fileId;
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test')) throw new Error('Tests require _test database');
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const management = new pg.Pool({ connectionString: url.toString() });
  if (!(await management.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
    await management.query('CREATE DATABASE ' + name);
  await management.end();
  await migrate();
  await seed();
  const userId = randomUUID();
  await pool.query(
    "INSERT INTO users(id,email,display_name,role) VALUES($1,$2,'Review Fixture User','buyer')",
    [userId, `review-${userId.slice(0, 8)}@example.test`],
  );
  creator = (await pool.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0];
  admin = (await pool.query('SELECT * FROM users WHERE id=$1', [demoIds.admin])).rows[0];
  const created = await transaction((db) =>
    createCreator(db, creator, {
      display_name: 'Review Fixture ' + randomUUID().slice(0, 6),
      bio: 'Fixture for asset relationship human review.',
      location: 'Vienna, AT',
      languages: ['de'],
      gender: 'female',
      age_band: '25_34',
      policy: defaultPolicy,
    }),
  );
  assetId = created.id;
  policyHash = created.policy_hash;
  creatorRowId = (
    await pool.query('SELECT id FROM creators WHERE user_id=$1', [creator.id])
  ).rows[0].id;
  await transaction((db) =>
    consent(db, creator, assetId, { accepted: true, document_hash: policyHash }),
  );
});

afterAll(async () => {
  await pool.end();
});

describe('Asset relationship human review v0.1', () => {
  it('exige evidencia antes de aprobar y aprueba con archivo', async () => {
    await expect(
      transaction((db) =>
        reviewAssetRelationship(db, admin.id, assetId, 'approve', 'Motivo demasiado'),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    await pool.query(
      "UPDATE assets SET status='pending_review', relationship_status='pending' WHERE id=$1",
      [assetId],
    );
    await expect(
      transaction((db) =>
        reviewAssetRelationship(
          db,
          admin.id,
          assetId,
          'approve',
          'Apruebo sin evidencia visible en test',
        ),
      ),
    ).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' });

    const dirty = await addEvidence(assetId, 'pending');
    await expect(
      transaction((db) =>
        reviewAssetRelationship(
          db,
          admin.id,
          assetId,
          'approve',
          'Apruebo con evidencia aún pendiente de scan',
        ),
      ),
    ).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' });
    await pool.query('DELETE FROM asset_files WHERE id=$1', [dirty]);
    await rm(path.join(uploadDir, dirty), { force: true });

    const fileId = await addEvidence(assetId, 'clean');
    const approved = await transaction((db) =>
      reviewAssetRelationship(
        db,
        admin.id,
        assetId,
        'approve',
        'Evidencia JPEG coincide con el creador de prueba.',
      ),
    );
    expect(approved).toMatchObject({ reviewed: true, sandbox: true, decision: 'approve' });
    const row = (
      await pool.query('SELECT status, relationship_status FROM assets WHERE id=$1', [assetId])
    ).rows[0];
    expect(row.status).toBe('draft');
    expect(row.relationship_status).toBe('reviewed');
    expect(
      (await pool.query('SELECT scan_status FROM asset_files WHERE id=$1', [fileId])).rows[0]
        .scan_status,
    ).toBe('clean');
    await rm(path.join(uploadDir, fileId), { force: true });
  });

  it('rechaza con motivo y deja relationship_status=rejected', async () => {
    const otherAsset = randomUUID();
    const policyId = randomUUID();
    const digest = createHash('sha256').update('reject-policy').digest('hex');
    await pool.query('INSERT INTO assets(id,creator_id) VALUES($1,$2)', [
      otherAsset,
      creatorRowId,
    ]);
    await pool.query(
      'INSERT INTO policies(id,asset_id,version,payload,sha256) VALUES($1,$2,1,$3,$4)',
      [policyId, otherAsset, JSON.stringify(defaultPolicy), digest],
    );
    await pool.query('UPDATE assets SET policy_id=$1, status=$2, relationship_status=$3 WHERE id=$4', [
      policyId,
      'pending_review',
      'pending',
      otherAsset,
    ]);
    const fileId = await addEvidence(otherAsset);
    await transaction((db) =>
      reviewAssetRelationship(
        db,
        admin.id,
        otherAsset,
        'reject',
        'La foto no corresponde a la persona del perfil.',
      ),
    );
    const row = (
      await pool.query('SELECT status, relationship_status FROM assets WHERE id=$1', [otherAsset])
    ).rows[0];
    expect(row.status).toBe('rejected');
    expect(row.relationship_status).toBe('rejected');
    await rm(path.join(uploadDir, fileId), { force: true });
  });
});
