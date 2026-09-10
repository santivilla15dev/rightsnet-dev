# Org buyers AT v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT PASS (cierre abajo).

## Alcance

Domicilio de organización buyer (`organizations.country`) alineado con el piloto
propuesto AT+DE, conservando **ES** para orgs legacy/demo históricas.

- `country` = domicilio societario de la empresa, **no** territorio de licencia de campaña.
- Valores admitidos: `AT` | `DE` | `ES`.
- No remapear orgs existentes ES→AT.
- No cambiar Connect country bias (hito aparte).
- No afirmar clearance legal AT–DE.

## Estado previo

- Migración `014_org_company_setup.sql` ya amplió el CHECK a `AT|DE|ES`.
- API (`POST /organizations`, setup/bootstrap) y UI `company-setup` ya aceptaban AT.
- Hueco documentado en `launch-gates` / backlog: contratos OpenAPI aún `ES|DE` y
  seed demo en ES; verdad documental desfasada.

## Entrega

1. OpenAPI / `packages/contracts` con `country: AT|DE|ES`.
2. Seed demo buyer principal en **AT** (legacy ES permanece permitido).
3. Test de aceptación: crear org AT por API Commerce y rechazar país inválido.
4. Truth-sync: `AGENTS.md`, `BACKLOG_OPEN_WORK.md`, `launch-gates.md`, `VERIFICATION.md`.

## Cierre — 2026-09-10

SPECIFY → IMPLEMENT → TEST → VERIFY → DOCUMENT → **STOP**.

- Confirmado en DB local/test: CHECK `AT|DE|ES` (vía 014).
- OpenAPI + `packages/contracts` regenerados con `country: AT|DE|ES`.
- Seed demo buyer principal: domicilio **AT** (ES sigue permitido).
- Tests `tests/org-buyers-at.test.ts` + supabase-auth AT setup: PASS.
- Typecheck/lint PASS.

No Connect country, no remap de grants, no clearance legal.
