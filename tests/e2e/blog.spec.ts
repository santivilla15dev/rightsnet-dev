import { test, expect } from '@playwright/test';

test('blog: index, article and unknown slug', async ({ page }) => {
  await page.goto('/blog');
  await expect(page.getByRole('heading', { name: 'Historias y contexto.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Qué es RightsNet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Para marcas y agencias' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Para creadores' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Por qué importa la verificación' })).toBeVisible();

  await page.getByRole('link', { name: 'Qué es RightsNet' }).click();
  await expect(page).toHaveURL(/\/blog\/que-es-rightsnet$/);
  await expect(page.getByRole('heading', { name: 'Qué es RightsNet', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explorar creadores' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Más artículos' })).toBeVisible();

  await page.goto('/blog/no-existe-este-articulo');
  await expect(page.getByRole('heading', { name: 'Este camino todavía no existe' })).toBeVisible();
});

test('blog: home footer links to blog', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Pie').getByRole('link', { name: 'Blog' }).click();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(page.getByRole('heading', { name: 'Historias y contexto.' })).toBeVisible();
});
