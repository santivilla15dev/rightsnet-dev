# Thin v2 recovery + fees / multi-account v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT PASS (cierre abajo).

## Alcance

Cierra los dos gaps abiertos de `docs/STRIPE_MONEY_RECON_GAPS_V0_1.md`:

1. **Thin v2 recovery paginada** — relistar `GET /v2/core/events` (tipos
   Accounts), cursor durable `thin_events`, re-sync vía Accounts API
   (mismo camino que el webhook thin). No confía en el body listado como estado.
2. **Fees / multi connected accounts** — compare de BT `application_fee` /
   `application_fee_refund` contra fee local; worker de conciliación importa y
   compara también cuentas `acct_*` (acotado).

## Fuera de alcance

`LIVE_COMMERCE_ENABLED`, recovery thin en vivo founder (sigue checklist R5),
UI creador de neto, remap de cuentas, fees multi-partido complejos.

## STOP

Código + mocks PASS. Reensayo CLI founder sigue OPEN.

## Cierre IMPLEMENT

Migración 032 (`thin_events` cursor). `listEvents` en thin port +
`recoverMissedThinEvents`. Compare `application_fee` / `application_fee_refund`.
Worker `processExternalReconciliation` barre hasta 10 `acct_*`. Tests en
`tests/stripe-reconciliation.test.ts`.

**Nota 2026-09-10:** `GET /v2/core/events` exige `created[gte]` en **RFC 3339**
(ISO), no unix seconds. El adaptador thin convierte el unix interno del cursor
antes de llamar a Stripe.
