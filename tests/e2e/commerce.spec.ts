import { test, expect } from '@playwright/test';
import { login, onboardNewCreator, saveCreatorPolicy } from './helpers.js';

test('marketplace filters, saves and mobile layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/discover');
  const cards = page.locator('.creator-card');
  await expect(cards.first()).toBeVisible();
  const initialCount = await cards.count();
  expect(initialCount).toBeGreaterThanOrEqual(5);
  const industry = page.locator('select:has(option[value="beauty"])');
  if (!(await industry.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Filtros/i }).click();
  }
  await industry.selectOption('beauty');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(initialCount);
  await page.getByLabel('Buscar talento').fill('no existe este perfil');
  await page.getByLabel('Buscar talento').press('Enter');
  await expect(page.getByRole('heading', { name: 'Todavía no hay coincidencias' })).toBeVisible();
  await login(page, 'marca');
  await page.goto('/discover');
  await page.getByRole('button', { name: 'Guardar a Lucía Martín', exact: true }).click();
  await page.goto('/saved');
  await expect(page.getByRole('heading', { name: 'Lucía Martín', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Quitar de guardados a Lucía Martín', exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/discover');
  await expect(page.locator('.creator-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/screenshots/marketplace-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('buyer journey: contract, failed payment, retry, signed license, admin refund', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'marca');
  await page.getByRole('link', { name: 'Lucía Martín', exact: true }).click();
  await page.getByRole('button', { name: 'Configurar licencia' }).first().click();
  await page.getByLabel('Nombre de la campaña').fill('Campaña E2E ' + Date.now());
  await page.getByRole('button', { name: 'Comprobar derechos' }).click();
  await expect(page.getByText('LICENSABLE')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL(/\/company\/orders\//);
  await expect(page.getByRole('heading', { name: 'Resumen de licencia' })).toBeVisible();
  await expect(page.getByText('Ver términos completos')).toBeVisible();
  await expect(page.locator('.license-summary-list dt', { hasText: 'Licenciatario' })).toBeVisible();
  await expect(page.locator('.license-summary-list dd').first()).toContainText(/Sandbox|Estudio/i);
  const orderUrl = page.url();
  await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Acepto los términos de la licencia/ }).check();
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await expect(page).toHaveURL(/\/company\/checkout\//);
  await page.getByRole('button', { name: 'Probar pago rechazado' }).click();
  await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await page.getByRole('button', { name: 'Simular pago correcto' }).click();
  await expect(page.getByRole('heading', { name: 'Licencia emitida' })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.locator('.license-success-token code')).toHaveText(/^RN-LIC-\d{4}-\d{6}$/);
  await expect(page.getByRole('button', { name: 'Registrar contenido IA' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/order-issued.png', fullPage: true });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Descargar certificado' }).click();
  expect((await download).suggestedFilename()).toContain('rightsnet-');
  await page.getByRole('link', { name: 'Verificar licencia' }).click();
  await expect(page.getByText('Firma criptográfica verificada')).toBeVisible();
  await expect(page.getByText(/RN-LIC-\d{4}-\d{6}/)).toBeVisible();
  await expect(page.getByText('Programada', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/license-verification.png', fullPage: true });
  const publicUrl = page.url();
  const anonymous = await browser.newPage();
  await anonymous.goto(publicUrl);
  await expect(anonymous.getByRole('heading', { name: 'Certificado de licencia' })).toBeVisible();
  await anonymous.goto(orderUrl);
  await expect(
    anonymous.getByRole('heading', { name: 'Un espacio para tus derechos' }),
  ).toBeVisible();
  await anonymous.close();
  await login(page, 'administración');
  await page.getByRole('button', { name: 'Pagos y licencias', exact: true }).click();
  const row = page.locator('tr').filter({ hasText: 'Campaña E2E' }).first();
  await row.getByRole('button', { name: 'Reembolsar', exact: true }).click();
  await page
    .getByLabel('Motivo y evidencia')
    .fill('Reembolso de validación del recorrido sandbox.');
  await page.getByRole('button', { name: 'Registrar acción' }).click();
  await expect(row.getByText('Reembolsado', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Suspender licencia', exact: true }).click();
  await page
    .getByLabel('Motivo y evidencia')
    .fill('Suspensión de prueba con fundamento contractual simulado.');
  await page.getByRole('button', { name: 'Registrar acción' }).click();
  await page.goto(publicUrl);
  await expect(page.getByText('Suspendida', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('creator policy version and manual approval journey', async ({ page, browser }) => {
  await login(page, 'creador');
  await saveCreatorPolicy(page, 'manual');
  const buyer = await browser.newPage();
  await login(buyer, 'marca');
  await buyer.getByRole('link', { name: 'Lucía Martín', exact: true }).click();
  await buyer.getByRole('button', { name: 'Configurar licencia' }).first().click();
  const campaign = 'Aprobación E2E ' + Date.now();
  await buyer.getByLabel('Nombre de la campaña').fill(campaign);
  await buyer.getByRole('button', { name: 'Solicitar aprobación', exact: true }).click();
  await expect(buyer.getByText(/aprobación|Esperando|Camino/i).first()).toBeVisible();
  await page.reload();
  const card = page.locator('.request-card').filter({ hasText: campaign });
  await expect(card.getByRole('heading', { name: campaign })).toBeVisible();
  await expect(card.getByText(/Por qué me lo piden/i)).toBeVisible();
  await card.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect(
    page.locator('tr').filter({ hasText: campaign }).getByText('Aprobada', { exact: true }),
  ).toBeVisible();
  await buyer.goto('/company');
  await buyer
    .locator('tr')
    .filter({ hasText: campaign })
    .getByRole('button', { name: 'Completar licencia', exact: true })
    .click();
  await expect(buyer.getByRole('heading', { name: 'Resumen de licencia' })).toBeVisible();
  await expect(buyer.getByText('Ver términos completos')).toBeVisible();
  await buyer.close();
  await saveCreatorPolicy(page, 'automatic');
  await page.screenshot({ path: 'docs/screenshots/creator-dashboard.png', fullPage: true });
});

test('readonly viewer and CSRF protections', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Probar acceso de solo lectura' }).click();
  await page.goto('/discover');
  await page.getByRole('link', { name: 'Lucía Martín', exact: true }).click();
  await page.getByRole('button', { name: 'Configurar licencia' }).first().click();
  await page.getByLabel('Nombre de la campaña').fill('Viewer cannot buy');
  await page.getByRole('button', { name: 'Comprobar derechos' }).click();
  await expect(page.locator('.inline-error')).toContainText(
    /marca u organización|Tu rol no permite|Se necesita/i,
  );
  const response = await page.request.post('/api/auth/sandbox', {
    headers: { origin: 'https://untrusted.invalid' },
    data: { role: 'admin' },
  });
  expect(response.status()).toBe(403);
  await page.goto('/ops');
  await expect(page.locator('.error-panel')).toContainText(/administración|reservada|permiso/i);
});

test('new creator onboarding: evidence, consent, review and publication', async ({
  page,
  browser,
}) => {
  const name = 'Creador E2E ' + Date.now();
  await onboardNewCreator(page, name);
  const admin = await browser.newPage();
  await login(admin, 'administración');
  const row = admin.locator('tr').filter({ hasText: name });
  await row.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await admin
    .getByLabel('Motivo y evidencia')
    .fill('Revisión de fixture: imagen sintética de prueba, sin verificación jurídica real.');
  await admin.getByRole('button', { name: 'Registrar acción' }).click();
  await expect(row.getByText('Borrador', { exact: true })).toBeVisible();
  await page.goto('/application');
  await expect(page.getByRole('heading', { name: /Estás aprobado/i })).toBeVisible();
  await page.getByRole('button', { name: 'Publicar mi perfil', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('link', { name: 'Ver mi perfil' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver mi perfil' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await admin.reload();
  await row.getByRole('button', { name: 'Suspender ventas', exact: true }).click();
  await admin
    .getByLabel('Motivo y evidencia')
    .fill('Fin de prueba E2E. Conservamos las evidencias y retiramos el perfil de prueba.');
  await admin.getByRole('button', { name: 'Registrar acción' }).click();
  await expect(row.getByText('Suspendido', { exact: true })).toBeVisible();
  await admin.close();
});
