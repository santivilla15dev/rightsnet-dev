# Operación del sandbox

## Procesos y persistencia

`pnpm dev` prepara DB y arranca web 3000, API 4000 y worker. Los servicios escuchan en loopback. Cerrar la terminal detiene los procesos de app; PostgreSQL persiste. No borrar `.local/`: contiene base, uploads y clave de firma. La instancia es específica de este proyecto.

Detener PostgreSQL local, después de detener la app:

```bash
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D "$PWD/.local/postgres" stop -m fast
```

## Pago recibido sin licencia

Consultar orden en administración. `paid` puede estar esperando worker; `paid_requires_review` indica bloqueo. Arrancar `pnpm worker`. Revisar tabla `outbox` y `provider_events` mediante acceso local autorizado; los últimos errores no se muestran públicamente. Un job reintenta hasta ocho fallos; `dead` requiere resolver causa y replay auditado (el endpoint de replay sigue pendiente). No emitir una licencia manualmente ni cambiar el importe para forzarla.

## Reembolso

Desde administración, abrir Pagos y licencias, reembolsar y documentar motivo. En sandbox se registran refund y reverso de transferencia simulada. Consultar Ledger y Conciliar. El reembolso no cambia la licencia; una suspensión se registra como acción independiente y motivada. El adaptador Stripe devuelve bloqueo en vez de fingir una reversión externa completa.

## Cambios de política

Guardar crea una versión y devuelve el asset a borrador. Consentir esa versión y publicar. Las órdenes con checkout abierto conservan su snapshot. Suspender ventas desde administración bloquea nuevas ventas y la emisión de órdenes pendientes, sin reescribir certificados emitidos.

## Backups de desarrollo

Ensayo documentado (dump → restore en DB temporal → smoke):

```bash
pnpm db:backup-drill
```

Runbook: [`backup-restore-drill.md`](backup-restore-drill.md) · alcance
`docs/BACKUP_RESTORE_V0_1.md`. No sustituye PITR cloud.

## Staging / seguridad (higiene)

Antes de un host staging:

```bash
pnpm staging:security
```

Runbook: [`staging-security-checklist.md`](staging-security-checklist.md) ·
`docs/STAGING_DEPLOY_SECURITY_V0_1.md`. No acredita despliegue cloud.

Tras API/web arriba:

```bash
pnpm staging:health
```

Runbook: [`staging-health-smoke.md`](staging-health-smoke.md).

Uso de producto (Supabase, demo off):

```bash
pnpm product:ready
```

Tras un `git pull` que cambie la API, reinicia el proceso `pnpm api` (o
`pnpm dev`) para que `/v1/config` exponga campos nuevos (`demo_ui`, etc.).

Humo corto (automático + checklist visual):

```bash
pnpm product:smoke
```

Runbook: [`product-smoke-manual.md`](product-smoke-manual.md) ·
[`product-ready-local.md`](product-ready-local.md).

Próximos pasos (prioridad founder): [`../FOUNDER_PREP_NEXT_V0_1.md`](../FOUNDER_PREP_NEXT_V0_1.md).

Ensayo humano (marca/creador local): [`founder-human-trial.md`](founder-human-trial.md).

Andamiaje staging (web Vercel EU + API aparte), sin deploy automático:

[`staging-host-scaffold.md`](staging-host-scaffold.md).

Ejemplo manual adicional:

```bash
mkdir -p .local/backups
/opt/homebrew/opt/postgresql@16/bin/pg_dump -h 127.0.0.1 -p 55432 -U rightsnet -Fc rightsnet -f .local/backups/rightsnet.dump
```

Guardar también claves y uploads mediante backup cifrado autorizado. Sin la clave pública histórica no se verifica un certificado; sin la privada actual no se emiten nuevos. Nunca incluir claves privadas en Git o artefactos CI.

## Probar Stripe test

Guía completa: [`stripe-test-mode.md`](stripe-test-mode.md) (paso 6).

Resumen: `.env` con `PAYMENTS_PROVIDER=stripe`, solo `sk_test_` / `rk_test_`, `STRIPE_WEBHOOK_SECRET`, `LIVE_COMMERCE_ENABLED=false`. Forward de webhooks con Stripe CLI a `/v1/webhooks/stripe`. El creador completa Connect desde el panel. Tras un cobro test, usa Admin → Ledger → **Conciliar Stripe** (no confundir con **Conciliar ledger**).

La facturación live, entidad legal y gates de piloto siguen pendientes; este ensayo acredita test mode, no producción.
