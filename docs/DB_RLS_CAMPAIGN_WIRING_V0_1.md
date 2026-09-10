# DB RLS campaign wiring v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

El piloto RLS (`docs/DB_RLS_V0_1.md`) deja el pool con `app.rls_bypass=1`.
Ninguna ruta Nest limpia el bypass: la defensa en profundidad no se ejercita
en tráfico real de producto.

## Alcance v0.1

1. Cablear actor RLS (`app.rls_bypass=0` + `app.current_user_id` / `app.is_admin`)
   en el módulo **Campaigns H1** (`list` / `get` / `create` / `update`).
2. Extender `mutate` con contexto RLS opcional (misma transacción que
   idempotencia).
3. Authz de producto **sigue** en `campaignAccess` (owner/employee/write).
   RLS no sustituye roles de negocio (p. ej. `viewer` sigue 404 en API aunque
   sea miembro a nivel SQL).

## Fuera de alcance

- H2–H6, Rights Ops, checkout, ledger, worker.
- `DB_RLS_BYPASS_DEFAULT=false` global.
- Más tablas FORCE RLS.
- Cambiar políticas SQL del piloto.

## STOP

Campaigns H1 bajo `withRlsActor` / `mutate(..., rls)`; tests H1 + RLS PASS;
bypass de pool permanece el default.

## Cierre IMPLEMENT

- `mutate(..., rls?)` aplica GUCs al inicio de la transacción.
- `campaigns.ts`: list/get/create/update con `campaignRlsActor` + `withRlsActor`.
- H2–H6 siguen con bypass de pool vía `findCampaign(pool, …)` (hito siguiente).
- Tests: `campaigns` + H2–H6 focalizados + `db-rls` PASS (27).
