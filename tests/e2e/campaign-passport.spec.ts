import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test('H6: issue passport, public verify, revoke to 404', async ({ page, request }) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Test DB required');
  await login(page, 'marca');
  await page.goto('/company/campaigns');
  const name = 'H6 Passport E2E ' + Date.now();
  await page.getByLabel('Nombre de campaña').fill(name);
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  await expect(page).toHaveURL(/\/company\/campaigns\/[0-9a-f-]+$/);
  const id = page.url().split('/').pop()!;

  await page.getByRole('button', { name: 'Passport', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Campaign Passport' })).toBeVisible();
  await expect(page.getByText(/No constituye autorización legal/)).toBeVisible();
  await page.getByLabel('Email allowlist passport').fill('partner@example.com');
  await page.getByLabel('Etiqueta passport').fill('E2E review');
  await page.getByRole('button', { name: 'Emitir passport' }).click();
  await expect(page.getByText(/^RN-PAS-\d{4}-\d{6}/)).toBeVisible();
  const tokenText = await page.getByText(/^RN-PAS-\d{4}-\d{6}/).first().textContent();
  const token = tokenText!.match(/RN-PAS-\d{4}-\d{6}/)![0];

  const pub = await request.get(`/api/public/campaign-passports/${token}`);
  expect(pub.ok()).toBeTruthy();
  const body = await pub.json();
  expect(body.flags.authority).toBe(false);
  expect(body.flags.legal_clearance).toBe(false);
  expect(body.campaign.name).toBe(name);
  expect(body.allowlist).toBeUndefined();

  await page.goto(`/verify/campaign-passport/${token}`);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText(/No constituye autorización legal/)).toBeVisible();

  await page.goto(`/company/campaigns/${id}`);
  await page.getByRole('button', { name: 'Passport', exact: true }).click();
  await page.getByRole('button', { name: 'Revocar' }).click();
  await expect(page.getByText(/REVOKED/)).toBeVisible();
  const gone = await request.get(`/api/public/campaign-passports/${token}`);
  expect(gone.status()).toBe(404);

  await page.getByRole('button', { name: 'Actividad', exact: true }).click();
  await expect(page.getByText(/Passport emitido/)).toBeVisible();
  await expect(page.getByText(/Passport revocado/)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Passport', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Campaign Passport' })).toBeVisible();
  await page.screenshot({ path: 'work/h6-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'work/h6-desktop.png', fullPage: true });
});
