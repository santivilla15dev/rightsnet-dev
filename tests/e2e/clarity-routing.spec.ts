import { test, expect } from '@playwright/test';
import { login, assertSandboxAuth } from './helpers.js';

test('clarity: discover public without auth', async ({ page }) => {
  await assertSandboxAuth(page);
  await page.goto('/discover');
  await expect(page.getByRole('heading', { name: /Encuentra talento IA licenciable/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver derechos' }).first()).toBeVisible();
  await expect(page.locator('.creator-card').first()).toBeVisible();
});

test('clarity: creator page slug and configure license CTA', async ({ page }) => {
  await assertSandboxAuth(page);
  await page.goto('/creators/lucia-martin');
  await expect(page.getByRole('heading', { name: /Lucía Martín|Lucia Martin/i })).toBeVisible();
  await expect(page.getByText('Disponible para')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configurar licencia' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Configurar licencia' }).first().click();
  await expect(page.getByRole('heading', { name: 'Configura tu uso' })).toBeVisible();
  await expect(page.getByText('Publicidad comercial')).toBeVisible();
  await expect(page.getByText('Ninguna').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Comprobar derechos|Solicitar aprobación/i })).toBeVisible();
});

test('clarity: Rights Check DENY has no Continuar checkout', async ({ page }) => {
  await assertSandboxAuth(page);
  await page.goto('/creators/lucia-martin');
  await page.getByRole('button', { name: 'Configurar licencia' }).first().click();
  await expect(page.getByRole('heading', { name: 'Configura tu uso' })).toBeVisible();
  await page.getByLabel('Nombre de la campaña').fill('Campaña política denegada');
  await page.locator('select:has(option[value="politics"])').selectOption('politics');
  await page.getByRole('button', { name: /Comprobar derechos|Solicitar aprobación/i }).click();
  await expect(page.getByText('RIGHTS CHECK')).toBeVisible();
  await expect(page.getByText('NO LICENSABLE')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Motivo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Continuar a la licencia/i })).toHaveCount(0);
});

test('clarity: anon Rights Check ALLOW then Continuar asks login', async ({ page }) => {
  await assertSandboxAuth(page);
  await page.goto('/creators/lucia-martin');
  await page.getByRole('button', { name: 'Configurar licencia' }).first().click();
  await page.getByLabel('Nombre de la campaña').fill('Anon ALLOW ' + Date.now());
  await page.getByRole('button', { name: /Comprobar derechos|Solicitar aprobación/i }).click();
  await expect(page.getByText('LICENSABLE')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('clarity: demo buyer lands in buyer chrome with banner', async ({ page }) => {
  await login(page, 'marca');
  await expect(page).toHaveURL(/\/discover/);
  await expect(page.getByText('MODO DEMO')).toBeVisible();
  await expect(page.getByText(/Estudio Norte|Alex/i).first()).toBeVisible();
});

test('clarity: demo existing creator lands on dashboard', async ({ page }) => {
  await login(page, 'creador');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('MODO DEMO')).toBeVisible();
});

test('clarity: demo new creator lands on onboarding', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Iniciar onboarding de creador' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText('ALTA DE CREADOR')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Perfil', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Derechos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisión', exact: true })).toBeVisible();
});

test('clarity: incomplete creator blocked from dashboard', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Iniciar onboarding de creador' }).click();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/onboarding/);
});

test('clarity: non-admin cannot open ops; sandbox admin can', async ({ page }) => {
  await login(page, 'marca');
  await page.goto('/ops');
  await expect(page.locator('.error-panel')).toContainText(/reservada|permiso|equipo/i);
  await login(page, 'administración');
  await expect(page).toHaveURL(/\/ops/);
  await expect(page.getByText(/Ops|Verificación|Pagos/i).first()).toBeVisible();
});

test('clarity: login has no persona switcher', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Explorar como marca' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir a Demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Crear cuenta' })).toBeVisible();
});

test('clarity: home does not link product CTAs to demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Licenciar tu likeness' })).toHaveAttribute(
    'href',
    '/signup?intent=creator',
  );
  await expect(page.getByLabel('RightsNet').getByRole('link', { name: 'Crear cuenta' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('link', { name: 'Iniciar sesión' }).first()).toHaveAttribute(
    'href',
    '/login',
  );
  await expect(page.getByRole('link', { name: 'Abrir Demo' })).toHaveCount(0);
});

test('clarity: signup has no permanent role picker', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('button', { name: 'Soy marca' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Soy creador' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
});
