/**
 * Local founder product-readiness checks. Does not print secret values.
 * See docs/PRODUCT_READY_LOCAL_V0_1.md
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ id: string, ok: boolean, detail: string }} Finding */

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseDotEnv(text) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return map;
}

/**
 * @param {Record<string, string>} env
 * @param {{ config?: { auth?: string, demo_ui?: boolean, live_commerce?: boolean, environment?: string } | null }} [opts]
 * @returns {Finding[]}
 */
export function evaluateProductReady(env, opts = {}) {
  /** @type {Finding[]} */
  const findings = [];
  const get = (k) => (env[k] ?? '').trim();

  findings.push({
    id: 'app_env.not_production',
    ok: get('APP_ENV') !== 'production',
    detail: `APP_ENV=${get('APP_ENV') || '(vacío→sandbox)'}`,
  });
  findings.push({
    id: 'live_commerce.off',
    ok: get('LIVE_COMMERCE_ENABLED') !== 'true',
    detail: 'LIVE_COMMERCE_ENABLED no es true',
  });
  findings.push({
    id: 'demo_ui.off',
    ok: get('DEMO_UI_ENABLED') !== 'true',
    detail: 'DEMO_UI_ENABLED no es true (producto sin /demo)',
  });
  findings.push({
    id: 'identity_live.off',
    ok: get('IDENTITY_LIVE_ENABLED') !== 'true',
    detail: 'IDENTITY_LIVE_ENABLED no es true (opt-in aparte)',
  });
  findings.push({
    id: 'auth.supabase',
    ok: get('AUTH_PROVIDER') === 'supabase',
    detail: 'AUTH_PROVIDER=supabase (producto)',
  });
  findings.push({
    id: 'supabase.url',
    ok: get('SUPABASE_URL').startsWith('https://'),
    detail: 'SUPABASE_URL https presente',
  });
  findings.push({
    id: 'supabase.anon',
    ok: get('SUPABASE_ANON_KEY').length > 20,
    detail: 'SUPABASE_ANON_KEY presente',
  });
  findings.push({
    id: 'supabase.public_url',
    ok: get('NEXT_PUBLIC_SUPABASE_URL').startsWith('https://'),
    detail: 'NEXT_PUBLIC_SUPABASE_URL https presente',
  });
  findings.push({
    id: 'supabase.public_anon',
    ok: get('NEXT_PUBLIC_SUPABASE_ANON_KEY').length > 20,
    detail: 'NEXT_PUBLIC_SUPABASE_ANON_KEY presente',
  });

  const cfg = opts.config;
  if (cfg) {
    findings.push({
      id: 'api.config.auth',
      ok: cfg.auth === 'supabase',
      detail: `API config.auth=${cfg.auth ?? 'n/a'}`,
    });
    findings.push({
      id: 'api.config.demo_ui',
      ok: cfg.demo_ui !== true,
      detail: `API config.demo_ui=${String(cfg.demo_ui)}`,
    });
    findings.push({
      id: 'api.config.live_commerce',
      ok: cfg.live_commerce !== true,
      detail: `API config.live_commerce=${String(cfg.live_commerce)}`,
    });
  }

  return findings;
}

/**
 * @param {string} root
 * @param {{ fetchConfig?: boolean, fetchImpl?: typeof fetch }} [opts]
 */
export async function runProductReadyChecks(root, opts = {}) {
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) {
    return [
      {
        id: 'env.exists',
        ok: false,
        detail: 'Falta .env — copia .env.example y configura Supabase',
      },
    ];
  }
  const env = parseDotEnv(readFileSync(envPath, 'utf8'));
  /** @type {{ auth?: string, demo_ui?: boolean, live_commerce?: boolean } | null} */
  let config = null;
  if (opts.fetchConfig !== false) {
    const apiBase = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
    try {
      const fetchImpl = opts.fetchImpl ?? fetch;
      const res = await fetchImpl(`${apiBase}/v1/config`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) config = /** @type {typeof config} */ (await res.json());
    } catch {
      /* API opcional: solo checks de .env */
    }
  }
  return evaluateProductReady(env, { config });
}

/** @param {Finding[]} findings */
export function allOk(findings) {
  return findings.every((f) => f.ok);
}
