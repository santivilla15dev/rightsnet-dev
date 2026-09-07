import { test, expect } from '@playwright/test';
import { assertSandboxAuth } from './helpers.js';

test('home pública: marca, CTAs y cómo funciona', async ({ page }) => {
  await assertSandboxAuth(page);
  await page.goto('/');
  await expect(page.getByRole('paragraph').filter({ hasText: 'RightsNet' }).first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Licencia talento IA con derechos claros.' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('RightsNet').getByRole('link', { name: 'Encontrar creadores' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Licenciar tu likeness' })).toBeVisible();
  await expect(page.getByLabel('RightsNet').getByRole('link', { name: 'Crear cuenta' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('link', { name: 'Iniciar sesión' }).first()).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Para agencias y marcas → Saber más' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir Demo' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cómo funciona' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Descubre' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Para quién es' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué incluye una licencia' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Como marca' })).toHaveCount(0);
  await page.getByLabel('RightsNet').getByRole('link', { name: 'Encontrar creadores' }).click();
  await expect(page).toHaveURL(/\/discover/);
  await expect(page.locator('.creator-card').first()).toBeVisible();
  await page.goto('/');
  await page.getByRole('link', { name: 'Licenciar tu likeness' }).click();
  await expect(page).toHaveURL(/\/signup\?intent=creator/);
  await page.goto('/');
  await page.getByRole('link', { name: 'Iniciar sesión' }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir a Demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toHaveCount(0);
  await page.screenshot({ path: 'docs/screenshots/home-desktop.png', fullPage: true });
});
