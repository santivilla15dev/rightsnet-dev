/**
 * Higgsfield Cloud REST client (L1).
 * Auth: Authorization: Key {id}:{secret}
 * Docs: https://docs.higgsfield.ai/docs
 */
import { createHash } from 'node:crypto';
import { DomainError } from '../../../../../packages/domain/src/index.js';
import { config } from '../../common/config.js';

const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);

export type HiggsfieldLiveCredentials = {
  keyId: string;
  keySecret: string;
};

export type HiggsfieldLiveJobInput = {
  prompt: string;
  model_path?: string;
  metadata?: Record<string, string>;
};

export type HiggsfieldLiveJobResult = {
  hf_job_id: string;
  uri: string;
  sha256: string;
  content_type: string;
  status: 'completed';
  raw_status?: string;
};

export type HiggsfieldLiveClientDeps = {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
  baseUrl?: string;
  modelPath?: string;
  /** Max wall time for submit+poll (ms). */
  timeoutMs?: number;
  credentials?: HiggsfieldLiveCredentials | null;
  /** When set, append ?hf_webhook= to submit URL (L3 async). */
  webhookUrl?: string;
};

export type HiggsfieldSubmitResult = {
  hf_job_id: string;
  status: string;
  status_url?: string;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function resolveHiggsfieldCredentials(
  env: NodeJS.ProcessEnv = process.env,
): HiggsfieldLiveCredentials | null {
  const id = env.HIGGSFIELD_API_KEY_ID?.trim();
  const secret = env.HIGGSFIELD_API_KEY_SECRET?.trim();
  if (id && secret) return { keyId: id, keySecret: secret };

  // Convenience: HIGGSFIELD_API_KEY="keyId:keySecret"
  const combined = env.HIGGSFIELD_API_KEY?.trim();
  if (combined) {
    const idx = combined.indexOf(':');
    if (idx > 0 && idx < combined.length - 1) {
      return {
        keyId: combined.slice(0, idx),
        keySecret: combined.slice(idx + 1),
      };
    }
  }
  return null;
}

function authHeader(creds: HiggsfieldLiveCredentials) {
  return `Key ${creds.keyId}:${creds.keySecret}`;
}

function pickOutputUri(body: Record<string, unknown>): string | null {
  const video = body.video as { url?: string } | undefined;
  if (video?.url) return video.url;
  const images = body.images as Array<{ url?: string }> | undefined;
  if (images?.[0]?.url) return images[0].url;
  const audio = body.audio as { url?: string } | undefined;
  if (audio?.url) return audio.url;
  const audios = body.audios as Array<{ url?: string }> | undefined;
  if (audios?.[0]?.url) return audios[0].url;
  return null;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { detail: text.slice(0, 500) };
  }
}

/**
 * Submit only (no poll) — used by L3 async + webhook path.
 */
export async function submitHiggsfieldJob(
  input: HiggsfieldLiveJobInput,
  deps: HiggsfieldLiveClientDeps = {},
): Promise<HiggsfieldSubmitResult> {
  const creds = deps.credentials ?? resolveHiggsfieldCredentials();
  if (!creds) {
    throw new DomainError(
      'HIGGSFIELD_API_KEY_MISSING',
      503,
      'Modo live requiere HIGGSFIELD_API_KEY_ID+SECRET (o HIGGSFIELD_API_KEY=id:secret).',
    );
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const baseUrl = (deps.baseUrl ?? config.higgsfieldApiBase).replace(/\/$/, '');
  const modelPath = (input.model_path ?? deps.modelPath ?? config.higgsfieldModelPath).replace(
    /^\//,
    '',
  );
  let submitUrl = `${baseUrl}/${modelPath}`;
  if (deps.webhookUrl) {
    const u = new URL(submitUrl);
    u.searchParams.set('hf_webhook', deps.webhookUrl);
    submitUrl = u.toString();
  }

  const submitRes = await fetchFn(submitUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader(creds),
      'Content-Type': 'application/json',
      ...(input.metadata
        ? { 'X-RightsNet-Meta': JSON.stringify(input.metadata).slice(0, 1024) }
        : {}),
    },
    body: JSON.stringify({
      prompt: input.prompt,
      aspect_ratio: '16:9',
    }),
  });

  const submitBody = await readJson(submitRes);
  if (!submitRes.ok) {
    const detail =
      typeof submitBody.detail === 'string'
        ? submitBody.detail
        : `HTTP ${submitRes.status}`;
    throw new DomainError(
      'HIGGSFIELD_SUBMIT_FAILED',
      submitRes.status >= 400 && submitRes.status < 600 ? submitRes.status : 502,
      `Higgsfield submit falló: ${detail}`,
    );
  }

  const requestId = String(submitBody.request_id ?? '');
  if (!requestId) {
    throw new DomainError(
      'HIGGSFIELD_SUBMIT_FAILED',
      502,
      'Higgsfield no devolvió request_id.',
    );
  }

  return {
    hf_job_id: requestId,
    status: String(submitBody.status ?? 'queued'),
    status_url:
      typeof submitBody.status_url === 'string' ? submitBody.status_url : undefined,
  };
}

