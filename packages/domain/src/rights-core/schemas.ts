import { z } from 'zod';

export const ENGINE_VERSION = 'rightsnet.engine/0.1' as const;

export const RuleStateSchema = z.enum([
  'ALLOW',
  'DENY',
  'REQUIRES_APPROVAL',
  'NOT_SPECIFIED',
]);
export type RuleState = z.infer<typeof RuleStateSchema>;

export const IndustrySchema = z.enum([
  'beauty',
  'lifestyle',
  'fashion',
  'alcohol',
  'gambling',
  'tobacco',
  'political_advertising',
  'adult',
]);
export type Industry = z.infer<typeof IndustrySchema>;

export const OperationSchema = z.enum(['synthetic_image', 'synthetic_video']);
export type Operation = z.infer<typeof OperationSchema>;

export const ChannelSchema = z.enum(['instagram', 'tiktok', 'youtube']);
export type Channel = z.infer<typeof ChannelSchema>;

export const TerritorySchema = z.enum(['AT', 'DE']);
export type Territory = z.infer<typeof TerritorySchema>;

export const DurationDaysSchema = z.union([z.literal(30), z.literal(90)]);
export type DurationDays = z.infer<typeof DurationDaysSchema>;

export const Sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'hash must be lowercase sha-256 hex');

export const UuidSchema = z.string().uuid();

export const UtcInstantSchema = z.iso.datetime();

function rules<const K extends readonly string[]>(keys: K) {
  const shape = Object.fromEntries(keys.map((k) => [k, RuleStateSchema])) as {
    [P in K[number]]: typeof RuleStateSchema;
  };
  return z.object(shape).strict();
}

function uniqueEnumArray<T extends z.ZodType>(item: T, min = 1, max = 8) {
  return z
    .array(item)
    .min(min)
    .max(max)
    .superRefine((arr, ctx) => {
      if (new Set(arr as unknown[]).size !== arr.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicate set members are rejected',
        });
      }
    });
}

const MoneyMinorSchema = z
  .number()
  .int()
  .positive()
  .refine((n) => Number.isFinite(n), 'money must be finite');

const NullableMoneySchema = z.union([MoneyMinorSchema, z.null()]);

export const RightsPolicySchema = z
  .object({
    schema_version: z.literal('rightsnet.rights-policy/0.1'),
    policy_id: UuidSchema,
    asset_id: UuidSchema,
    creator_id: UuidSchema,
    revision: z.number().int().positive(),
    supersedes_policy_id: z.union([UuidSchema, z.null()]),
    created_at: UtcInstantSchema,
    purpose: rules(['commercial_advertising'] as const),
    operations: rules(['synthetic_image', 'synthetic_video'] as const),
    industries: rules([
      'beauty',
      'lifestyle',
      'fashion',
      'alcohol',
      'gambling',
      'tobacco',
      'political_advertising',
      'adult',
    ] as const),
    territories: rules(['AT', 'DE'] as const),
    channels: rules(['instagram', 'tiktok', 'youtube'] as const),
    durations: rules(['30', '90'] as const),
    exclusivity: rules(['exclusive'] as const),
    additional_rights: rules(['sublicensing', 'training', 'voice_clone'] as const),
    approval_mode: z.enum(['AUTOMATIC', 'MANUAL']),
    pricing: z
      .object({
        revision: z.number().int().positive(),
        currency: z.literal('EUR'),
        duration_prices_minor: z
          .object({
            '30': NullableMoneySchema,
            '90': NullableMoneySchema,
          })
          .strict(),
      })
      .strict(),
    platform_policy_version: z.string().min(1),
    license_terms_version: z.string().min(1),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (policy.exclusivity.exclusive !== 'DENY') {
      ctx.addIssue({
        code: 'custom',
        path: ['exclusivity', 'exclusive'],
        message: 'exclusivity must be DENY in V1',
      });
    }
    for (const key of ['sublicensing', 'training', 'voice_clone'] as const) {
      if (policy.additional_rights[key] !== 'DENY') {
        ctx.addIssue({
          code: 'custom',
          path: ['additional_rights', key],
          message: 'additional rights must be DENY in V1',
        });
      }
    }
  });
export type RightsPolicy = z.infer<typeof RightsPolicySchema>;

