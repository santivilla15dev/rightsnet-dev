import { expect, type Page } from '@playwright/test';

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

/** Walk new-creator onboarding through submit-for-review. */
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
  await page.getByRole('button', { name: 'Identidad' }).click();
  await page.getByRole('button', { name: 'Simular verificación', exact: true }).click();
  await page.getByRole('button', { name: 'Likeness' }).click();
  await page.getByLabel('Subir evidencia').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWWQAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Consentimiento' }).click();
  await page.getByRole('checkbox', { name: /Acepto las condiciones guardadas/ }).check();
  await page.getByRole('button', { name: 'Registrar consentimiento' }).click();
  await page.getByRole('button', { name: 'Revisión' }).click();
  await page.getByRole('button', { name: 'Enviar a revisión', exact: true }).click();
  await expect(page).toHaveURL(/\/application/);
  await expect(page.getByText(/en revisión/i).first()).toBeVisible();
}
