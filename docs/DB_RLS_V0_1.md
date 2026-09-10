# DB RLS (org pilot) v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT PASS (cierre abajo).

## Problema

`rightsnet_app` puede DML en todas las filas. La tenancy de negocio ya vive
en la API (`member`, `assertOps*`, `campaignAccess`). Falta una **defensa en
profundidad** en Postgres si una consulta olvida el filtro de org.

Nest **no** inyecta JWT de Supabase en Postgres: no hay `auth.uid()`.

## Alcance v0.1

1. GUCs de sesión/transacción:
   - `app.current_user_id` (uuid texto)
   - `app.is_admin` (`1` / vacío)
   - `app.rls_bypass` (`1` = proceso de servicio / compat)
2. Funciones SQL `app_rls_bypass`, `app_is_admin`, `app_current_user_id`,
   `app_is_org_member(org_id)` (`SECURITY DEFINER` + `row_security=off` para
   evitar recursión al leer `organization_members`).
3. `ENABLE` + `FORCE ROW LEVEL SECURITY` en tablas piloto:
   - `organizations`
   - `organization_members`
   - `campaigns`
4. Helpers TS: `setRlsBypass`, `setRlsActor`, `withRlsActor` en `packages/db`.
5. **Runtime por defecto:** al conectar el pool de app se pone
   `app.rls_bypass=1` (sesión) para no romper API, worker, seed ni tests
   existentes. La authz de producto sigue siendo la API.
6. Tests con pool `rightsnet_app` **sin** bypass demuestran aislamiento.

## Fuera de alcance

- Sustituir `assertOps*` / `campaignAccess` por solo RLS.
- JWT Supabase dentro de Postgres / `auth.uid()`.
- RLS en ledger, outbox, webhooks Stripe, `schema_migrations`, verify público.
- Cablear `withRlsActor` en todas las rutas Nest (hito progresivo aparte).
- `DB_RLS_BYPASS_DEFAULT=false` como default de producción.

## Contrato GUC

| Contexto | Config |
|----------|--------|
| Migraciones / seed / worker / API actual | `app.rls_bypass=1` |
| Ensayo o ruta que quiera RLS | `app.rls_bypass=0` + `app.current_user_id` (+ `app.is_admin` si admin) |

## STOP

Policies + FORCE + helpers + tests PASS. Authz de negocio permanece en API.
Cableado progresivo `withRlsActor` y más tablas = hitos futuros.
Campaigns H1 cableado: `docs/DB_RLS_CAMPAIGN_WIRING_V0_1.md` (**PASS**).

## Cierre IMPLEMENT

Migración `034_rls_org_pilot.sql`; helpers en `packages/db`; bypass en
`pool` connect + migrate/seed; test `tests/db-rls.test.ts`.
