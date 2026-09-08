/**
 * Higgsfield adapter — orchestrates RightsNet Connect + (sandbox) generation stub.
 * Not a second rights engine. Live HF API is NOT implemented in v0.1.
 */
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '../../../../../packages/domain/src/index.js';
import { config } from '../../common/config.js';
import { platformAuthorizeGeneration } from '../platform.js';
import { platformReportOutput } from '../report-output.js';
import { publicVerifyGeneration } from '../generation-verify.js';

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
    /** Optional prompt / brief for future live HF — ignored in sandbox stub. */
    brief: z.string().trim().max(2000).optional(),
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
      mode: 'sandbox';
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

/**
 * authorize → sandbox HF stub → report_output → optional verify.
 * Requires cleared ACTIVE grant for AUTHORIZED path.
 */
export async function runHiggsfieldSandboxAdapter(
  input: unknown,
  opts: { requireFlag?: boolean } = {},
): Promise<HiggsfieldAdapterResult> {
  if (opts.requireFlag !== false) assertHiggsfieldAdapterEnabled();
  if (config.higgsfieldMode === 'live') {
    throw new DomainError(
      'HIGGSFIELD_LIVE_NOT_IMPLEMENTED',
      501,
      'Modo live de Higgsfield no está implementado; use HIGGSFIELD_MODE=sandbox.',
    );
  }

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
  const job = sandboxHiggsfieldJob({
    auth_id,
    organization_id: data.organization_id,
    asset_id: data.asset_id,
    content_type: data.use.content_type,
  });

  const reported = await platformReportOutput({
    auth_id,
    organization_id: data.organization_id,
    provider: 'higgsfield',
    idempotency_key: job.hf_job_id,
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

  // Sanity: public verify must succeed for the minted RN-GEN token.
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
    mode: 'sandbox',
  };
}
