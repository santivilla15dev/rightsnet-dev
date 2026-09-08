import { randomUUID } from 'node:crypto';
import {
  buildMarketplaceGrantPayload,
  buildExternalAgreementGrantPayload,
  licenseStatusToGrantStatus,
  type ExternalProposedRights,
  type RightsGrantStatus,
} from '../domain/src/index.js';
import { pool, type DB } from './index.js';

type LicenseRow = {
  id: string;
  order_id: string;
  status: string;
  starts_at: string | Date;
  ends_at: string | Date;
};

type OrderRow = {
  id: string;
  organization_id: string;
  asset_id: string;
  scope: Record<string, unknown>;
};

type AssetRow = {
  id: string;
  user_id: string;
};

function iso(v: string | Date) {
  return new Date(v).toISOString();
}

export async function upsertRightsGrantFromLicense(
  db: DB,
  input: { license: LicenseRow; order: OrderRow; asset: AssetRow },
) {
  const { license, order, asset } = input;
  const existing = (
    await db.query(
      "SELECT id FROM rights_grants WHERE source_type='MARKETPLACE_LICENSE' AND source_id=$1",
      [license.id],
    )
  ).rows[0] as { id: string } | undefined;

  const grantId = existing?.id ?? randomUUID();
  const status = licenseStatusToGrantStatus(license.status);
  const scope =
    order.scope && typeof order.scope === 'object'
      ? (order.scope as Record<string, unknown>)
      : {};

  const payload = buildMarketplaceGrantPayload({
    grantId,
    grantorUserId: asset.user_id,
    granteeOrganizationId: order.organization_id,
    assetId: order.asset_id,
    licenseId: license.id,
    validFrom: iso(license.starts_at),
    validUntil: iso(license.ends_at),
    status,
    scope,
  });

  await db.query(
    `INSERT INTO rights_grants(
       id, grantor_user_id, grantee_organization_id, asset_id,
       source_type, source_id, payload, status, valid_from, valid_until, updated_at
     ) VALUES ($1,$2,$3,$4,'MARKETPLACE_LICENSE',$5,$6,$7,$8,$9,now())
     ON CONFLICT (source_type, source_id) DO UPDATE SET
       payload = EXCLUDED.payload,
       status = EXCLUDED.status,
       valid_from = EXCLUDED.valid_from,
       valid_until = EXCLUDED.valid_until,
       grantor_user_id = EXCLUDED.grantor_user_id,
       grantee_organization_id = EXCLUDED.grantee_organization_id,
       asset_id = EXCLUDED.asset_id,
       updated_at = now()`,
    [
      grantId,
      asset.user_id,
      order.organization_id,
      order.asset_id,
      license.id,
      JSON.stringify(payload),
      status,
      payload.valid_from,
      payload.valid_until,
    ],
  );
  return payload;
}

export async function upsertRightsGrantFromExternalAgreement(
  db: DB,
  input: {
    agreementId: string;
    organizationId: string;
    assetId: string;
    grantorUserId: string;
    proposed: ExternalProposedRights;
  },
) {
  const existing = (
    await db.query(
      "SELECT id FROM rights_grants WHERE source_type='EXISTING_AGREEMENT' AND source_id=$1",
      [input.agreementId],
    )
  ).rows[0] as { id: string } | undefined;

  const grantId = existing?.id ?? randomUUID();
  const status: RightsGrantStatus = 'ACTIVE';
  const payload = buildExternalAgreementGrantPayload({
    grantId,
    grantorUserId: input.grantorUserId,
    granteeOrganizationId: input.organizationId,
    assetId: input.assetId,
    agreementId: input.agreementId,
    status,
    proposed: input.proposed,
  });

  await db.query(
    `INSERT INTO rights_grants(
       id, grantor_user_id, grantee_organization_id, asset_id,
       source_type, source_id, payload, status, valid_from, valid_until, updated_at
     ) VALUES ($1,$2,$3,$4,'EXISTING_AGREEMENT',$5,$6,$7,$8,$9,now())
     ON CONFLICT (source_type, source_id) DO UPDATE SET
       payload = EXCLUDED.payload,
       status = EXCLUDED.status,
       valid_from = EXCLUDED.valid_from,
       valid_until = EXCLUDED.valid_until,
       grantor_user_id = EXCLUDED.grantor_user_id,
       grantee_organization_id = EXCLUDED.grantee_organization_id,
       asset_id = EXCLUDED.asset_id,
       updated_at = now()`,
    [
      grantId,
      input.grantorUserId,
      input.organizationId,
      input.assetId,
      input.agreementId,
      JSON.stringify(payload),
      status,
      payload.valid_from,
      payload.valid_until,
    ],
  );
  return payload;
}

export async function syncRightsGrantStatusForLicense(
  db: DB,
  licenseId: string,
  licenseStatus: string,
) {
  const status = licenseStatusToGrantStatus(licenseStatus);
  const r = await db.query(
    `UPDATE rights_grants
     SET status=$2,
         payload = jsonb_set(payload, '{status}', to_jsonb($2::text), true),
         updated_at=now()
     WHERE source_type='MARKETPLACE_LICENSE' AND source_id=$1
     RETURNING id`,
    [licenseId, status],
  );
  return r.rowCount ?? 0;
}

export async function backfillMarketplaceRightsGrants(db: DB = pool) {
  const rows = (
    await db.query(
      `SELECT l.id, l.order_id, l.status, l.starts_at, l.ends_at,
              o.organization_id, o.asset_id, o.scope,
              c.user_id AS asset_user_id
       FROM licenses l
       JOIN orders o ON o.id = l.order_id
       JOIN assets a ON a.id = o.asset_id
       JOIN creators c ON c.id = a.creator_id
       WHERE l.status IN ('issued','suspended','revoked')
         AND NOT EXISTS (
           SELECT 1 FROM rights_grants g
           WHERE g.source_type='MARKETPLACE_LICENSE' AND g.source_id=l.id
         )`,
    )
  ).rows;

  let created = 0;
  for (const row of rows) {
    await upsertRightsGrantFromLicense(db, {
      license: {
        id: row.id,
        order_id: row.order_id,
        status: row.status,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
      },
      order: {
        id: row.order_id,
        organization_id: row.organization_id,
        asset_id: row.asset_id,
        scope: row.scope,
      },
      asset: { id: row.asset_id, user_id: row.asset_user_id },
    });
    created++;
  }
  return { created, scanned: rows.length };
}
