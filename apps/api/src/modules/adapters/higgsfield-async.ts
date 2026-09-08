/**
 * Higgsfield L3 — async submit + webhook → report_output.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../../../../packages/db/index.js';
import { DomainError } from '../../../../../packages/domain/src/index.js';
import { config } from '../../common/config.js';
import { platformAuthorizeGeneration } from '../platform.js';
import { platformReportOutput } from '../report-output.js';
import { publicVerifyGeneration } from '../generation-verify.js';
import {
  assertHiggsfieldAdapterEnabled,
  sandboxHiggsfieldJob,
} from './higgsfield.js';
import {
  submitHiggsfieldJob,
  type HiggsfieldLiveClientDeps,
} from './higgsfield-live-client.js';

const AsyncRunSchema = z
  .object({
    organization_id: z.string().uuid(),
    asset_id: z.string().uuid(),
    use: z
      .object({
        content_type: z.string().trim().min(1).max(64),
        purpose: z.string().trim().min(1).max(64).default('commercial_advertising'),
        territory: z.string().trim().min(1).max(16),
        industry: z.string().trim().min(1).max(64).optional(),
        at: z.string().datetime().optional(),
      })
      .strict(),
    brief: z.string().trim().max(2000).optional(),
    model: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

const WebhookEnvelopeSchema = z
  .object({
    request_id: z.string().min(1).max(128),
    status: z.enum(['queued', 'in_progress', 'completed', 'failed', 'nsfw', 'canceled']),
    error: z.string().nullable().optional(),
    payload: z
      .object({
        images: z.array(z.object({ url: z.string().url() }).passthrough()).optional(),
        video: z.object({ url: z.string().url() }).passthrough().optional(),
        audio: z.object({ url: z.string().url() }).passthrough().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export function assertHiggsfieldWebhookSecret(headerValue: string | undefined) {
  const secret = config.higgsfieldWebhookSecret;
  if (!secret) return; // open in sandbox if unset (tests); production should set
  if (!headerValue) throw new DomainError('INVALID_SIGNATURE', 401, 'Webhook secret requerido.');
  const provided = headerValue.replace(/^Bearer\s+/i, '').trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new DomainError('INVALID_SIGNATURE', 401, 'Webhook secret inválido.');
  }
}

export type StartAsyncOpts = {
  requireFlag?: boolean;
  mode?: 'sandbox' | 'live';
  liveClient?: HiggsfieldLiveClientDeps;
  submitFn?: typeof submitHiggsfieldJob;
  webhookPublicUrl?: string;
};

/**
 * Authorize + submit (no poll). Stores pending row; webhook completes report_output.
 */
export async function startHiggsfieldAsyncAdapter(input: unknown, opts: StartAsyncOpts = {}) {
  if (opts.requireFlag !== false) assertHiggsfieldAdapterEnabled();
  const mode = opts.mode ?? config.higgsfieldMode;
  const data = AsyncRunSchema.parse(input);

  const authz = await platformAuthorizeGeneration({
    organization_id: data.organization_id,
    asset_id: data.asset_id,
    provider: 'higgsfield',
    use: data.use,
  });

  if (authz.decision !== 'AUTHORIZED' || !authz.auth_token) {
    return {
      ok: false as const,
      decision: authz.decision as 'DENIED' | 'REQUIRES_APPROVAL',
      reason_codes: authz.reason_codes,
      hf_called: false as const,
    };
  }

  const auth_id = authz.auth_token.payload.auth_id;
  const grant_id = authz.grant_id!;
  let hf_job_id: string;

  if (mode === 'live') {
    const prompt =
      data.brief?.trim() ||
      `RightsNet licensed likeness generation for asset ${data.asset_id}`;
    const submitFn = opts.submitFn ?? submitHiggsfieldJob;
    const webhookUrl =
      opts.webhookPublicUrl ??
      (config.higgsfieldWebhookPublicUrl || undefined);
    const submitted = await submitFn(
      {
        prompt,
        model_path: data.model,
        metadata: {
          auth_id,
          grant_id,
          organization_id: data.organization_id,
          asset_id: data.asset_id,
        },
      },
      { ...opts.liveClient, webhookUrl },
    );
    hf_job_id = submitted.hf_job_id;
  } else {
    const job = sandboxHiggsfieldJob({
      auth_id,
      organization_id: data.organization_id,
      asset_id: data.asset_id,
      content_type: data.use.content_type,
    });
    hf_job_id = job.hf_job_id;
  }

  await pool.query(
    `INSERT INTO higgsfield_pending_jobs(
       hf_job_id, auth_id, organization_id, asset_id, grant_id, content_type, mode, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
     ON CONFLICT (hf_job_id) DO NOTHING`,
    [
      hf_job_id,
      auth_id,
      data.organization_id,
      data.asset_id,
      grant_id,
      data.use.content_type,
      mode,
    ],
  );

  return {
    ok: true as const,
    decision: 'AUTHORIZED' as const,
    pending: true as const,
    auth_id,
    grant_id,
    hf_job_id,
    mode,
  };
}

function pickUriFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const video = p.video as { url?: string } | undefined;
  if (video?.url) return video.url;
  const images = p.images as Array<{ url?: string }> | undefined;
  if (images?.[0]?.url) return images[0].url;
  const audio = p.audio as { url?: string } | undefined;
  if (audio?.url) return audio.url;
  return null;
}

/**
 * HF webhook delivery → report_output. Idempotent on hf_job_id.
 */
export async function handleHiggsfieldWebhook(body: unknown) {
  const envelope = WebhookEnvelopeSchema.parse(body);
  const pending = (
    await pool.query('SELECT * FROM higgsfield_pending_jobs WHERE hf_job_id=$1', [
      envelope.request_id,
    ])
  ).rows[0] as
    | {
        hf_job_id: string;
        auth_id: string;
        organization_id: string;
        asset_id: string;
        grant_id: string;
        content_type: string;
        status: string;
      }
    | undefined;

  if (!pending) {
    // Unknown job — acknowledge to stop retries (or 404 if preferred). Acknowledge.
    return { ok: true, ignored: true as const, reason: 'unknown_job' };
  }

  if (pending.status === 'reported') {
    return { ok: true, idempotent: true as const, hf_job_id: pending.hf_job_id };
  }

  if (envelope.status !== 'completed') {
    await pool.query(
      `UPDATE higgsfield_pending_jobs
       SET status='failed', last_error=$2, reported_at=now()
       WHERE hf_job_id=$1 AND status='pending'`,
      [pending.hf_job_id, envelope.error ?? envelope.status],
    );
    return {
      ok: true,
      failed: true as const,
      hf_job_id: pending.hf_job_id,
      status: envelope.status,
    };
  }

  const uri = pickUriFromPayload(envelope.payload);
  if (!uri) {
    await pool.query(
      `UPDATE higgsfield_pending_jobs
       SET status='failed', last_error=$2, reported_at=now()
       WHERE hf_job_id=$1 AND status='pending'`,
      [pending.hf_job_id, 'completed_without_uri'],
    );
    throw new DomainError('HIGGSFIELD_WEBHOOK_NO_URI', 422, 'Webhook completed sin URL.');
  }

  const sha256 = createHash('sha256')
    .update(`${pending.hf_job_id}:${uri}`)
    .digest('hex');

  const reported = await platformReportOutput({
    auth_id: pending.auth_id,
    organization_id: pending.organization_id,
    provider: 'higgsfield',
    idempotency_key: pending.hf_job_id.slice(0, 64),
    output: {
      content_type: pending.content_type,
      external_job_id: pending.hf_job_id,
      uri,
      sha256,
    },
  });

  await pool.query(
    `UPDATE higgsfield_pending_jobs
     SET status='reported', reported_at=now(), last_error=NULL
     WHERE hf_job_id=$1`,
    [pending.hf_job_id],
  );

  if (reported.public_token) {
    await publicVerifyGeneration(reported.public_token);
  }

  return {
    ok: true,
    reported: true as const,
    hf_job_id: pending.hf_job_id,
    generation_id: reported.generation_id,
    public_token: reported.public_token,
    verify_hint: reported.verify_hint,
  };
}

/** Test helper: complete a sandbox pending job without HF network. */
export async function completeSandboxPendingJob(hf_job_id: string) {
  return handleHiggsfieldWebhook({
    request_id: hf_job_id,
    status: 'completed',
    error: null,
    payload: {
      images: [{ url: `https://sandbox.higgsfield.invalid/outputs/${hf_job_id}.jpg` }],
    },
  });
}

export function newSandboxPendingId() {
  return `hf_sandbox_${randomUUID().slice(0, 8)}`;
}
