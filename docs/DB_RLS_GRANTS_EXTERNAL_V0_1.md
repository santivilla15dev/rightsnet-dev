# DB RLS grants + external agreements v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`rights_grants` y `external_agreements` no tienen FORCE RLS. Un fallo de filtro
en Ops/talent podría filtrar filas de otra org aunque Campaigns/Ops ya
limpien el bypass en rutas cableadas.

## Alcance v0.1

1. Migración `035_rls_grants_external.sql`:
   - ENABLE + FORCE en `rights_grants` y `external_agreements`.
   - Policies: miembro de la org grantee/org **o** `grantor_user_id =
     app_current_user_id()` (creador ve sus deals/grants).
   - `app_is_org_member` ya incluye bypass/admin → pool default y worker OK.
2. Test con `rightsnet_app` sin bypass: aislamiento por org + grantor.

## Fuera de alcance

- FORCE en ledger, outbox, licenses, generation_*.
- `DB_RLS_BYPASS_DEFAULT=false`.
- Cambiar authz de producto (`assertOps*`, platform).

## STOP

Policies + test PASS; bypass de pool intacto.

## Cierre IMPLEMENT

Migración `035_rls_grants_external.sql`. Test `db-rls` (2 casos) + talent/ops
focalizados PASS (19).
