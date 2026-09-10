import { expect, test } from '@playwright/test';
import { login } from './helpers.js';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildExternalAgreementGrantPayload } from '../../packages/domain/src/index.js';

test('H3: structured use produces deterministic incomplete clearance', async ({ page }) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Test DB required');
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const asset = randomUUID(),
    grant = randomUUID();
  const now = new Date();
  const org = '20000000-0000-4000-8000-000000000001';
  try {
    const creator = (await db.query('SELECT id,user_id FROM creators ORDER BY id LIMIT 1')).rows[0];
    await db.query('INSERT INTO assets(id,creator_id) VALUES($1,$2)', [asset, creator.id]);
    const payload = buildExternalAgreementGrantPayload({
      grantId: grant,
      grantorUserId: creator.user_id,
      granteeOrganizationId: org,
      assetId: asset,
      agreementId: randomUUID(),
      status: 'ACTIVE',
      proposed: {
        rights: { synthetic_video: 'ALLOW', commercial_advertising: 'ALLOW' },
        industry: ['beauty'],
        territories: ['DE'],
        approval: {},
        valid_from: new Date(now.getTime() - 86400000).toISOString(),
        valid_until: new Date(now.getTime() + 365 * 86400000).toISOString(),
      },
    });
    await db.query(
      "INSERT INTO rights_grants(id,grantor_user_id,grantee_organization_id,asset_id,source_type,source_id,payload,status,valid_from,valid_until) VALUES($1,$2,$3,$4,'EXISTING_AGREEMENT',$5,$6,'ACTIVE',$7,$8)",
      [
        grant,
        creator.user_id,
        org,
        asset,
        payload.source.id,
        JSON.stringify(payload),
        payload.valid_from,
        payload.valid_until,
      ],
    );
  } finally {
    await db.end();
  }
  await login(page, 'marca');
  await page.goto('/company/campaigns');
  await page.getByLabel('Nombre de campaña').fill(`H3 derechos ${Date.now()}`);
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  await expect(page).toHaveURL(/\/company\/campaigns\/[a-f0-9-]+$/);
  const id = new URL(page.url()).pathname.split('/').pop();
  const linked = await page.request.post(`/api/campaigns/${id}/talent`, {
    headers: { Origin: 'http://127.0.0.1:3010', 'Idempotency-Key': randomUUID() },
    data: { asset_id: asset, selected_grant_id: grant },
  });
  expect(linked.ok()).toBe(true);
  await page.reload();

  await page.getByRole('button', { name: 'Derechos', exact: true }).click();
  await page.getByLabel('Industria').selectOption('beauty');
  await page.getByLabel('Generación').selectOption('synthetic_video');
  await page.getByLabel('Propósito').selectOption('commercial_advertising');
  await page
    .getByLabel('Inicio (UTC)')
    .fill(new Date(now.getTime() + 86400000).toISOString().slice(0, 16));
  await page.getByLabel('Duración en días').fill('30');
  await page.getByLabel('Alemania').check();
  await page.getByLabel('Instagram').check();
  await page.getByRole('button', { name: 'Guardar uso y evaluar' }).click();

  await expect(page.getByRole('heading', { name: 'Faltan datos', exact: true })).toBeVisible();
  await expect(page.getByText(/El acuerdo no declara una duración\./).first()).toBeVisible();
  await expect(page.getByText(/Este resultado no autoriza generación/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Derechos', exact: true }).click();
  await expect(page.getByLabel('Industria')).toHaveValue('beauty');
  await expect(page.getByText('Cambios sin guardar.')).toHaveCount(0);
  await page.screenshot({ path: 'work/h3-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page
        .getByRole('button', { name: 'Cerrar menú', exact: true })
        .evaluate((element) => element.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'work/h3-mobile.png', fullPage: true });

  await page.getByRole('button', { name: 'Actividad', exact: true }).click();
  await expect(page.getByText(/Uso actualizado · revisión/)).toHaveCount(1);
});