export const LicenseRequestSchema = z
  .object({
    schema_version: z.literal('rightsnet.license-request/0.1'),
    request_id: UuidSchema,
    buyer_organization_id: UuidSchema,
    creator_id: UuidSchema,
    asset_id: UuidSchema,
    policy_id: UuidSchema,
    campaign_name: z.string().trim().min(3).max(120),
    purpose: z.literal('commercial_advertising'),
    industry: IndustrySchema,
    generation_type: OperationSchema,
    territories: uniqueEnumArray(TerritorySchema, 1, 2),
    channels: uniqueEnumArray(ChannelSchema, 1, 3),
    starts_at: UtcInstantSchema,
    duration_days: DurationDaysSchema,
    commercial_use: z.literal(true),
    exclusivity: z.literal('none'),
    requested_additional_rights: z.tuple([]),
  })
  .strict();
export type LicenseRequest = z.infer<typeof LicenseRequestSchema>;

/** Draft may omit buyer-facing fields; unknown enums/extra fields still reject. */
export const DraftLicenseRequestSchema = z
  .object({
    schema_version: z.literal('rightsnet.license-request/0.1'),
    request_id: UuidSchema,
    buyer_organization_id: UuidSchema,
    creator_id: UuidSchema,
    asset_id: UuidSchema,
    policy_id: UuidSchema,
    campaign_name: z.string().trim().min(3).max(120).optional(),
    purpose: z.literal('commercial_advertising').optional(),
    industry: IndustrySchema.optional(),
    generation_type: OperationSchema.optional(),
    territories: uniqueEnumArray(TerritorySchema, 1, 2).optional(),
    channels: uniqueEnumArray(ChannelSchema, 1, 3).optional(),
    starts_at: UtcInstantSchema.optional(),
    duration_days: DurationDaysSchema.optional(),
    commercial_use: z.literal(true).optional(),
    exclusivity: z.literal('none').optional(),
    requested_additional_rights: z.tuple([]).optional(),
  })
  .strict();
export type DraftLicenseRequest = z.infer<typeof DraftLicenseRequestSchema>;

export const LicenseDecisionSchema = z
  .object({
    schema_version: z.literal('rightsnet.license-decision/0.1'),
    decision: z.enum(['ALLOW', 'DENY', 'REQUIRES_APPROVAL', 'INCOMPLETE']),
    reason_codes: z.array(z.string()),
    missing_fields: z.array(z.string()),
    request_hash: Sha256Schema,
    policy_hash: Sha256Schema,
    platform_policy_version: z.string().min(1),
    engine_version: z.literal(ENGINE_VERSION),
    evaluated_at: UtcInstantSchema,
  })
  .strict();
export type LicenseDecision = z.infer<typeof LicenseDecisionSchema>;

export const SafetyStatusSchema = z.enum([
  'CLEARED',
  'REVIEW_REQUIRED',
  'PROHIBITED',
  'UNKNOWN',
]);

export const SafetyAssessmentSchema = z
  .object({
    assessor: z.string().min(1),
    source: z.string().min(1),
    version: z.string().min(1),
    assessed_at: UtcInstantSchema,
    request_hash: Sha256Schema,
    status: SafetyStatusSchema,
    reason_codes: z.array(z.string()),
  })
  .strict();
export type SafetyAssessment = z.infer<typeof SafetyAssessmentSchema>;

export const PlatformPolicySchema = z
  .object({
    version: z.string().min(1),
    prohibited_industries: z.array(IndustrySchema),
    prohibited_intent_codes: z.array(z.string()),
  })
  .strict();
export type PlatformPolicy = z.infer<typeof PlatformPolicySchema>;

export const ApprovalActionSchema = z
  .object({
    actor_id: UuidSchema,
    actor_role: z.enum(['creator', 'platform_reviewer']),
    request_id: UuidSchema,
    buyer_organization_id: UuidSchema,
    asset_id: UuidSchema,
    request_hash: Sha256Schema,
    policy_hash: Sha256Schema,
    platform_policy_version: z.string().min(1),
    decision: z.enum(['APPROVED', 'REJECTED']),
    decided_at: UtcInstantSchema,
    expires_at: UtcInstantSchema,
    revision: z.number().int().positive(),
  })
  .strict();
export type ApprovalAction = z.infer<typeof ApprovalActionSchema>;

