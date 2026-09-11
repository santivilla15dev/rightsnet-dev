import { test, expect } from '@playwright/test';

test('alcance público: home → confianza → textos provisionales', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Secciones públicas' })
    .getByRole('link', { name: 'Confianza', exact: true })
    .click();
  await expect(page).toHaveURL(/\/trust$/);
  await expect(page.getByRole('heading', { name: 'Qué verifica RightsNet' })).toBeVisible();
  await expect(
    page.getByText(/Una compatibilidad favorable no concede una licencia/),
  ).toBeVisible();
  await expect(page.getByText(/no inspeccionan por sí solos todo el contenido/)).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'Privacidad', exact: true }).click();
  await expect(page.getByText('Texto provisional')).toBeVisible();
});

test('confianza legible en móvil y accesible sin sesión', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/trust');
  await expect(page.getByRole('heading', { name: 'Estado del servicio' })).toBeVisible();
  await expect(page.locator('main')).toContainText('pendiente de revisión jurídica');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/screenshots/trust-mobile.png', fullPage: true });
});
