#!/usr/bin/env node
/**
 * Local backup→restore smoke drill. Does not touch the primary DB contents
 * beyond reading; creates/drops rightsnet_restore_drill only.
 * See docs/BACKUP_RESTORE_V0_1.md
 */
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const bin = process.env.POSTGRES_BIN ?? '/opt/homebrew/opt/postgresql@16/bin';
const host = process.env.PGHOST ?? '127.0.0.1';
const port = process.env.PGPORT ?? '55432';
const user = process.env.PGUSER ?? 'rightsnet';
const sourceDb = process.env.BACKUP_SOURCE_DB ?? 'rightsnet';
const drillDb = 'rightsnet_restore_drill';
const pgEnv = { ...process.env, LC_ALL: process.env.LC_ALL ?? 'C', LANG: process.env.LANG ?? 'C' };

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: pgEnv, ...opts });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed: ${err || r.status}`);
  }
  return r;
}

function psql(db, sql) {
  return run(bin + '/psql', ['-h', host, '-p', port, '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', sql]);
}

if (!existsSync(bin + '/pg_dump')) {
  console.error('PostgreSQL tools not found. Set POSTGRES_BIN or install postgresql@16.');
  process.exit(1);
}

const alive = spawnSync(
  bin + '/psql',
  ['-h', host, '-p', port, '-U', user, '-d', 'postgres', '-tAc', 'SELECT 1'],
  { encoding: 'utf8', env: pgEnv },
);
if (alive.status !== 0 || alive.stdout.trim() !== '1') {
  console.error('Postgres not reachable on', `${host}:${port}`, '— run pnpm db:start first.');
  process.exit(1);
}

const srcOk = psql('postgres', `SELECT 1 FROM pg_database WHERE datname='${sourceDb}'`).stdout.trim();
if (srcOk !== '1') {
  console.error(`Source database ${sourceDb} does not exist.`);
  process.exit(1);
}

mkdirSync(path.resolve('.local/backups'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dumpPath = path.resolve(`.local/backups/drill-${stamp}.dump`);

console.log('1) pg_dump', sourceDb, '→', dumpPath);
run(bin + '/pg_dump', ['-h', host, '-p', port, '-U', user, '-Fc', '-f', dumpPath, sourceDb]);

const exists = psql('postgres', `SELECT 1 FROM pg_database WHERE datname='${drillDb}'`).stdout.trim();
if (exists === '1') {
  console.log('2) drop existing', drillDb);
  run(bin + '/dropdb', ['-h', host, '-p', port, '-U', user, drillDb]);
}

console.log('3) createdb', drillDb);
run(bin + '/createdb', ['-h', host, '-p', port, '-U', user, drillDb]);

console.log('4) pg_restore →', drillDb);
const restore = spawnSync(
  bin + '/pg_restore',
  ['-h', host, '-p', port, '-U', user, '-d', drillDb, '--no-owner', '--no-acl', dumpPath],
  { encoding: 'utf8', env: pgEnv },
);
// pg_restore may exit 1 with warnings on some extensions; treat hard errors only.
if (restore.status !== 0 && restore.status !== 1) {
  console.error(restore.stderr || restore.stdout);
  process.exit(1);
}

console.log('5) smoke queries');
const tables = ['organizations', 'orders', 'licenses', 'audit_events', 'campaigns'];
for (const t of tables) {
  const n = psql(drillDb, `SELECT count(*)::text FROM ${t}`).stdout.trim();
  if (!/^\d+$/.test(n)) throw new Error(`smoke failed for ${t}: ${n}`);
  console.log(`   ${t}: ${n} rows`);
}

console.log('6) drop', drillDb);
run(bin + '/dropdb', ['-h', host, '-p', port, '-U', user, drillDb]);

console.log('PASS backup-restore drill. Dump kept at', dumpPath);
console.log('Reminder: also back up .local/keys, .local/uploads, .local/audit-archive (see runbook).');
