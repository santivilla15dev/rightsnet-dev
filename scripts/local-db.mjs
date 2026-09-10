import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const data = path.resolve('.local/postgres');
const bin = process.env.POSTGRES_BIN ?? '/opt/homebrew/opt/postgresql@16/bin';
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(cmd + ' failed');
};
if (!existsSync(bin + '/initdb')) {
  console.error('PostgreSQL no encontrado. Usa docker compose up -d o configura POSTGRES_BIN.');
  process.exit(1);
}
mkdirSync('.local', { recursive: true });
if (!existsSync(data + '/PG_VERSION'))
  run(bin + '/initdb', [
    '-D',
    data,
    '-U',
    'rightsnet',
    '--auth-local=trust',
    '--auth-host=trust',
    '--encoding=UTF8',
    '--locale=C',
  ]);
/** True if something already answers on the local sandbox port (even if postmaster.pid is stale). */
const alreadyUp = () => {
  const r = spawnSync(
    bin + '/psql',
    [
      '-h',
      '127.0.0.1',
      '-p',
      '55432',
      '-U',
      'rightsnet',
      '-d',
      'postgres',
      '-tAc',
      'SELECT 1',
    ],
    { encoding: 'utf8' },
  );
  return r.status === 0 && r.stdout.trim() === '1';
};
const status = spawnSync(bin + '/pg_ctl', ['-D', data, 'status'], { stdio: 'ignore' });
if (status.status !== 0 && !alreadyUp())
  run(bin + '/pg_ctl', [
    '-D',
    data,
    '-l',
    path.resolve('.local/postgres.log'),
    '-o',
    '-p 55432 -h 127.0.0.1',
    'start',
  ]);
const db = spawnSync(
  bin + '/psql',
  [
    '-h',
    '127.0.0.1',
    '-p',
    '55432',
    '-U',
    'rightsnet',
    '-d',
    'postgres',
    '-tAc',
    "SELECT 1 FROM pg_database WHERE datname='rightsnet'",
  ],
  { encoding: 'utf8' },
);
if (!db.stdout.trim())
  run(bin + '/createdb', ['-h', '127.0.0.1', '-p', '55432', '-U', 'rightsnet', 'rightsnet']);

// App DML role (DDL stays with rightsnet). Idempotent for re-runs.
run(bin + '/psql', [
  '-h',
  '127.0.0.1',
  '-p',
  '55432',
  '-U',
  'rightsnet',
  '-d',
  'rightsnet',
  '-v',
  'ON_ERROR_STOP=1',
  '-c',
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rightsnet_app') THEN
       CREATE ROLE rightsnet_app LOGIN;
     END IF;
   END $$;
   GRANT CONNECT ON DATABASE rightsnet TO rightsnet_app;
   GRANT USAGE ON SCHEMA public TO rightsnet_app;
   REVOKE CREATE ON SCHEMA public FROM rightsnet_app;`,
]);
