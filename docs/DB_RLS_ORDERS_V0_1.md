# DB RLS orders chain v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`licenses` ya tiene FORCE y mira `orders`, pero `requests` / `quotes` /
`orders` siguen sin FORCE. Un actor RLS podría filtrar mal y ver pedidos
de otra org. Además, si solo forzamos `orders` sin alinear visibilidad
con licenses (org **o** creador del asset), las policies de licenses
podrían dejar de ver la fila `orders` en el `EXISTS`.

## Alcance v0.1

Migración `038_rls_orders_chain.sql`:

| Tabla | Visibilidad |
|-------|-------------|
| `requests` | miembro de `organization_id` **o** creador del `asset_id` |
| `quotes` | vía `requests` (misma regla) |
| `orders` | miembro de `organization_id` **o** creador del `asset_id` |

Bypass/admin vía `app_is_org_member` / `app_rls_bypass` → worker, checkout
y seed con pool default siguen OK.

## Fuera de alcance

FORCE en `payment_attempts`, `outbox`, `journals` / `ledger_entries`,
`refunds`, `contract_acceptances`. `DB_RLS_BYPASS_DEFAULT=false`.

## STOP

Policies + test `rightsnet_app` PASS; tests de checkout/licenses no regresan.

## Cierre IMPLEMENT

Migración `038_rls_orders_chain.sql`. `db-rls` 5/5 + rights-core /
checkout focalizados PASS. Pool bypass intacto.