export const TrustedContextSchema = z
  .object({
    buyer_verified: z.boolean(),
    creator_verified: z.boolean(),
    creator_adult: z.boolean(),
    identity_expires_at: z.union([UtcInstantSchema, z.null()]),
    asset_relationship_verified: z.boolean(),
    asset_available: z.boolean(),
    current_policy_id: UuidSchema,
    consent: z.union([
      z
        .object({
          policy_id: UuidSchema,
          license_terms_version: z.string().min(1),
        })
        .strict(),
      z.null(),
    ]),
    platform_policy: PlatformPolicySchema,
    safety_assessment: z.union([SafetyAssessmentSchema, z.null()]),
    creator_approval: z.union([ApprovalActionSchema, z.null()]),
    platform_review: z.union([ApprovalActionSchema, z.null()]),
  })
  .strict();
export type TrustedContext = z.infer<typeof TrustedContextSchema>;

export const BASELINE_PLATFORM_POLICY: PlatformPolicy = {
  version: 'platform-policy/0.1',
  prohibited_industries: ['gambling', 'tobacco', 'political_advertising', 'adult'],
  prohibited_intent_codes: [
    'fraud',
    'scams',
    'fraudulent_impersonation',
    'non_consensual_sexual_content',
    'deceptive_identity_misuse',
    'illegal_activity',
    'unauthorized_political_impersonation',
    'prohibited_misleading_statements',
  ],
};

export const RightsPassportPrivateSchema = z
  .object({
    schema_version: z.literal('rightsnet.rights-passport/0.1'),
    passport_id: UuidSchema,
    revision: z.number().int().positive(),
    asset_id: UuidSchema,
    asset_version: z.number().int().positive(),
    creator_id: UuidSchema,
    policy_id: UuidSchema,
    policy_revision: z.number().int().positive(),
    policy_hash: Sha256Schema,
    purpose: RightsPolicySchema.shape.purpose,
    operations: RightsPolicySchema.shape.operations,
    industries: RightsPolicySchema.shape.industries,
    territories: RightsPolicySchema.shape.territories,
    channels: RightsPolicySchema.shape.channels,
    durations: RightsPolicySchema.shape.durations,
    exclusivity: RightsPolicySchema.shape.exclusivity,
    additional_rights: RightsPolicySchema.shape.additional_rights,
    pricing: RightsPolicySchema.shape.pricing,
    platform_policy_version: z.string().min(1),
    license_terms_version: z.string().min(1),
    identity_verification_level: z.enum(['none', 'basic', 'strong']),
    relationship_verification_level: z.enum(['none', 'basic', 'strong']),
    generated_at: UtcInstantSchema,
    public_display_name: z.string().min(1),
    public_profile_slug: z.string().min(1),
    evidence_refs: z.array(z.string()),
    consent_receipt_refs: z.array(z.string()),
    legal_name: z.string().optional(),
    contact_email: z.string().optional(),
    date_of_birth: z.string().optional(),
    identity_document_refs: z.array(z.string()).optional(),
    evidence_storage_urls: z.array(z.string()).optional(),
    buyer_organization_id: UuidSchema.optional(),
    contract_refs: z.array(z.string()).optional(),
    transaction_refs: z.array(z.string()).optional(),
  })
  .strict();
export type RightsPassportPrivate = z.infer<typeof RightsPassportPrivateSchema>;

export const RightsPassportPublicSchema = z
  .object({
    schema_version: z.literal('rightsnet.rights-passport/0.1'),
    passport_id: UuidSchema,
    revision: z.number().int().positive(),
    asset_id: UuidSchema,
    asset_version: z.number().int().positive(),
    creator_id: UuidSchema,
    policy_id: UuidSchema,
    policy_revision: z.number().int().positive(),
    policy_hash: Sha256Schema,
    purpose: RightsPolicySchema.shape.purpose,
    operations: RightsPolicySchema.shape.operations,
    industries: RightsPolicySchema.shape.industries,
    territories: RightsPolicySchema.shape.territories,
    channels: RightsPolicySchema.shape.channels,
    durations: RightsPolicySchema.shape.durations,
    exclusivity: RightsPolicySchema.shape.exclusivity,
    additional_rights: RightsPolicySchema.shape.additional_rights,
    pricing: RightsPolicySchema.shape.pricing,
    platform_policy_version: z.string().min(1),
    license_terms_version: z.string().min(1),
    identity_verification_level: z.enum(['none', 'basic', 'strong']),
    relationship_verification_level: z.enum(['none', 'basic', 'strong']),
    generated_at: UtcInstantSchema,
    public_display_name: z.string().min(1),
    public_profile_slug: z.string().min(1),
  })
  .strict();
export type RightsPassportPublic = z.infer<typeof RightsPassportPublicSchema>;