/**
 * Submit a generation to Higgsfield and poll until terminal.
 * Default model is text→image Soul v2 standard (no input media required).
 */
export async function liveHiggsfieldJob(
  input: HiggsfieldLiveJobInput,
  deps: HiggsfieldLiveClientDeps = {},
): Promise<HiggsfieldLiveJobResult> {
  const submitted = await submitHiggsfieldJob(input, deps);
  const requestId = submitted.hf_job_id;

  const creds = deps.credentials ?? resolveHiggsfieldCredentials();
  if (!creds) {
    throw new DomainError(
      'HIGGSFIELD_API_KEY_MISSING',
      503,
      'Modo live requiere HIGGSFIELD_API_KEY_ID+SECRET (o HIGGSFIELD_API_KEY=id:secret).',
    );
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const sleepFn = deps.sleepFn ?? sleep;
  const nowFn = deps.nowFn ?? Date.now;
  const baseUrl = (deps.baseUrl ?? config.higgsfieldApiBase).replace(/\/$/, '');
  const timeoutMs = deps.timeoutMs ?? config.higgsfieldPollTimeoutMs;
  const deadline = nowFn() + timeoutMs;

  const statusUrl =
    submitted.status_url ?? `${baseUrl}/requests/${requestId}/status`;

  let delay = 2000;
  while (true) {
    if (nowFn() > deadline) {
      throw new DomainError(
        'HIGGSFIELD_POLL_TIMEOUT',
        504,
        `Higgsfield job ${requestId} superó el timeout de poll (${timeoutMs}ms).`,
      );
    }

    const statusRes = await fetchFn(statusUrl, {
      method: 'GET',
      headers: { Authorization: authHeader(creds) },
    });
    const statusBody = await readJson(statusRes);

    if (statusRes.status === 401 || statusRes.status === 404) {
      throw new DomainError(
        'HIGGSFIELD_STATUS_FAILED',
        statusRes.status,
        typeof statusBody.detail === 'string'
          ? statusBody.detail
          : `Higgsfield status HTTP ${statusRes.status}`,
      );
    }

    if (!statusRes.ok && statusRes.status >= 500) {
      await sleepFn(delay);
      delay = Math.min(delay * 1.5, 10_000);
      continue;
    }

    if (!statusRes.ok) {
      throw new DomainError(
        'HIGGSFIELD_STATUS_FAILED',
        statusRes.status >= 400 && statusRes.status < 600 ? statusRes.status : 502,
        typeof statusBody.detail === 'string'
          ? statusBody.detail
          : `Higgsfield status HTTP ${statusRes.status}`,
      );
    }

    const status = String(statusBody.status ?? '');
    if (!TERMINAL.has(status)) {
      await sleepFn(delay);
      delay = Math.min(delay * 1.5, 10_000);
      continue;
    }

    if (status !== 'completed') {
      const err =
        typeof statusBody.error === 'string' && statusBody.error
          ? statusBody.error
          : status;
      throw new DomainError(
        'HIGGSFIELD_JOB_FAILED',
        502,
        `Higgsfield job ${requestId} terminó en ${err}`,
      );
    }

    const uri = pickOutputUri(statusBody);
    if (!uri) {
      throw new DomainError(
        'HIGGSFIELD_JOB_FAILED',
        502,
        `Higgsfield job ${requestId} completed sin URL de salida.`,
      );
    }

    const sha256 = createHash('sha256').update(`${requestId}:${uri}`).digest('hex');

    return {
      hf_job_id: requestId,
      uri,
      sha256,
      content_type: 'image',
      status: 'completed',
      raw_status: status,
    };
  }
}
