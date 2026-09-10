# Stripe money/recon gaps v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT parcial (cierre abajo).

## Contexto

Ensayo Stripe **modo test** del 6 sep 2026: PASS en checklist. Tras correcciones
posteriores (paginación, matching, refunds) hace falta **reensayo founder** con
CLI/keys. Además quedan gaps de money/recon que el ensayo no acreditó.

## Gaps

| Gap | Esta entrega |
|-----|----------------|
| Compare limitada a 500 BT | **Cerrado**: paginar compare por offset |
| Reversión parcial de transfers | **Parcial**: registrar reversals aunque `reversed=false`; solo marcar `reversed` si Stripe dice fully reversed |
| Asociación tardía transfer↔charge_ref | **Cerrado**: `relinkOrphanTransfersForCharge` al persistir `charge_ref` |
| Thin v2 recovery paginada | Abierto (Hito aparte) |
| Fees / multi connected accounts | Abierto (Hito aparte) |
| Reensayo founder CLI | Checklist en runbook; **no** PASS automático |

## Fuera de alcance

`LIVE_COMMERCE_ENABLED`, APP_ENV=production, afirmar piloto legal.

## STOP

Código + mocks PASS para gaps cerrados. Reensayo externo OPEN hasta que el founder
marque el checklist R1–R5 en `docs/runbooks/stripe-test-mode.md`.

## Cierre IMPLEMENT (parcial)

- `compareExternalLedger` pagina OFFSET/LIMIT 500.
- `upsertTransferReversal` registra reversals parciales; `status=reversed` solo si
  Stripe `reversed=true`.
- `relinkOrphanTransfersForCharge` tras persistir `charge_ref` en checkout webhook.
- Tests: `stripe-reconciliation` (>500), `stripe-money` (parcial + relink).
- Abierto: thin v2 recovery paginada; fees/multi-account; reensayo CLI.
