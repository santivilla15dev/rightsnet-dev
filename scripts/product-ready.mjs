#!/usr/bin/env node
/**
 * Founder local product readiness. No secret values printed.
 * See docs/PRODUCT_READY_LOCAL_V0_1.md
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allOk, runProductReadyChecks } from './lib/product-ready-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const findings = await runProductReadyChecks(root);

console.log('Product ready (local founder)\n');
for (const f of findings) {
  console.log(`${f.ok ? 'PASS' : 'FAIL'}  ${f.id} — ${f.detail}`);
}

if (!allOk(findings)) {
  console.error('\nProduct ready FAIL — revisa .env (docs/runbooks/auth-supabase.md).');
  console.error('No activa LIVE_COMMERCE ni APP_ENV=production.');
  process.exit(1);
}

console.log('\nProduct ready PASS (local). Staging cloud / live commerce siguen OPEN.');
