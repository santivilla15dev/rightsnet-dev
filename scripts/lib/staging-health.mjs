/**
 * Staging health smoke helpers. See docs/STAGING_HEALTH_SMOKE_V0_1.md
 */

/**
 * @typedef {{ status: string, environment?: string, commerce?: string }} HealthBody
 * @typedef {{ ok: boolean, id: string, detail: string }} Check
 */

/**
 * @param {number} statusCode
 * @param {unknown} body
 * @param {{ allowLiveCommerce?: boolean }} [opts]
 * @returns {Check[]}
 */
export function evaluateHealthPayload(statusCode, body, opts = {}) {
  /** @type {Check[]} */
  const checks = [];
  checks.push({
    id: 'http.ok',
    ok: statusCode >= 200 && statusCode < 300,
    detail: `HTTP ${statusCode}`,
  });

  const obj = body && typeof body === 'object' ? /** @type {HealthBody} */ (body) : null;
  checks.push({
    id: 'body.status_ok',
    ok: Boolean(obj && obj.status === 'ok'),
    detail: obj ? `status=${String(obj.status)}` : 'body no es objeto JSON',
  });

  const env = obj?.environment;
  checks.push({
    id: 'env.not_production',
    ok: env !== 'production',
    detail: env ? `environment=${env}` : 'environment ausente (aceptable en proxy parcial)',
  });

  const commerce = obj?.commerce;
  const live = commerce === 'live_enabled';
  checks.push({
    id: 'commerce.sandbox_default',
    ok: !live || Boolean(opts.allowLiveCommerce),
    detail: live
      ? opts.allowLiveCommerce
        ? 'commerce=live_enabled (permitido por flag)'
        : 'commerce=live_enabled — usa STAGING_ALLOW_LIVE_COMMERCE=1 solo a propósito'
      : `commerce=${commerce ?? 'n/a'}`,
  });

  return checks;
}

/**
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
export async function fetchJson(url, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { statusCode: res.status, body, url };
}

/**
 * @param {Check[]} checks
 */
export function allChecksOk(checks) {
  return checks.every((c) => c.ok);
}
