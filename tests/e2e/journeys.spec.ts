import { test, expect } from '@playwright/test';
import { login, onboardNewCreator, saveCreatorPolicy } from './helpers.js';

/**
 * Constitution §28 journey matrix — sandbox demo identities stand in for “register”.
 * Journey 10 = public /verify association (no AI generator in MVP scope).
 */
test('§28 journeys 1–4: creator onboarding identity likeness publish', async ({
  page,
  browser,
}) => {
  const name = 'Creador Journey ' + Date.now();

  await test.step('1–2 register creator + likeness evidence', async () => {
    await onboardNewCreator(page, name);
  });

  await test.step('3–4 consent review publish', async () => {
    const admin = await browser.newPage();
    await login(admin, 'administración');
    const row = admin.locator('tr').filter({ hasText: name });
    await row.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await admin
      .getByLabel('Motivo y evidencia')
      .fill('Revisión §28: fixture de identidad/likeness.');
    await admin.getByRole('button', { name: 'Registrar acción' }).click();
    await page.goto('/application');
    await expect(page.getByRole('heading', { name: /Estás aprobado/i })).toBeVisible();
    await page.getByRole('button', { name: 'Publicar mi perfil', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('link', { name: 'Ver mi perfil' })).toBeVisible();
    await admin.reload();
    await row.getByRole('button', { name: 'Suspender ventas', exact: true }).click();
    await admin
      .getByLabel('Motivo y evidencia')
      .fill('Fin journey §28 onboarding; retirar de descubrimiento.');
    await admin.getByRole('button', { name: 'Registrar acción' }).click();
    await admin.close();
  });
});

test('§28 journeys 5–10: discover use engine pay license verify', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await test.step('5 brand discovers creator', async () => {
    await login(page, 'marca');
    await expect(page).toHaveURL(/\/discover/);
    await expect(page.getByText('MODO DEMO')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lucía Martín', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Lucía Martín', exact: true }).click();
    await page.getByRole('button', { name: 'Configurar licencia' }).first().click();
  });

  await test.step('7 DENY path', async () => {
    await page.getByLabel('Nombre de la campaña').fill('Deny E2E ' + Date.now());
    await page.locator('select:has(option[value="politics"])').selectOption('politics');
    await page.getByRole('button', { name: 'Comprobar derechos' }).click();
    await expect(page.locator('.rights-check-panel')).toContainText('NO LICENSABLE');
    await expect(page.locator('.rights-check-panel')).toContainText(/denegad|prohibid|permitida/i);
  });

  await test.step('6–9 ALLOW contract payment license', async () => {
    await page.getByLabel('Nombre de la campaña').fill('Campaña §28 ' + Date.now());
    await page.locator('select:has(option[value="beauty"])').selectOption('beauty');
    await page.getByRole('button', { name: 'Comprobar derechos' }).click();
    await expect(page.getByText('LICENSABLE')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page).toHaveURL(/\/company\/orders\//);
    await expect(page.getByRole('heading', { name: 'Resumen de licencia' })).toBeVisible();
    await expect(page.getByText('Ver términos completos')).toBeVisible();
    await page.getByRole('checkbox', { name: /Acepto los términos de la licencia/ }).check();
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await page.getByRole('button', { name: 'Simular pago correcto' }).click();
    await expect(page.getByRole('heading', { name: 'Licencia emitida' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Descargar certificado JSON' }).click();
    expect((await download).suggestedFilename()).toContain('rightsnet-');
  });

  await test.step('10 verify association anonymous', async () => {
    await page.getByRole('link', { name: 'Verificar licencia' }).click();
    await expect(page.getByText('Firma criptográfica verificada')).toBeVisible();
    const publicUrl = page.url();
    const anonymous = await browser.newPage();
    await anonymous.goto(publicUrl);
    await expect(anonymous.getByRole('heading', { name: 'Certificado de licencia' })).toBeVisible();
    await anonymous.close();
  });

  expect(errors).toEqual([]);
});

test('§28 journey 7 REQUIRES_APPROVAL', async ({ page, browser }) => {
  await login(page, 'creador');
  await saveCreatorPolicy(page, 'manual');
  const buyer = await browser.newPage();
  await login(buyer, 'marca');
  await buyer.getByRole('link', { name: 'Lucía Martín', exact: true }).click();
  await buyer.getByRole('button', { name: 'Configurar licencia' }).first().click();
  const campaign = 'Approval §28 ' + Date.now();
  await buyer.getByLabel('Nombre de la campaña').fill(campaign);
  await buyer.getByRole('button', { name: 'Solicitar aprobación', exact: true }).click();
  await expect(buyer.getByText(/Camino: aprobación|aprobación del creador/i).first()).toBeVisible();
  await page.reload();
  const row = page.locator('tr').filter({ hasText: campaign });
  await row.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect(row.getByText('Aprobada', { exact: true })).toBeVisible();
  await buyer.goto('/company');
  await buyer
    .locator('tr')
    .filter({ hasText: campaign })
    .getByRole('button', { name: 'Continuar', exact: true })
    .click();
  await expect(buyer.getByRole('heading', { name: 'Resumen de licencia' })).toBeVisible();
  await expect(buyer.getByText('Ver términos completos')).toBeVisible();
  await buyer.getByRole('checkbox', { name: /Acepto los términos de la licencia/ }).check();
  await buyer.getByRole('button', { name: 'Continuar al pago' }).click();
  await expect(buyer).toHaveURL(/\/company\/checkout\//);
  await saveCreatorPolicy(page, 'automatic');
  await buyer.close();
});
