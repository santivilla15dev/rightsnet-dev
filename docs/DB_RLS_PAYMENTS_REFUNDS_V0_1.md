# DB RLS payment attempts + refunds v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`orders` / ledger / outbox ya tienen FORCE, pero `payment_attempts` y
`refunds` no. Un actor RLS podría ver intentos de pago o reembolsos de
otra org si el filtro de aplicación fallara.

## Alcance v0.1

Migración `040_rls_payments_refunds.sql`:

| Tabla | Visibilidad |
|-------|-------------|
| `payment_attempts` | vía `orders` (org member **o** creador del asset) |
| `refunds` | idem vía `order_id` |

Bypass/admin vía helpers → checkout, webhooks y worker con pool default
siguen OK.

## Fuera de alcance

FORCE en `provider_events`, `contract_acceptances`, Stripe transfer tables.
`DB_RLS_BYPASS_DEFAULT=false`.

## STOP

Policies + test `rightsnet_app` PASS; tests checkout/refunds no regresan.

## Cierre IMPLEMENT

Migración `040_rls_payments_refunds.sql`. `db-rls` 7/7 + stripe
checkout/refunds PASS. Pool bypass intacto.
