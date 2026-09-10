# DB RLS provider events + contract acceptances v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

Quedan sin FORCE dos tablas del commerce: `contract_acceptances` (ligada
a pedido) y `provider_events` (buzón de webhooks sin `order_id`).

## Alcance v0.1

Migración `041_rls_provider_acceptances.sql`:

| Tabla | Visibilidad |
|-------|-------------|
| `contract_acceptances` | vía `orders` (org member **o** creador del asset) |
| `provider_events` | solo `app_rls_bypass()` o `app_is_admin()` (sin org) |

Bypass de pool → webhooks, worker y seed intactos.

## Fuera de alcance

FORCE en `stripe_transfers` / balance / disputes. `DB_RLS_BYPASS_DEFAULT=false`.

## STOP

Policies + test `rightsnet_app` PASS; tests stripe events/checkout no regresan.

## Cierre IMPLEMENT

Migración `041_rls_provider_acceptances.sql`. `db-rls` 8/8 + stripe
events/checkout PASS. Pool bypass intacto.
