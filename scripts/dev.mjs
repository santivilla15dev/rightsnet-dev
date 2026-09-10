import { spawn } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Carga .env del repo para que AUTH_PROVIDER / DATABASE_URL / Supabase no dependan de `source .env`.
const envPath = path.resolve(process.cwd(), '.env');
if (existsSync(envPath)) loadEnv({ path: envPath, override: true });

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', env: process.env });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(cmd + ' failed'))));
  });
if (!process.env.DATABASE_URL) {
  await run('node', ['scripts/local-db.mjs']);
}
await run('pnpm', ['db:migrate']);
await run('pnpm', ['db:seed']);
const children = [
  spawn('pnpm', ['api'], { stdio: 'inherit' }),
  spawn('pnpm', ['worker'], { stdio: 'inherit' }),
  spawn('pnpm', ['--filter', '@rightsnet/web', 'dev'], { stdio: 'inherit' }),
];
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const child of children) child.kill('SIGTERM');
    process.exit(0);
  });
