# DB RLS ledger + outbox v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

La cadena de compra (`orders`) ya tiene FORCE, pero el rastro financiero
(`journals` / `ledger_entries`) y la cola `outbox` no. Un actor RLS podría
leer asientos o jobs de otra org si el filtro de aplicación fallara.

## Alcance v0.1

Migración `039_rls_ledger_outbox.sql`:

| Tabla | Visibilidad |
|-------|-------------|
| `outbox` | vía `orders` (org member **o** creador del asset) |
| `journals` | idem vía `order_id` |
| `ledger_entries` | vía `journals` → `orders` (misma regla) |

Bypass/admin vía helpers existentes → worker outbox, seed y checkout con
pool default siguen OK. El trigger de balance de journal sigue viendo
filas bajo bypass de sesión.

## Fuera de alcance

FORCE en `payment_attempts`, `refunds`, `provider_events`,
`contract_acceptances`. `DB_RLS_BYPASS_DEFAULT=false`.

## STOP

Policies + test `rightsnet_app` PASS; tests money/checkout no regresan.

## Cierre IMPLEMENT

Migración `039_rls_ledger_outbox.sql`. `db-rls` 6/6 + stripe
checkout/money/refunds PASS. Pool bypass intacto.
