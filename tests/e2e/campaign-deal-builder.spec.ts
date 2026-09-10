import { expect, test } from '@playwright/test';
import { login } from './helpers.js';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildExternalAgreementGrantPayload } from '../../packages/domain/src/index.js';

test('H5: deal request draft send withdraw without granting rights', async ({ page }) => {
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
        approval: { review: 'needed' },
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

    await login(page, 'marca');
    await page.goto('/company/campaigns');
    const name = 'H5 Deal Builder E2E ' + Date.now();
    await page.getByLabel('Nombre de campaña').fill(name);
    await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
    await expect(page).toHaveURL(/\/company\/campaigns\/[0-9a-f-]+$/);
    const id = page.url().split('/').pop()!;

    const talentRes = await page.request.post(`/api/campaigns/${id}/talent`, {
      headers: { Origin: new URL(page.url()).origin, 'Idempotency-Key': randomUUID() },
      data: { asset_id: asset, selected_grant_id: grant },
    });
    expect(talentRes.ok()).toBeTruthy();
    const camp = await (
      await page.request.get(`/api/campaigns/${id}`, {
        headers: { Origin: new URL(page.url()).origin },
      })
    ).json();
    const usageRes = await page.request.post(`/api/campaigns/${id}/usage`, {
      headers: { Origin: new URL(page.url()).origin, 'Idempotency-Key': randomUUID() },
      data: {
        expected_revision: camp.revision,
        usage: {
          industry: 'beauty',
          operation: 'synthetic_video',
          purpose: 'commercial_advertising',
          territories: ['AT'],
          channels: ['instagram'],
          start_at: new Date(now.getTime() + 86400000).toISOString(),
          duration_days: 30,
        },
      },
    });
    expect(usageRes.ok()).toBeTruthy();

    await page.getByRole('button', { name: 'Solicitudes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Solicitudes de ampliación' })).toBeVisible();
    await expect(page.getByText(/Esto no modifica derechos ni concede permiso/)).toBeVisible();
    await page.getByLabel('Nota de solicitud').fill('Necesitamos AT');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('Borrador')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar como enviada' }).click();
    await expect(page.getByText('Enviada (registro interno)')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Solicitudes', exact: true }).click();
    await expect(page.getByText('Enviada (registro interno)')).toBeVisible();
    await page.getByRole('button', { name: 'Retirar solicitud' }).click();
    await expect(page.getByText('Retirada')).toBeVisible();
    await page.getByRole('button', { name: 'Actividad', exact: true }).click();
    await expect(page.getByText(/Solicitud enviada · revisión/)).toBeVisible();
    await expect(page.getByText(/Solicitud retirada · revisión/)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Solicitudes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Solicitudes de ampliación' })).toBeVisible();
    const box = await page
      .getByRole('heading', { name: 'Solicitudes de ampliación' })
      .boundingBox();
    expect(box && box.x + box.width <= 390).toBeTruthy();
    await page.screenshot({ path: 'work/h5-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: 'work/h5-desktop.png', fullPage: true });
  } finally {
    await db.end();
  }
});
