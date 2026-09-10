/**
 * Repo hygiene checks for staging deploy security v0.1.
 * Does not provision cloud; fails closed on dangerous tracked defaults.
 * See docs/STAGING_DEPLOY_SECURITY_V0_1.md
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.local',
  'work',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.next',
  'baseline',
]);

/** @typedef {{ id: string, ok: boolean, detail: string }} Finding */

/**
 * @param {string} root
 * @returns {Finding[]}
 */
export function runStagingSecurityChecks(root) {
  /** @type {Finding[]} */
  const findings = [];

  const gitignorePath = path.join(root, '.gitignore');
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  findings.push({
    id: 'gitignore.env',
    ok: /(^|\n)\.env(\n|$)/.test(gitignore) && /(^|\n)\.local\/?(\n|$)/.test(gitignore),
    detail: gitignore
      ? '.gitignore debe ignorar .env y .local/'
      : 'falta .gitignore',
  });

  const envExamplePath = path.join(root, '.env.example');
  const envExample = existsSync(envExamplePath) ? readFileSync(envExamplePath, 'utf8') : '';
  findings.push({
    id: 'env.example.exists',
    ok: envExample.length > 0,
    detail: '.env.example presente con plantilla de secretos vacíos',
  });
  findings.push({
    id: 'env.example.sandbox',
    ok: /(?:^|\n)APP_ENV=sandbox(?:\n|$)/.test(envExample),
    detail: 'APP_ENV=sandbox en .env.example',
  });
  findings.push({
    id: 'env.example.no_production',
    ok: !/(?:^|\n)APP_ENV=production(?:\n|$)/.test(envExample),
    detail: 'APP_ENV=production ausente en .env.example',
  });
  findings.push({
    id: 'env.example.live_commerce_off',
    ok: /(?:^|\n)LIVE_COMMERCE_ENABLED=false(?:\n|$)/.test(envExample),
    detail: 'LIVE_COMMERCE_ENABLED=false en .env.example',
  });
  findings.push({
    id: 'env.example.identity_live_off',
    ok: /(?:^|\n)IDENTITY_LIVE_ENABLED=false(?:\n|$)/.test(envExample),
    detail: 'IDENTITY_LIVE_ENABLED=false en .env.example',
  });
  findings.push({
    id: 'env.example.mfa_off',
    ok: /(?:^|\n)MFA_ENABLED=false(?:\n|$)/.test(envExample),
    detail: 'MFA_ENABLED=false en .env.example (opt-in)',
  });
  findings.push({
    id: 'env.example.demo_ui_off',
    ok: /(?:^|\n)DEMO_UI_ENABLED=false(?:\n|$)/.test(envExample),
    detail: 'DEMO_UI_ENABLED=false en .env.example (producto)',
  });

  const ciPath = path.join(root, '.github/workflows/ci.yml');
  const ci = existsSync(ciPath) ? readFileSync(ciPath, 'utf8') : '';
  findings.push({
    id: 'ci.exists',
    ok: ci.length > 0,
    detail: 'CI remoto en .github/workflows/ci.yml',
  });
  findings.push({
    id: 'ci.app_env_sandbox',
    ok: /APP_ENV:\s*sandbox/.test(ci),
    detail: 'CI fija APP_ENV: sandbox',
  });
  findings.push({
    id: 'ci.live_commerce_off',
    ok: /LIVE_COMMERCE_ENABLED:\s*['"]?false['"]?/.test(ci),
    detail: "CI fija LIVE_COMMERCE_ENABLED: 'false'",
  });
  findings.push({
    id: 'ci.no_production',
    ok: !/APP_ENV:\s*production/.test(ci),
    detail: 'CI no fija APP_ENV: production',
  });
  findings.push({
    id: 'ci.staging_security_step',
    ok: /pnpm staging:security/.test(ci),
    detail: 'CI ejecuta pnpm staging:security',
  });
  findings.push({
    id: 'ci.demo_ui_on',
    ok: /DEMO_UI_ENABLED:\s*['"]?true['"]?/.test(ci),
    detail: "CI fija DEMO_UI_ENABLED: 'true' (E2E)",
  });

  const liveKeys = scanTrackedForLiveStripeKeys(root);
  findings.push({
    id: 'no.tracked.sk_live',
    ok: liveKeys.length === 0,
    detail:
      liveKeys.length === 0
        ? 'sin sk_live_/rk_live_ en archivos rastreados del repo'
        : `claves live en: ${liveKeys.slice(0, 5).join(', ')}`,
  });

  return findings;
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function scanTrackedForLiveStripeKeys(root) {
  /** @type {string[]} */
  const hits = [];
  const liveRe = /\b(?:sk|rk)_live_[A-Za-z0-9]+/;

  /**
   * @param {string} dir
   * @param {string} rel
   */
  function walk(dir, rel) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      const nextRel = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, nextRel);
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size > 2_000_000) continue;
      if (!/\.(md|ts|tsx|js|mjs|cjs|yml|yaml|json|env|example|txt|sh)$/i.test(name) && name !== 'Dockerfile')
        continue;
      let text;
      try {
        text = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (liveRe.test(text)) hits.push(nextRel);
    }
  }

  walk(root, '');
  return hits;
}

/**
 * @param {Finding[]} findings
 */
export function allOk(findings) {
  return findings.every((f) => f.ok);
}

/** Checklist humana (founder) — no automatizable sin cloud. */
export const HUMAN_STAGING_CHECKLIST = [
  'Región EU (p.ej. eu-central-1 / EU Vercel) alineada con piloto AT–DE propuesto',
  'Secretos solo en el secret store del host (nunca en Git ni logs)',
  'WEB_URL y API_URL con HTTPS (TLS terminado en proxy/CDN)',
  'DB, Stripe test, Supabase y buckets separados de producción futura',
  'APP_ENV=sandbox (o staging distinto de production; production sigue bloqueado en código)',
  'LIVE_COMMERCE_ENABLED=false; IDENTITY_LIVE_ENABLED=false salvo ensayo Identity live aislado',
  'CI remoto verde en el commit desplegado (.github/workflows/ci.yml)',
  'Health: `pnpm staging:health` contra WEB_URL/API_URL (docs/STAGING_HEALTH_SMOKE_V0_1.md)',
  'Firma: claves fuera del contenedor efímero; rotación local o KMS cuando exista',
  'Backup: plan dump + restore drill; PITR cloud sigue OPEN',
];
