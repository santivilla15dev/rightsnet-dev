import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('H2: marketplace and inventory links, reload, remove and activity', async ({ page }) => {
  await login(page, 'marca');
  await page.goto('/company/talent');
  await expect(page.getByRole('heading', { name: 'Mi talento', exact: true })).toBeVisible();
  await page.getByLabel('Vigencia', { exact: true }).selectOption('current');
  await expect(page.getByText('Consultado:', { exact: false })).toBeVisible();
  await page.goto('/company/campaigns');
  const name = 'H2 verificación ' + Date.now();
  await page.getByLabel('Nombre de campaña').fill(name);
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  await expect(page).toHaveURL(/\/company\/campaigns\/[a-f0-9-]+$/);
  const campaignUrl = page.url();
  await page.getByRole('button', { name: 'Talento', exact: true }).click();
  await page.getByLabel('Buscar en marketplace', { exact: true }).fill('Lucía');
  await page.getByRole('button', { name: 'Buscar talento publicado' }).click();
  await page.getByRole('button', { name: 'Añadir talento', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Talento vinculado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retirar de campaña' })).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Talento', exact: true }).click();
  await expect(page.getByText('Sin derecho seleccionado.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retirar de campaña' }).click();
  await expect(page.getByText('No hay talento vinculado en esta página.')).toBeVisible();
  // The first inventory grant is selected explicitly, not inferred from the campaign name.
  await page.getByRole('button', { name: 'Añadir con este derecho', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Retirar de campaña' })).toHaveCount(1);
  const campaignId = new URL(campaignUrl).pathname.split('/').pop();
  const response = await page.request.get(`/api/campaigns/${campaignId}/talent`);
  expect(response.ok()).toBe(true);
  const linked = await response.json();
  expect(linked.items[0].selected_grant_id).toBeTruthy();
  expect(linked.items[0].selected_grant.id).toBe(linked.items[0].selected_grant_id);
  await page.screenshot({ path: 'work/h2-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page
        .getByRole('button', { name: 'Cerrar menú', exact: true })
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'work/h2-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Actividad', exact: true }).click();
  await expect(page.getByText(/Talento añadido · revisión/)).toHaveCount(2);
  await expect(page.getByText(/Talento retirado · revisión/)).toHaveCount(1);
});
