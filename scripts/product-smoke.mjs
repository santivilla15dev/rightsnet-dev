#!/usr/bin/env node
/**
 * Short founder product smoke: ready + health + config asserts.
 * Soft-WARN if worker process not detected. See docs/PRODUCT_SMOKE_MANUAL_V0_1.md
 * Next steps: docs/FOUNDER_PREP_NEXT_V0_1.md
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(script) {
  const r = spawnSync('pnpm', [script], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function workerLooksRunning() {
  const hb = path.resolve(root, process.env.WORKER_HEARTBEAT_PATH ?? '.local/worker.heartbeat');
  if (existsSync(hb)) {
    try {
      const ageMs = Date.now() - statSync(hb).mtimeMs;
      if (ageMs < 15_000) return true;
    } catch {
      /* fall through */
    }
  }
  const r = spawnSync(
    'pgrep',
    ['-f', 'apps/worker/src/main|pnpm worker'],
    { encoding: 'utf8' },
  );
  return r.status === 0 && Boolean((r.stdout || '').trim());
}

console.log('1/3 product:ready');
run('product:ready');
console.log('\n2/3 staging:health');
run('staging:health');

const apiBase = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
console.log('\n3/3 GET', `${apiBase}/v1/config`);
const res = await fetch(`${apiBase}/v1/config`, { signal: AbortSignal.timeout(5000) });
if (!res.ok) {
  console.error('FAIL config HTTP', res.status);
  process.exit(1);
}
const cfg = await res.json();
const checks = [
  ['auth', cfg.auth === 'supabase', `auth=${cfg.auth}`],
  ['demo_ui', cfg.demo_ui === false, `demo_ui=${String(cfg.demo_ui)}`],
  ['live_commerce', cfg.live_commerce !== true, `live_commerce=${String(cfg.live_commerce)}`],
];
let failed = false;
for (const [id, ok, detail] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
  if (!ok) failed = true;
}

const workerOk = workerLooksRunning();
if (workerOk) console.log('PASS  worker.process — worker detectado');
else
  console.log(
    'WARN  worker.process — no se detecta worker; para pagos/licencias ejecuta: pnpm worker',
  );

if (failed) {
  console.error('\nProduct smoke FAIL');
  process.exit(1);
}
console.log('\nProduct smoke PASS (automático). Checklist visual: docs/runbooks/product-smoke-manual.md');
console.log('Siguientes pasos founder: docs/FOUNDER_PREP_NEXT_V0_1.md');
