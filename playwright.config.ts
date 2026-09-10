import { defineConfig } from '@playwright/test';

/** Campaign H3–H6 e2e write fixtures via pg and require a `*_test` database. */
function resolveE2eDatabaseUrl(): string {
  const preferred = process.env.TEST_DATABASE_URL?.trim();
  if (preferred) {
    try {
      if (new URL(preferred).pathname.endsWith('_test')) return preferred;
    } catch {
      /* fall through */
    }
  }
  const base =
    process.env.DATABASE_URL?.trim() || 'postgresql://rightsnet@127.0.0.1:55432/rightsnet';
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '') || 'rightsnet';
  if (!name.endsWith('_test')) url.pathname = '/' + name + '_test';
  return url.toString();
}

const e2eDatabaseUrl = resolveE2eDatabaseUrl();
process.env.DATABASE_URL = e2eDatabaseUrl;

const sandboxEnv = {
  ...process.env,
  DATABASE_URL: e2eDatabaseUrl,
  AUTH_PROVIDER: 'sandbox',
  PAYMENTS_PROVIDER: 'sandbox',
  IDENTITY_PROVIDER: 'sandbox',
  APP_ENV: process.env.APP_ENV ?? 'sandbox',
  LIVE_COMMERCE_ENABLED: 'false',
  DEMO_UI_ENABLED: 'true',
  API_PORT: '4010',
  API_URL: 'http://127.0.0.1:4010',
  WEB_URL: 'http://127.0.0.1:3010',
  E2E_WEB_PORT: '3010',
  WEB_ORIGINS:
    'http://127.0.0.1:3010,http://localhost:3010,http://127.0.0.1:3000,http://localhost:3000',
};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: process.env.E2E_URL ?? 'http://127.0.0.1:3010',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://127.0.0.1:3010/login',
    reuseExistingServer: false,
    timeout: 180000,
    env: sandboxEnv,
  },
});
