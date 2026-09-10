# DB RLS Stripe money tables v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

El commerce core ya tiene FORCE; quedan tablas de dinero Connect /
reconciliación sin RLS: transfers, reversals, disputes, payouts, balance
BT y cursores/runs de recon.

## Alcance v0.1

Migración `042_rls_stripe_money.sql` + helpers:

| Tabla | Visibilidad |
|-------|-------------|
| `stripe_transfers` | bypass/admin **o** `app_can_see_order(order_id)` **o** `app_owns_connected_account(connected_account_ref)` |
| `stripe_transfer_reversals` | vía transfer padre |
| `disputes` | bypass/admin **o** `app_can_see_order(order_id)` (sin order → solo sistema) |
| `payout_records` | bypass/admin **o** dueño del `connected_account_ref` |
| `stripe_balance_transactions` | bypass/admin **o** dueño de `account_ref` (no `platform`) |
| `reconciliation_*` | solo bypass/admin |

## Fuera de alcance

`DB_RLS_BYPASS_DEFAULT=false`. Cableado `withRlsActor` en money UI.

## STOP

Policies + test `rightsnet_app` PASS; tests stripe-money/recon no regresan.

## Cierre IMPLEMENT

Migración `042_rls_stripe_money.sql` + helpers `app_can_see_order` /
`app_owns_connected_account`. `db-rls` 9/9 + stripe-money/recon PASS.
