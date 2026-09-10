# DB RLS Campaign H2–H6 wiring v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT **PASS** (cierre abajo).

## Problema

H1 ya limpia el bypass RLS (`docs/DB_RLS_CAMPAIGN_WIRING_V0_1.md`).
H2–H6 siguen llamando `findCampaign(pool, …)` / `campaignAccess(pool, …)`
con el bypass de sesión: la política FORCE en `campaigns` /
`organization_members` no se ejercita en esos caminos.

## Alcance v0.1

Cablear `campaignRlsActor` + `withRlsActor` / `mutate(..., rls)` en:

| Módulo | Superficie |
|--------|------------|
| H2 Talent | inventory, campaign talent list/add/remove |
| H3 Clearance | usage update, get clearance |
| H4 Flight | evidence mutate, get flight |
| H5 Deal Builder | get gaps, create/send/withdraw requests |
| H6 Passport | list/issue/revoke (+ issuer lookup en revoke path) |

Authz de producto sigue en `campaignAccess` / `findCampaign`.
Tablas sin FORCE RLS (grants, talent links, etc.) se leen igual bajo actor.

## Fuera de alcance

- `DB_RLS_BYPASS_DEFAULT=false`
- FORCE RLS en más tablas
- Rights Ops / marketplace / payments

## STOP

H2–H6 con actor RLS; tests H1–H6 + `db-rls` PASS; pool bypass default intacto.

## Cierre IMPLEMENT

- H2 `talent-inventory.ts`: inventory + talent list/add/remove con `withRlsActor` /
  `mutate(..., rls)`.
- H3 `campaign-clearance.ts`: usage update + get clearance; lectura con
  `{ readonly: true }` en `withRlsActor`.
- H4 `campaign-flight.ts`: evidence mutate + get flight; mismo patrón readonly.
- H5 `campaign-deal-builder.ts`: getDealBuilder + upsert/send/withdraw requests.
- H6 `campaign-passport.ts`: list/issue/revoke; verify público usa actor del
  issuer para `findCampaign` (pool solo en lookup público sin auth).
- `withRlsActor(..., { readonly: true })` aplica `REPEATABLE READ READ ONLY` antes
  de GUCs RLS (orden exigido por Postgres).
- Tests: 36/36 PASS (`campaigns`, `talent-inventory`, H3–H6 focalizados, `db-rls`).
