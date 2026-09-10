#!/usr/bin/env node
/**
 * Preflight before founder human trial (local product).
 * See docs/runbooks/founder-human-trial.md
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDotEnv } from './lib/product-ready-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(script) {
  const r = spawnSync('pnpm', [script], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function workerOk() {
  const hb = path.resolve(root, '.local/worker.heartbeat');
  if (!existsSync(hb)) return false;
  try {
    return Date.now() - statSync(hb).mtimeMs < 15_000;
  } catch {
    return false;
  }
}

console.log('0) product:smoke');
run('product:smoke');

const env = existsSync(path.join(root, '.env'))
  ? parseDotEnv(readFileSync(path.join(root, '.env'), 'utf8'))
  : {};

/** @type {{ id: string, ok: boolean, detail: string }[]} */
const findings = [];

const sk = (env.STRIPE_SECRET_KEY || '').trim();
findings.push({
  id: 'stripe.test_key',
  ok: /^(sk|rk)_test_/.test(sk),
  detail: sk ? 'STRIPE_SECRET_KEY es test' : 'falta STRIPE_SECRET_KEY test',
});
findings.push({
  id: 'stripe.webhook_secret',
  ok: Boolean((env.STRIPE_WEBHOOK_SECRET || '').trim()),
  detail: 'STRIPE_WEBHOOK_SECRET presente (stripe listen o Dashboard)',
});
findings.push({
  id: 'payments.stripe',
  ok: (env.PAYMENTS_PROVIDER || '') === 'stripe',
  detail: 'PAYMENTS_PROVIDER=stripe',
});
findings.push({
  id: 'worker.heartbeat',
  ok: workerOk(),
  detail: workerOk() ? 'worker heartbeat fresco' : 'arranca pnpm worker',
});

const api = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const web = (env.WEB_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

try {
  const search = await fetch(`${api}/v1/search`, { signal: AbortSignal.timeout(5000) });
  const body = search.ok ? await search.json() : null;
  const n = Array.isArray(body?.items) ? body.items.length : 0;
  findings.push({
    id: 'marketplace.items',
    ok: n >= 1,
    detail: `search items=${n}`,
  });
} catch (e) {
  findings.push({
    id: 'marketplace.items',
    ok: false,
    detail: e instanceof Error ? e.message : 'search failed',
  });
}

try {
  const page = await fetch(`${web}/creators/ines-soler`, { signal: AbortSignal.timeout(8000) });
  findings.push({
    id: 'creator.page',
    ok: page.ok,
    detail: `GET /creators/ines-soler → ${page.status}`,
  });
} catch (e) {
  findings.push({
    id: 'creator.page',
    ok: false,
    detail: e instanceof Error ? e.message : 'creator page failed',
  });
}

const listen = spawnSync('pgrep', ['-fl', 'stripe'], { encoding: 'utf8' });
const listenOut = `${listen.stdout || ''}\n${listen.stderr || ''}`;
const listenOk = listen.status === 0 && /stripe\s+listen/.test(listenOut);
findings.push({
  id: 'stripe.listen',
  ok: listenOk,
  detail: listenOk
    ? 'stripe listen detectado'
    : 'WARN: no se detecta `stripe listen` — sin webhooks el pago test puede quedarse colgado',
});

console.log('\nFounder trial preflight\n');
let hardFail = false;
for (const f of findings) {
  const soft = f.id === 'stripe.listen';
  const label = f.ok ? 'PASS' : soft ? 'WARN' : 'FAIL';
  console.log(`${label}  ${f.id} — ${f.detail}`);
  if (!f.ok && !soft) hardFail = true;
}

if (hardFail) {
  console.error('\nPreflight FAIL');
  process.exit(1);
}

console.log('\nPreflight PASS (listo para ensayo humano).');
console.log('Guía: docs/runbooks/founder-human-trial.md');
if (!listenOk) {
  console.log(
    'Tip webhook:\n  stripe listen --forward-to localhost:4000/v1/webhooks/stripe',
  );
}
