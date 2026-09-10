# DB RLS Rights Ops wiring v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

Campaigns H1–H6 ya usan actor RLS. Rights Ops sigue leyendo
`organization_members` / `organizations` con el bypass del pool
(`assertOps*`, overview, campaign-query, Existing Deal writes).

## Alcance v0.1

1. `opsRlsActor` + `assertOpsReadAccess` / `assertOpsWriteAccess` bajo
   `withRlsActor` (membership).
2. `rightsOperationsOverview` / `rightsOperationsCampaignQuery` reciben
   `Actor` y validan la org bajo RLS.
3. `mutate(..., rls)` en writes Existing Deal del controller (create, bulk,
   confirm, y demás mutaciones que ya pasan por `assertOpsWriteAccess`).

Authz de producto sigue en `assertOps*` (admin / owner / employee).
`rights_grants` / `external_agreements` **no** tienen FORCE RLS en este hito.

## Fuera de alcance

- FORCE RLS en grants / external_agreements
- `DB_RLS_BYPASS_DEFAULT=false`
- Admin ledger / Stripe recon

## STOP

Ops access + overview/campaign + Existing Deal mutates con actor RLS;
tests ops / org-member PASS.

## Cierre IMPLEMENT

- `opsRlsActor` + `assertOpsReadAccess` / `assertOpsWriteAccess` vía `withRlsActor`.
- Overview / campaign-query reciben `Actor` y validan `organizations` bajo RLS
  (efectivo con `DATABASE_URL=rightsnet_app`; el rol migrator/superuser de tests
  sigue pudiendo saltar FORCE RLS — aislamiento SQL en `tests/db-rls.test.ts`).
- Existing Deal writes del admin controller pasan `mutate(..., rls)`.
- Tests: `rights-operations`, `rights-operations-org-member`, `org-member-writes`,
  `db-rls` PASS.
