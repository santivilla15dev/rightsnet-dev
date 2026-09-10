import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('Staging API Docker scaffold v0.1', () => {
  const root = path.resolve(import.meta.dirname, '..');

  it('Dockerfile y fly examples EU existen', () => {
    const df = readFileSync(path.join(root, 'deploy/Dockerfile'), 'utf8');
    expect(df).toMatch(/PROCESS=api/);
    expect(df).toMatch(/pnpm worker/);
    expect(df).not.toMatch(/COPY apps\/web/);
    expect(existsSync(path.join(root, 'deploy/fly.api.toml.example'))).toBe(true);
    expect(readFileSync(path.join(root, 'deploy/fly.api.toml.example'), 'utf8')).toMatch(
      /primary_region\s*=\s*"fra"/,
    );
    expect(readFileSync(path.join(root, 'deploy/fly.worker.toml.example'), 'utf8')).toMatch(
      /PROCESS\s*=\s*"worker"/,
    );
    expect(
      readFileSync(path.join(root, 'deploy/docker-compose.staging.example.yml'), 'utf8'),
    ).toMatch(/PROCESS:\s*worker/);
  });
});
