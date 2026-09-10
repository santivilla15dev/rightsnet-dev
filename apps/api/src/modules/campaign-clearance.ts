import { z } from 'zod';
import { pool, transaction, audit } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import {
  CampaignUsageSchema,
  evaluateCampaignClearance,
  type ClearanceTalent,
} from '../../../../packages/domain/src/rights-core/campaign-clearance.js';
import { findCampaign } from './campaigns.js';
import { mutate } from '../common/idempotency.js';
import type { Actor } from '../common/auth.js';

export async function updateCampaignUsage(user: Actor, id: string, body: unknown, key?: string) {
  const data = z
    .object({ usage: CampaignUsageSchema, expected_revision: z.number().int().positive() })
    .strict()
    .parse(body);
  await findCampaign(pool, user, id, true);
  return mutate(user.id, `campaigns/${id}/usage`, key, data, async (db) => {
    await findCampaign(db, user, id, true);
    const row = await db.query(
      'UPDATE campaigns SET usage=$2,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$3 RETURNING revision',
      [id, JSON.stringify(data.usage), data.expected_revision],
    );
    if (!row.rowCount)
      throw new DomainError(
        'CAMPAIGN_CONFLICT',
        409,
        'La campaña ha cambiado. Recarga antes de guardar.',
      );
    await audit(db, user.id, 'campaign.usage_updated', id, { revision: row.rows[0].revision });
    return findCampaign(db, user, id);
  });
}
export async function getCampaignClearance(user: Actor, id: string, now?: Date) {
  return transaction(async (db) => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const campaign = await findCampaign(db, user, id);
    const at = now ?? new Date();
    const rows = (
      await db.query(
        `SELECT t.asset_id,t.selected_grant_id,c.display_name,g.id,g.status,g.valid_from,g.valid_until,g.payload
      FROM campaign_talent t JOIN assets a ON a.id=t.asset_id JOIN creators c ON c.id=a.creator_id
      LEFT JOIN rights_grants g ON g.id=t.selected_grant_id AND g.asset_id=t.asset_id AND g.grantee_organization_id=$2
      WHERE t.campaign_id=$1 ORDER BY t.asset_id`,
        [id, campaign.organization_id],
      )
    ).rows;
    const talents: ClearanceTalent[] = rows.map((r) => ({
      asset_id: r.asset_id,
      display_name: r.display_name,
      selected_grant_id: r.selected_grant_id,
      grant: r.id
        ? {
            id: r.id,
            status: r.status,
            valid_from: new Date(r.valid_from).toISOString(),
            valid_until: new Date(r.valid_until).toISOString(),
            payload: r.payload,
          }
        : null,
    }));
    return {
      campaign_id: id,
      revision: campaign.revision,
      usage: campaign.usage,
      can_edit: campaign.can_edit,
      ...evaluateCampaignClearance(
        campaign.usage,
        talents,
        campaign.organization_id,
        at.toISOString(),
      ),
    };
  });
}
