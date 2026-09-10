import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { login } from './helpers.js';
import { pool } from '../../packages/db/index.js';
import { demoIds } from '../../packages/db/seed.js';
import { buildMarketplaceGrantPayload } from '../../packages/domain/src/index.js';
import { mintRnAuthToken } from '../../apps/api/src/modules/generation-auth.js';
import { platformReportOutput } from '../../apps/api/src/modules/report-output.js';

test.afterAll(() => pool.end());
test('H4 real signed evidence links, preflight and postflight', async ({ page }) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Test DB required');
  const now = new Date(),
    until = new Date(now.getTime() + 90 * 86400000).toISOString(),
    asset = randomUUID(),
    grant = randomUUID();
  const creator = (
    await pool.query('SELECT creator_id FROM assets WHERE id=$1', [demoIds.rightsCoreAsset])
  ).rows[0].creator_id;
  await pool.query('INSERT INTO assets(id,creator_id) VALUES($1,$2)', [asset, creator]);
  const payload = buildMarketplaceGrantPayload({
    grantId: grant,
    grantorUserId: demoIds.rightsCoreCreatorUser,
    granteeOrganizationId: demoIds.org,
    assetId: asset,
    licenseId: randomUUID(),
    validFrom: new Date(now.getTime() - 86400000).toISOString(),
    validUntil: until,
    status: 'ACTIVE',
    scope: {
      operation: 'synthetic_video',
      purpose: 'commercial_advertising',
      industry: 'beauty',
      territories: ['DE'],
      channels: ['instagram'],
      duration_days: 30,
    },
  });
  await pool.query(
    `INSERT INTO rights_grants(id,grantor_user_id,grantee_organization_id,asset_id,source_type,source_id,payload,status,valid_from,valid_until) VALUES($1,$2,$3,$4,'MARKETPLACE_LICENSE',$5,$6,'ACTIVE',$7,$8)`,
    [
      grant,
      demoIds.rightsCoreCreatorUser,
      demoIds.org,
      asset,
      payload.source.id,
      JSON.stringify(payload),
      payload.valid_from,
      until,
    ],
  );
  const token = await mintRnAuthToken({
    grantId: grant,
    organizationId: demoIds.org,
    assetId: asset,
    provider: 'higgsfield',
    use: {
      content_type: 'synthetic_video',
      purpose: 'commercial_advertising',
      industry: 'beauty',
      territory: 'DE',
    },
    grantValidUntil: until,
    now,
  });
  await login(page, 'marca');
  await page.goto('/company/campaigns');
  await page.getByLabel('Nombre de campaña').fill('H4 producción ' + Date.now());
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  await expect(page).toHaveURL(/\/company\/campaigns\/[a-f0-9-]+$/);
  const id = new URL(page.url()).pathname.split('/').pop();
  const add = await page.request.post(`/api/campaigns/${id}/talent`, {
    headers: { Origin: 'http://127.0.0.1:3010', 'Idempotency-Key': randomUUID() },
    data: { asset_id: asset, selected_grant_id: grant },
  });
  expect(add.ok()).toBe(true);
  const save = await page.request.post(`/api/campaigns/${id}/usage`, {
    headers: { Origin: 'http://127.0.0.1:3010', 'Idempotency-Key': randomUUID() },
    data: {
      expected_revision: 2,
      usage: {
        industry: 'beauty',
        operation: 'synthetic_video',
        purpose: 'commercial_advertising',
        territories: ['DE'],
        channels: ['instagram'],
        start_at: new Date(now.getTime() + 86400000).toISOString(),
        duration_days: 30,
      },
    },
  });
  expect(save.ok()).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Producción', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Preflight: Falta evidencia', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Referencia de evidencia').fill(token.payload.auth_id);
  await page.getByRole('button', { name: 'Vincular evidencia', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Preflight: Comprobaciones técnicas superadas',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await pool.query('SELECT status FROM generation_auths WHERE id=$1', [token.payload.auth_id]))
      .rows[0].status,
  ).toBe('ISSUED');
  const record = await platformReportOutput({
    auth_id: token.payload.auth_id,
    organization_id: demoIds.org,
    provider: 'higgsfield',
    output: {
      content_type: 'synthetic_video',
      uri: 'https://private.example/h4-output',
      sha256: 'c'.repeat(64),
    },
  });
  await page.getByRole('button', { name: 'Outputs', exact: true }).click();
  await page.getByLabel('Referencia de evidencia').fill(record.generation_id);
  await page.getByRole('button', { name: 'Vincular evidencia', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'higgsfield · Comprobaciones técnicas superadas',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/El archivo y su contenido visual no se han inspeccionado/),
  ).toBeVisible();
  expect(await page.locator('main').innerText()).not.toContain('private.example');
  await page.screenshot({ path: 'work/h4-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page
        .getByRole('button', { name: 'Cerrar menú', exact: true })
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'work/h4-mobile.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Outputs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retirar vínculo', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Retirar vínculo', exact: true }).click();
  await expect(page.getByText('No hay evidencias vinculadas en esta sección.')).toBeVisible();
  expect(
    (await pool.query('SELECT id FROM generation_records WHERE id=$1', [record.generation_id]))
      .rowCount,
  ).toBe(1);
  await page.getByRole('button', { name: 'Licencias', exact: true }).click();
  await expect(page.getByText('Referencia de origen: ' + payload.source.id)).toBeVisible();
  await page.getByRole('button', { name: 'Aprobaciones', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Aprobaciones pendientes', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Actividad', exact: true }).click();
  await expect(page.getByText(/Evidencia vinculada · revisión/)).toHaveCount(2);
  await expect(page.getByText(/Vínculo de evidencia retirado · revisión/)).toHaveCount(1);
});
