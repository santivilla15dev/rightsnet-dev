# DB RLS licenses + generation v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`licenses`, `generation_auths` y `generation_records` siguen sin FORCE RLS.
Verify público y worker usan bypass de pool; rutas con actor no deberían
ver filas de otra org si el filtro SQL falla.

## Alcance v0.1

Migración `036_rls_licenses_generation.sql`:

| Tabla | Visibilidad |
|-------|-------------|
| `licenses` | miembro de `orders.organization_id` **o** creador del asset de la orden |
| `generation_auths` | `app_is_org_member(organization_id)` |
| `generation_records` | idem |

`app_is_org_member` ya incluye bypass/admin → verify público, platform y
worker con pool default siguen OK.

## Fuera de alcance

FORCE en `orders`, `quotes`, ledger, outbox. `DB_RLS_BYPASS_DEFAULT=false`.

## STOP

Policies + test `rightsnet_app` PASS.

## Cierre IMPLEMENT

Migración `036_rls_licenses_generation.sql`. `db-rls` 3/3 + report-output /
rn-auth PASS. Verify público sigue con bypass de pool.
