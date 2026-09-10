import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit, pool, type DB } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { mutate } from '../common/idempotency.js';

const fields = {
  name: z.string().trim().min(1).max(120),
  creative_brief: z.string().max(10000),
};
const createSchema = z.object({ organization_id: z.string().uuid(), ...fields }).strict();
const editSchema = z.object({ ...fields, expected_revision: z.number().int().positive() }).strict();
const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});

export async function campaignAccess(db: DB, user: Actor, org: string, write = false) {
  const membership = (
    await db.query(
      'SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2',
      [org, user.id],
    )
  ).rows[0];
  if (!membership || !['owner', 'employee'].includes(membership.role))
    throw new DomainError('NOT_FOUND', 404);
  if (write && membership.role !== 'owner') throw new DomainError('FORBIDDEN', 403);
  return membership.role === 'owner';
}

export async function findCampaign(db: DB, user: Actor, id: string, write = false) {
  z.string().uuid().parse(id);
  const row = (await db.query('SELECT * FROM campaigns WHERE id=$1', [id])).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404);
  const can_edit = await campaignAccess(db, user, row.organization_id, write);
  return { ...row, can_edit, clearance_status: 'NOT_EVALUATED' as const };
}

export async function listCampaigns(user: Actor, query: unknown) {
  const data = pagination.extend({ organization_id: z.string().uuid() }).strict().parse(query);
  const can_edit = await campaignAccess(pool, user, data.organization_id);
  const rows = (
    await pool.query(
      `SELECT id, organization_id, name, status, revision, created_at, updated_at
     FROM campaigns WHERE organization_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [data.organization_id, data.limit + 1, data.offset],
    )
  ).rows;
  return {
    items: rows.slice(0, data.limit),
    can_edit,
    next_offset: rows.length > data.limit ? data.offset + data.limit : null,
  };
}

export async function getCampaign(user: Actor, id: string, query: unknown = {}) {
  const { offset } = pagination.pick({ offset: true }).strict().parse(query);
  const campaign = await findCampaign(pool, user, id);
  const rows = (
    await pool.query(
      `SELECT action, details, created_at FROM audit_events
     WHERE resource_id=$1 AND action IN ('campaign.created','campaign.updated','campaign.talent_added','campaign.talent_removed','campaign.usage_updated','campaign.evidence_added','campaign.evidence_removed','campaign.deal_request_created','campaign.deal_request_updated','campaign.deal_request_sent','campaign.deal_request_withdrawn')
     ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET $2`,
      [id, offset],
    )
  ).rows;
  return {
    ...campaign,
    activity: rows.slice(0, 50),
    next_activity_offset: rows.length > 50 ? offset + 50 : null,
  };
}

export async function createCampaign(user: Actor, body: unknown, key?: string) {
  const data = createSchema.parse(body);
  // Recheck access even for a previously saved idempotent response.
  await campaignAccess(pool, user, data.organization_id, true);
  return mutate(user.id, 'campaigns', key, data, async (db) => {
    await campaignAccess(db, user, data.organization_id, true);
    const id = randomUUID();
    await db.query(
      'INSERT INTO campaigns(id,organization_id,name,creative_brief,created_by) VALUES($1,$2,$3,$4,$5)',
      [id, data.organization_id, data.name, data.creative_brief, user.id],
    );
    await audit(db, user.id, 'campaign.created', id, { revision: 1 });
    return findCampaign(db, user, id);
  });
}

export async function updateCampaign(user: Actor, id: string, body: unknown, key?: string) {
  const data = editSchema.parse(body);
  await findCampaign(pool, user, id, true);
  return mutate(user.id, 'campaigns/' + id, key, data, async (db) => {
    await findCampaign(db, user, id, true);
    const updated = await db.query(
      `UPDATE campaigns SET name=$2, creative_brief=$3, revision=revision+1, updated_at=now()
       WHERE id=$1 AND revision=$4 RETURNING id`,
      [id, data.name, data.creative_brief, data.expected_revision],
    );
    if (!updated.rowCount)
      throw new DomainError(
        'CAMPAIGN_CONFLICT',
        409,
        'La campaña ha cambiado. Recarga antes de guardar tu versión.',
      );
    await audit(db, user.id, 'campaign.updated', id, { revision: data.expected_revision + 1 });
    return findCampaign(db, user, id);
  });
}
