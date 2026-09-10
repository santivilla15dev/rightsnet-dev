import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('campaign create, edit, reload and activity on desktop and mobile', async ({ page }) => {
  await login(page, 'marca');
  await page.goto('/company/campaigns');
  const name = 'Campaña E2E ' + Date.now();
  await page.getByLabel('Nombre de campaña').fill(name);
  await page.getByLabel('Brief creativo', { exact: true }).fill('Idea inicial');
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  await expect(page).toHaveURL(/\/company\/campaigns\/[a-f0-9-]+$/);
  await expect(page.getByText('Derechos: sin evaluar.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Creatividad', exact: true }).click();
  await page.getByLabel('Brief creativo', { exact: true }).fill('Brief revisado y persistente');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Campaña guardada' })).toContainText(
    'Campaña guardada',
  );
  await page.reload();
  await expect(page.getByText('Brief revisado y persistente', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actividad', exact: true }).click();
  await expect(page.getByText(/Campaña creada · revisión 1/)).toBeVisible();
  await expect(page.getByText(/Campaña actualizada · revisión 2/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.getByRole('button', { name: 'Cerrar menú', exact: true }).evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'work/campaign-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await page.screenshot({ path: 'work/campaign-desktop.png', fullPage: true });
});
