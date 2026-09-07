import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const apiHeaders = {
  Origin: 'http://127.0.0.1:3010',
  'Content-Type': 'application/json',
};

export async function login(page: Page, role: 'marca' | 'creador' | 'administración') {
  await page.goto('/demo');
  const label =
    role === 'marca'
      ? 'Explorar como marca'
      : role === 'creador'
        ? 'Explorar como creador'
        : 'Abrir consola Ops';
  await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page).not.toHaveURL(/\/demo$/);
}

export async function assertSandboxAuth(page: Page) {
  const cfg = await page.request.get('/api/config');
  expect(cfg.ok()).toBeTruthy();
  const body = (await cfg.json()) as { auth?: string; payments?: string };
  expect(body.auth).toBe('sandbox');
  expect(body.payments).toBe('sandbox');
}

/**
 * Update current creator policy via API (approval mode), consent, publish — then open dashboard.
 */
export async function saveCreatorPolicy(
  page: Page,
  approval: 'automatic' | 'manual' = 'automatic',
) {
  const profileRes = await page.request.get('/api/creator');
  expect(profileRes.ok()).toBeTruthy();
  const profile = (await profileRes.json()) as {
    assets: Array<{
      id: string;
      policy: {
        schema_version?: string;
        approval?: string;
        prices?: { '30': number; '90': number };
        pricing?: { duration_prices_minor?: { '30'?: number; '90'?: number } };
        [k: string]: unknown;
      };
    }>;
  };
  const asset = profile.assets[0];
  expect(asset).toBeTruthy();
  const isRights = asset.policy.schema_version === 'rightsnet.rights-policy/0.1';
  const policy = isRights
    ? {
        ...asset.policy,
        approval_mode: approval === 'manual' ? 'MANUAL' : 'AUTOMATIC',
        pricing: {
          ...(asset.policy.pricing ?? {}),
          duration_prices_minor: {
            ...(asset.policy.pricing?.duration_prices_minor ?? {}),
            '30': (asset.policy.pricing?.duration_prices_minor?.['30'] ?? 85000) + 100,
            '90': asset.policy.pricing?.duration_prices_minor?.['90'] ?? 150000,
          },
        },
      }
    : {
        ...asset.policy,
        approval,
        prices: {
          '30': (asset.policy.prices?.['30'] ?? 65000) + 100,
          '90': asset.policy.prices?.['90'] ?? 130000,
        },
      };
  const saveRes = await page.request.post('/api/assets/' + asset.id + '/policies', {
    headers: { ...apiHeaders, 'Idempotency-Key': randomUUID() },
    data: policy,
  });
  expect(saveRes.ok(), await saveRes.text()).toBeTruthy();
  const saved = (await saveRes.json()) as { sha256: string };
  const consentRes = await page.request.post('/api/assets/' + asset.id + '/consent', {
    headers: { ...apiHeaders, 'Idempotency-Key': randomUUID() },
    data: { accepted: true, document_hash: saved.sha256 },
  });
  expect(consentRes.ok(), await consentRes.text()).toBeTruthy();
  const pubRes = await page.request.post('/api/assets/' + asset.id + '/publish', {
    headers: { ...apiHeaders, 'Idempotency-Key': randomUUID() },
    data: {},
  });
  expect(pubRes.ok(), await pubRes.text()).toBeTruthy();
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Ver mi perfil' })).toBeVisible({ timeout: 15000 });
}

/**
 * Demo → new creator UI profile, then complete gates via API (identity/evidence/consent/submit)
 * and land on /application.
 */
export async function onboardNewCreator(page: Page, name: string) {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Iniciar onboarding de creador', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText('MODO DEMO')).toBeVisible();
  await page.getByLabel('Nombre público').fill(name);
  await page.getByLabel('Ciudad y país').fill('Madrid, ES');
  await page
    .getByLabel('Sobre ti')
    .fill('Perfil ficticio para probar el onboarding de RightsNet de principio a fin.');
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page.getByRole('heading', { name: /Identidad/i })).toBeVisible({ timeout: 15000 });

  let asset: { id: string; policy_hash: string } | undefined;
  for (let i = 0; i < 20; i++) {
    const profileRes = await page.request.get('/api/creator');
    expect(profileRes.ok()).toBeTruthy();
    const profile = (await profileRes.json()) as {
      assets: Array<{ id: string; policy_hash: string }>;
    };
    asset = profile.assets[0];
    if (asset) break;
    await page.waitForTimeout(250);
  }
  expect(asset, 'creator profile should exist after save').toBeTruthy();
  const assetId = asset!.id;

  const idRes = await page.request.post('/api/assets/' + assetId + '/identity-sandbox', {
    headers: { ...apiHeaders, 'Idempotency-Key': randomUUID() },
    data: {},
  });
  expect(idRes.ok(), await idRes.text()).toBeTruthy();

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWWQAAAAASUVORK5CYII=',
    'base64',
  ).toString('base64');
  const fileRes = await page.request.post('/api/assets/' + assetId + '/files', {
    headers: { ...apiHeaders, 'Idempotency-Key': randomUUID() },
    data: { base64: png, mime_type: 'image/png' },
  });
  expect(fileRes.ok(), await fileRes.text()).toBeTruthy();

  // Refresh hash after any default policy
  const refreshed = (await (await page.request.get('/api/creator')).json()) as {
    assets: Array<{ id: string; policy_hash: string }>;
  };
  const hash = refreshed.assets[0].policy_hash;
  const consentRes = await page.request.post('/api/assets/' + assetId + '/consent', {
    headers: { ...apiHeaders, 'Idempotency-Key': randomUUID() },
    data: { accepted: true, document_hash: hash },
  });
  expect(consentRes.ok(), await consentRes.text()).toBeTruthy();

  const submitRes = await page.request.post('/api/assets/' + assetId + '/submit', {
    headers: { ...apiHeaders, 'Idempotency-Key': randomUUID() },
    data: {},
  });
  expect(submitRes.ok(), await submitRes.text()).toBeTruthy();

  await page.goto('/application');
  await expect(page).toHaveURL(/\/application/);
  await expect(page.getByRole('heading', { name: /Solicitud enviada|en revisión/i })).toBeVisible();
  await expect(page.getByText(/revisando tu perfil|UNDER_REVIEW|EN REVISIÓN/i).first()).toBeVisible();
}
