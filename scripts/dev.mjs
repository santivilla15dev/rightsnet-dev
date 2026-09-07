import { spawn } from 'node:child_process';
const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
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
