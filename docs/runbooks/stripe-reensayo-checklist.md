# Checklist para marcar R1–R5 (reensayo Stripe test)

Úsalo mientras pruebas. **No pegues claves** (`sk_`, `whsec_`, Account Links).
`LIVE_COMMERCE_ENABLED=false`. Guía detallada: `docs/runbooks/stripe-test-mode.md`.

Copia la tabla a `docs/VERIFICATION.md` cuando cierres (fecha + “test mode”).

| # | ¿Qué hice? | PASS/FAIL | IDs redactados / notas |
|---|------------|-----------|-------------------------|
| R1 | Account Link con location `…, AT` o `…, DE` → país correcto en Dashboard |  | `acct_…` |
| R2 | Checkout test + webhook → `charge_ref` + transfer a la orden |  | `cs_…` / `ch_…` |
| R3 | Reversal parcial → fila reversal y transfer no “fully reversed” |  | `tr_…` / `trr_…` |
| R4 | Conciliar Stripe con volumen / >500 BT |  | run id |
| R5 | Thin sync/recovery + fee no huérfano + (opcional) 2ª `acct_*` |  | thin evt |

Firmado (founder): __________ Fecha: __________
