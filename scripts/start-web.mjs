import { cp, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps/web');
const output = path.join(web, '.next/standalone/apps/web');
await mkdir(path.join(output, '.next'), { recursive: true });
await cp(path.join(web, '.next/static'), path.join(output, '.next/static'), { recursive: true });
await cp(path.join(web, 'public'), path.join(output, 'public'), { recursive: true });
const child = spawn(process.execPath, [path.join(output, 'server.js')], {
  cwd: root,
  env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: process.env.PORT ?? '3000' },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
