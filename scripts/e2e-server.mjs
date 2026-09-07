import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AUTH_PROVIDER = 'sandbox';
process.env.PAYMENTS_PROVIDER = 'sandbox';
process.env.APP_ENV = process.env.APP_ENV ?? 'sandbox';
process.env.LIVE_COMMERCE_ENABLED = 'false';
process.env.API_PORT = process.env.E2E_API_PORT ?? '4010';
process.env.API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4010';
process.env.WEB_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3010';
process.env.WEB_ORIGINS =
  process.env.WEB_ORIGINS ??
  'http://127.0.0.1:3010,http://localhost:3010,http://127.0.0.1:3000,http://localhost:3000';
process.env.PORT = process.env.E2E_WEB_PORT ?? '3010';
process.env.HOSTNAME = '127.0.0.1';

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', env: process.env, cwd: root });
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(cmd + ' ' + args.join(' ') + ' failed')),
    );
  });

if (!process.env.DATABASE_URL) {
  await run('node', ['scripts/local-db.mjs']);
}
await run('pnpm', ['db:migrate']);
await run('pnpm', ['db:seed']);
await run('pnpm', ['--filter', '@rightsnet/web', 'build']);

const children = [
  spawn('pnpm', ['api'], { stdio: 'inherit', env: process.env, cwd: root }),
  spawn('pnpm', ['worker'], { stdio: 'inherit', env: process.env, cwd: root }),
  spawn('pnpm', ['--filter', '@rightsnet/web', 'start'], {
    stdio: 'inherit',
    env: process.env,
    cwd: root,
  }),
];

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill('SIGTERM');
    process.exit(0);
  });
}

async function ready(url, attempts = 120) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error('E2E server not ready: ' + url);
}

await ready(process.env.API_URL + '/v1/health');
await ready(process.env.WEB_URL + '/');
await ready(process.env.WEB_URL + '/login');

await new Promise(() => {});
