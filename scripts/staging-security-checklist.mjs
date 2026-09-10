#!/usr/bin/env node
/**
 * Staging deploy security hygiene (local). Does not deploy cloud.
 * See docs/STAGING_DEPLOY_SECURITY_V0_1.md
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HUMAN_STAGING_CHECKLIST,
  allOk,
  runStagingSecurityChecks,
} from './lib/staging-security-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const findings = runStagingSecurityChecks(root);

console.log('Staging security hygiene (repo)\n');
for (const f of findings) {
  console.log(`${f.ok ? 'PASS' : 'FAIL'}  ${f.id} — ${f.detail}`);
}

console.log('\nHuman checklist (founder / ops — no acredita cloud):\n');
for (const line of HUMAN_STAGING_CHECKLIST) {
  console.log(`  [ ] ${line}`);
}

if (!allOk(findings)) {
  console.error('\nHygiene FAIL — corregir antes de staging sensible.');
  process.exit(1);
}

console.log('\nHygiene PASS. Cloud staging deploy sigue OPEN (ver runbook).');
