import { z } from 'zod';

export const GenerationOutputSchema = z
  .object({
    content_type: z.string().trim().min(1).max(64),
    external_job_id: z.string().trim().min(1).max(128).optional(),
    uri: z.string().trim().url().max(2048).optional(),
    sha256: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
    mime_type: z.string().trim().min(1).max(128).optional(),
    width: z.number().int().positive().max(100_000).optional(),
    height: z.number().int().positive().max(100_000).optional(),
    duration_ms: z.number().int().positive().max(86_400_000).optional(),
    created_at: z.string().datetime().optional(),
  })
  .strict()
  .refine(
    (o) => Boolean(o.uri || o.external_job_id || o.sha256),
    { message: 'output requires uri, external_job_id, or sha256' },
  );

export const GenerationRecordPayloadSchema = z
  .object({
    schema_version: z.literal('rightsnet.generation-record/0.1'),
    generation_id: z.string().uuid(),
    auth_id: z.string().uuid(),
    grant_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    asset_id: z.string().uuid(),
    provider: z.string().trim().min(1).max(64),
    use: z
      .object({
        content_type: z.string().trim().min(1).max(64),
        purpose: z.string().trim().min(1).max(64),
        territory: z.string().trim().min(1).max(16),
        industry: z.string().trim().min(1).max(64).optional(),
      })
      .strict(),
    output: GenerationOutputSchema,
    notes: z.string().trim().max(500).optional(),
    reported_at: z.string().datetime(),
  })
  .strict();

export type GenerationRecordPayload = z.infer<typeof GenerationRecordPayloadSchema>;
