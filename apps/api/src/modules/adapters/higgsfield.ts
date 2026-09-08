/**
 * Higgsfield adapter — orchestrates RightsNet Connect + sandbox stub or live HF (L1).
 * Not a second rights engine. Nest route (L2) and webhooks (L3) are out of scope.
 */
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '../../../../../packages/domain/src/index.js';
import { config } from '../../common/config.js';
import { platformAuthorizeGeneration } from '../platform.js';
import { platformReportOutput } from '../report-output.js';
import { publicVerifyGeneration } from '../generation-verify.js';
import {
  liveHiggsfieldJob,
  type HiggsfieldLiveClientDeps,
  type HiggsfieldLiveJobResult,
} from './higgsfield-live-client.js';

const RunSchema = z
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
    /** Prompt / brief forwarded to live HF; ignored by sandbox stub shape. */
    brief: z.string().trim().max(2000).optional(),
    /** Optional HF model path override (e.g. higgsfield-ai/soul/v2/standard). */
    model: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export type HiggsfieldAdapterInput = z.infer<typeof RunSchema>;

export type HiggsfieldAdapterResult =
  | {
      ok: true;
      decision: 'AUTHORIZED';
      auth_id: string;
      grant_id: string;
      hf_job_id: string;
      generation_id: string;
      public_token: string;
      verify_hint: string | null;
      mode: 'sandbox' | 'live';
    }
  | {
      ok: false;
      decision: 'DENIED' | 'REQUIRES_APPROVAL';
      reason_codes: string[];
      hf_called: false;
    };

/** Fake HF job — no network. Returns job id + placeholder public URI + sha256. */
export function sandboxHiggsfieldJob(meta: {
  auth_id: string;
  organization_id: string;
  asset_id: string;
  content_type: string;
}) {
  const hf_job_id = `hf_sandbox_${randomUUID().slice(0, 8)}`;
  const uri = `https://sandbox.higgsfield.invalid/outputs/${hf_job_id}`;
  const sha256 = createHash('sha256')
    .update(`${meta.auth_id}:${meta.organization_id}:${hf_job_id}`)
    .digest('hex');
  return {
    hf_job_id,
    uri,
    sha256,
    content_type: meta.content_type,
    metadata: {
      auth_id: meta.auth_id,
      organization_id: meta.organization_id,
      asset_id: meta.asset_id,
      provider: 'higgsfield' as const,
    },
  };
}

export function assertHiggsfieldAdapterEnabled() {
  if (!config.higgsfieldAdapterEnabled) {
    throw new DomainError(
      'HIGGSFIELD_ADAPTER_DISABLED',
      404,
      'Higgsfield adapter no está habilitado (HIGGSFIELD_ADAPTER_ENABLED).',
    );
  }
}

export type RunHiggsfieldOpts = {
  requireFlag?: boolean;
  /** Force mode (tests). Defaults to config.higgsfieldMode. */
  mode?: 'sandbox' | 'live';
  /** Inject live client deps (mock fetch) — CI must not hit real HF. */
  liveClient?: HiggsfieldLiveClientDeps;
  /** Replace entire live job (unit tests). */
  liveJobFn?: (
    input: Parameters<typeof liveHiggsfieldJob>[0],
    deps?: HiggsfieldLiveClientDeps,
  ) => Promise<HiggsfieldLiveJobResult>;
  /** Clock for RN-AUTH expiry guard before report. */
  nowFn?: () => Date;
};

/**
 * authorize → sandbox stub | live HF → report_output → optional verify.
 * Requires cleared ACTIVE grant for AUTHORIZED path.
 */
export async function runHiggsfieldAdapter(
  input: unknown,
  opts: RunHiggsfieldOpts = {},
): Promise<HiggsfieldAdapterResult> {
  if (opts.requireFlag !== false) assertHiggsfieldAdapterEnabled();

  const mode = opts.mode ?? config.higgsfieldMode;
  const data = RunSchema.parse(input);
  const authz = await platformAuthorizeGeneration({
    organization_id: data.organization_id,
    asset_id: data.asset_id,
    provider: 'higgsfield',
    use: data.use,
  });

  if (authz.decision !== 'AUTHORIZED' || !authz.auth_token) {
    return {
      ok: false,
      decision: authz.decision as 'DENIED' | 'REQUIRES_APPROVAL',
      reason_codes: authz.reason_codes,
      hf_called: false,
    };
  }

  const auth_id = authz.auth_token.payload.auth_id;
  const now = opts.nowFn ?? (() => new Date());

  let job: {
    hf_job_id: string;
    uri: string;
    sha256: string;
  };

  if (mode === 'live') {
    const prompt =
      data.brief?.trim() ||
      `RightsNet licensed likeness generation for asset ${data.asset_id}`;
    const jobFn = opts.liveJobFn ?? liveHiggsfieldJob;
    const live = await jobFn(
      {
        prompt,
        model_path: data.model,
        metadata: {
          auth_id,
          grant_id: authz.grant_id!,
          organization_id: data.organization_id,
          asset_id: data.asset_id,
        },
      },
      opts.liveClient,
    );
    job = live;
  } else {
    job = sandboxHiggsfieldJob({
      auth_id,
      organization_id: data.organization_id,
      asset_id: data.asset_id,
      content_type: data.use.content_type,
    });
  }

  // Fail closed if RN-AUTH already expired (or <30s left) before report.
  const expiresAt = new Date(authz.auth_token.payload.expires_at).getTime();
  if (expiresAt - now().getTime() < 30_000) {
    throw new DomainError(
      'HIGGSFIELD_AUTH_EXPIRED',
      409,
      'RN-AUTH expiró (o está a punto de expirar) antes de report_output; re-autorizar.',
    );
  }

  const reported = await platformReportOutput({
    auth_id,
    organization_id: data.organization_id,
    provider: 'higgsfield',
    idempotency_key: job.hf_job_id.slice(0, 64),
    output: {
      content_type: data.use.content_type,
      external_job_id: job.hf_job_id,
      uri: job.uri,
      sha256: job.sha256,
    },
  });

  if (!reported.public_token) {
    throw new DomainError('ADAPTER_MISSING_PUBLIC_TOKEN', 500);
  }

  await publicVerifyGeneration(reported.public_token);

  return {
    ok: true,
    decision: 'AUTHORIZED',
    auth_id,
    grant_id: authz.grant_id!,
    hf_job_id: job.hf_job_id,
    generation_id: reported.generation_id,
    public_token: reported.public_token,
    verify_hint: reported.verify_hint,
    mode,
  };
}

/** @deprecated Prefer runHiggsfieldAdapter — kept for CLI/tests. */
export async function runHiggsfieldSandboxAdapter(
  input: unknown,
  opts: RunHiggsfieldOpts = {},
): Promise<HiggsfieldAdapterResult> {
  return runHiggsfieldAdapter(input, opts);
}
