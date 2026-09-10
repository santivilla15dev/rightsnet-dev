#!/usr/bin/env node
/**
 * Smoke GET /v1/health (API) and optionally /api/health (web proxy).
 * Does not deploy. See docs/STAGING_HEALTH_SMOKE_V0_1.md
 */
import {
  allChecksOk,
  evaluateHealthPayload,
  fetchJson,
} from './lib/staging-health.mjs';

const apiBase = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
const webBase = (process.env.WEB_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const skipWeb = process.env.STAGING_SKIP_WEB === '1' || process.env.STAGING_SKIP_WEB === 'true';
const allowLive =
  process.env.STAGING_ALLOW_LIVE_COMMERCE === '1' ||
  process.env.STAGING_ALLOW_LIVE_COMMERCE === 'true';

/** @type {{ label: string, url: string }[]} */
const targets = [{ label: 'api', url: `${apiBase}/v1/health` }];
if (!skipWeb) targets.push({ label: 'web', url: `${webBase}/api/health` });

let failed = false;
console.log('Staging health smoke\n');

for (const t of targets) {
  console.log(`→ ${t.label} ${t.url}`);
  try {
    const { statusCode, body } = await fetchJson(t.url);
    const checks = evaluateHealthPayload(statusCode, body, { allowLiveCommerce: allowLive });
    for (const c of checks) {
      console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.id} — ${c.detail}`);
    }
    if (!allChecksOk(checks)) failed = true;
  } catch (err) {
    failed = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL  fetch — ${msg}`);
  }
  console.log('');
}

if (failed) {
  console.error('Health smoke FAIL');
  process.exit(1);
}
console.log('Health smoke PASS');
