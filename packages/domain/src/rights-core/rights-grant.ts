import { z } from 'zod';
import { RuleStateSchema, UuidSchema, UtcInstantSchema } from './schemas.js';

export const RightsGrantSourceTypeSchema = z.enum([
  'MARKETPLACE_LICENSE',
  'EXISTING_AGREEMENT',
]);
export type RightsGrantSourceType = z.infer<typeof RightsGrantSourceTypeSchema>;

export const RightsGrantStatusSchema = z.enum([
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'REVOKED',
]);
export type RightsGrantStatus = z.infer<typeof RightsGrantStatusSchema>;

export const RightsGrantPayloadSchema = z
  .object({
    schema_version: z.literal('rightsnet.rights-grant/0.1'),
    grant_id: UuidSchema,
    grantor_user_id: UuidSchema,
    grantee_organization_id: UuidSchema,
    asset_id: UuidSchema,
    source: z
      .object({
        type: RightsGrantSourceTypeSchema,
        id: UuidSchema,
      })
      .strict(),
    rights: z.record(z.string(), RuleStateSchema),
    industry: z.array(z.string()),
    territories: z.array(z.string()),
    approval: z.record(z.string(), z.string()),
    valid_from: UtcInstantSchema,
    valid_until: UtcInstantSchema,
    status: RightsGrantStatusSchema,
    scope_snapshot: z.record(z.string(), z.unknown()),
  })
  .strict();

export type RightsGrantPayload = z.infer<typeof RightsGrantPayloadSchema>;

export function licenseStatusToGrantStatus(
  licenseStatus: string,
): RightsGrantStatus {
  if (licenseStatus === 'suspended') return 'SUSPENDED';
  if (licenseStatus === 'revoked') return 'REVOKED';
  return 'ACTIVE';
}

/** Derive machine-readable slices from frozen order scope (legacy Usage or Rights Core request). */
export function grantDimensionsFromScope(scope: Record<string, unknown>): {
  rights: Record<string, z.infer<typeof RuleStateSchema>>;
  industry: string[];
  territories: string[];
  approval: Record<string, string>;
} {
  const rights: Record<string, z.infer<typeof RuleStateSchema>> = {};
  const operation = scope.operation ?? scope.generation_type;
  if (typeof operation === 'string' && operation.length > 0) rights[operation] = 'ALLOW';
  if (scope.purpose === 'commercial_advertising' || scope.operation) {
    rights.commercial_advertising = 'ALLOW';
  }

  const industry: string[] = [];
  if (typeof scope.industry === 'string') industry.push(scope.industry);
  else if (typeof scope.category === 'string') industry.push(scope.category);

  const territories = Array.isArray(scope.territories)
    ? scope.territories.filter((t): t is string => typeof t === 'string')
    : [];

  const approval: Record<string, string> = {};
  if (scope.exclusivity && scope.exclusivity !== 'none') {
    approval.exclusivity = String(scope.exclusivity);
  }

  return { rights, industry, territories, approval };
}

export function buildMarketplaceGrantPayload(input: {
  grantId: string;
  grantorUserId: string;
  granteeOrganizationId: string;
  assetId: string;
  licenseId: string;
  validFrom: string;
  validUntil: string;
  status: RightsGrantStatus;
  scope: Record<string, unknown>;
}): RightsGrantPayload {
  const dims = grantDimensionsFromScope(input.scope);
  return RightsGrantPayloadSchema.parse({
    schema_version: 'rightsnet.rights-grant/0.1',
    grant_id: input.grantId,
    grantor_user_id: input.grantorUserId,
    grantee_organization_id: input.granteeOrganizationId,
    asset_id: input.assetId,
    source: { type: 'MARKETPLACE_LICENSE', id: input.licenseId },
    rights: dims.rights,
    industry: dims.industry,
    territories: dims.territories,
    approval: dims.approval,
    valid_from: new Date(input.validFrom).toISOString(),
    valid_until: new Date(input.validUntil).toISOString(),
    status: input.status,
    scope_snapshot: input.scope,
  });
}

/** Structured rights draft for Existing Deal ingest (human-written extract). */
export const ExternalProposedRightsSchema = z
  .object({
    rights: z.record(z.string(), RuleStateSchema),
    industry: z.array(z.string()).min(1).max(16),
    territories: z.array(z.string()).min(1).max(32),
    approval: z.record(z.string(), z.string()).default({}),
    valid_from: UtcInstantSchema,
    valid_until: UtcInstantSchema,
  })
  .strict()
  .superRefine((p, ctx) => {
    if (new Date(p.valid_until) <= new Date(p.valid_from)) {
      ctx.addIssue({
        code: 'custom',
        message: 'valid_until must be after valid_from',
        path: ['valid_until'],
      });
    }
  });

export type ExternalProposedRights = z.infer<typeof ExternalProposedRightsSchema>;

export function buildExternalAgreementGrantPayload(input: {
  grantId: string;
  grantorUserId: string;
  granteeOrganizationId: string;
  assetId: string;
  agreementId: string;
  status: RightsGrantStatus;
  proposed: ExternalProposedRights;
}): RightsGrantPayload {
  const proposed = ExternalProposedRightsSchema.parse(input.proposed);
  return RightsGrantPayloadSchema.parse({
    schema_version: 'rightsnet.rights-grant/0.1',
    grant_id: input.grantId,
    grantor_user_id: input.grantorUserId,
    grantee_organization_id: input.granteeOrganizationId,
    asset_id: input.assetId,
    source: { type: 'EXISTING_AGREEMENT', id: input.agreementId },
    rights: proposed.rights,
    industry: proposed.industry,
    territories: proposed.territories,
    approval: proposed.approval,
    valid_from: new Date(proposed.valid_from).toISOString(),
    valid_until: new Date(proposed.valid_until).toISOString(),
    status: input.status,
    scope_snapshot: {
      source: 'EXISTING_AGREEMENT',
      agreement_id: input.agreementId,
      ...proposed,
    },
  });
}
