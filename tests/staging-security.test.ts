import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  allOk,
  runStagingSecurityChecks,
  scanTrackedForLiveStripeKeys,
} from '../scripts/lib/staging-security-checks.mjs';

describe('Staging security hygiene v0.1', () => {
  it('repo actual pasa higiene', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const findings = runStagingSecurityChecks(root);
    expect(allOk(findings), findings.filter((f) => !f.ok).map((f) => f.id).join(',')).toBe(true);
  });

  it('detecta sk_live en archivo rastreable', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rn-stg-'));
    try {
      const fakeLive = ['sk', 'live', 'abc123XYZ'].join('_');
      writeFileSync(path.join(dir, 'leak.txt'), `key=${fakeLive}\n`);
      expect(scanTrackedForLiveStripeKeys(dir)).toEqual(['leak.txt']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falla si CI no fija sandbox', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rn-stg-'));
    try {
      writeFileSync(path.join(dir, '.gitignore'), '.env\n.local/\n');
      writeFileSync(
        path.join(dir, '.env.example'),
        'APP_ENV=sandbox\nLIVE_COMMERCE_ENABLED=false\nIDENTITY_LIVE_ENABLED=false\nMFA_ENABLED=false\n',
      );
      mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
      writeFileSync(path.join(dir, '.github/workflows/ci.yml'), 'name: bad\nenv:\n  APP_ENV: production\n');
      const findings = runStagingSecurityChecks(dir);
      expect(findings.find((f) => f.id === 'ci.app_env_sandbox')?.ok).toBe(false);
      expect(findings.find((f) => f.id === 'ci.no_production')?.ok).toBe(false);
      expect(allOk(findings)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
