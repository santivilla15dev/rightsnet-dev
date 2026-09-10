import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  allOk,
  evaluateProductReady,
  parseDotEnv,
  runProductReadyChecks,
} from '../scripts/lib/product-ready-checks.mjs';

describe('Product ready local v0.1', () => {
  it('parseDotEnv ignora comentarios', () => {
    const m = parseDotEnv('# x\nAUTH_PROVIDER=supabase\nLIVE_COMMERCE_ENABLED=false\n');
    expect(m.AUTH_PROVIDER).toBe('supabase');
    expect(m.LIVE_COMMERCE_ENABLED).toBe('false');
  });

  it('acepta perfil founder típico', () => {
    const findings = evaluateProductReady({
      APP_ENV: 'sandbox',
      LIVE_COMMERCE_ENABLED: 'false',
      DEMO_UI_ENABLED: 'false',
      IDENTITY_LIVE_ENABLED: 'false',
      AUTH_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaa',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bbbbbbbb',
    });
    expect(allOk(findings)).toBe(true);
  });

  it('falla con sandbox auth o demo_ui on', () => {
    const bad = evaluateProductReady({
      AUTH_PROVIDER: 'sandbox',
      DEMO_UI_ENABLED: 'true',
      LIVE_COMMERCE_ENABLED: 'false',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaa',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bbbbbbbb',
    });
    expect(bad.find((f) => f.id === 'auth.supabase')?.ok).toBe(false);
    expect(bad.find((f) => f.id === 'demo_ui.off')?.ok).toBe(false);
  });

  it('runProductReadyChecks sin .env falla', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rn-pr-'));
    try {
      const findings = await runProductReadyChecks(dir, { fetchConfig: false });
      expect(findings[0]?.id).toBe('env.exists');
      expect(allOk(findings)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runProductReadyChecks con .env producto PASS', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rn-pr-'));
    try {
      writeFileSync(
        path.join(dir, '.env'),
        [
          'APP_ENV=sandbox',
          'LIVE_COMMERCE_ENABLED=false',
          'DEMO_UI_ENABLED=false',
          'IDENTITY_LIVE_ENABLED=false',
          'AUTH_PROVIDER=supabase',
          'SUPABASE_URL=https://example.supabase.co',
          'SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaa',
          'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co',
          'NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bbbbbbbb',
        ].join('\n'),
      );
      const findings = await runProductReadyChecks(dir, { fetchConfig: false });
      expect(allOk(findings)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exige demo_ui explícito false cuando hay config API', () => {
    const env = {
      APP_ENV: 'sandbox',
      LIVE_COMMERCE_ENABLED: 'false',
      DEMO_UI_ENABLED: 'false',
      IDENTITY_LIVE_ENABLED: 'false',
      AUTH_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaa',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bbbbbbbb',
    };
    const stale = evaluateProductReady(env, {
      config: { auth: 'supabase', live_commerce: false },
    });
    expect(stale.find((f) => f.id === 'api.config.demo_ui')?.ok).toBe(false);

    const fresh = evaluateProductReady(env, {
      config: { auth: 'supabase', demo_ui: false, live_commerce: false },
    });
    expect(allOk(fresh)).toBe(true);
  });
});
