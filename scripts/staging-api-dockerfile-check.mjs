#!/usr/bin/env node
/**
 * Validate staging API Docker scaffold files exist (no docker build required).
 * See docs/STAGING_API_DOCKER_V0_1.md
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  ['deploy/Dockerfile', /PROCESS=api/, 'Dockerfile default PROCESS=api'],
  ['deploy/Dockerfile', /pnpm worker/, 'Dockerfile can run worker'],
  ['deploy/fly.api.toml.example', /primary_region\s*=\s*"fra"/, 'fly API fra'],
  ['deploy/fly.worker.toml.example', /PROCESS\s*=\s*"worker"/, 'fly worker PROCESS'],
  ['.dockerignore', /node_modules/, '.dockerignore node_modules'],
];

let failed = false;
console.log('Staging API Docker scaffold\n');
for (const [rel, re, label] of checks) {
  const full = path.join(root, rel);
  const exists = existsSync(full);
  const body = exists ? readFileSync(full, 'utf8') : '';
  const ok = exists && re.test(body);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} — ${rel}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nScaffold FAIL');
  process.exit(1);
}
console.log('\nScaffold PASS (files only; docker/fly deploy OPEN).');
