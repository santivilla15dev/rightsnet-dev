# DB roles / tenancy v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT PASS (cierre abajo).

## Alcance

Separar rol SQL de migraciones del rol de la app:

1. `rightsnet` (o `MIGRATE_DATABASE_URL`) — aplica DDL / migraciones.
2. `rightsnet_app` (o `DATABASE_URL` de app) — DML (`SELECT/INSERT/UPDATE/DELETE`);
   **sin** `CREATE` en schema `public`.
3. `migrate.ts` usa `MIGRATE_DATABASE_URL` (fallback `DATABASE_URL`).
4. Ensayo: test que `rightsnet_app` no puede `CREATE TABLE`.

Tenancy de negocio sigue en la API (org members, admin). **RLS pleno** no
entra en v0.1 (placeholder documentado).

## Fuera de alcance

RLS por JWT Supabase, multi-schema por tenant, passwords en local trust.

## STOP

Roles separados PASS en local/CI cuando se provisiona `rightsnet_app`.
RLS completo pendiente.

## Cierre IMPLEMENT

Migración 033 + `MIGRATE_DATABASE_URL` en `migrate.ts`; `local-db.mjs` crea
`rightsnet_app`. Test `db-roles-tenancy` niega `CREATE TABLE` al rol app.
