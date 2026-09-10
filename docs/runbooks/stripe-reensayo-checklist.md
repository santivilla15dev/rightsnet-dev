# Checklist para marcar R1–R5 (reensayo Stripe test)

Úsalo mientras pruebas. **No pegues claves** (`sk_`, `whsec_`, Account Links).
`LIVE_COMMERCE_ENABLED=false`. Guía detallada: `docs/runbooks/stripe-test-mode.md`.

Copia la tabla a `docs/VERIFICATION.md` cuando cierres (fecha + “test mode”).

| # | ¿Qué hice? | PASS/FAIL | IDs redactados / notas |
|---|------------|-----------|-------------------------|
| R1 | Account Link con location `…, AT` o `…, DE` → país correcto en Dashboard | **PASS** | `Berlin, DE` → `identity.country=DE` |
| R2 | Checkout test + webhook → `charge_ref` + transfer a la orden | **PASS** | `efeff10f…` / `ch_…` / `tr_…` / `RN-LIC-2026-000005` |
| R3 | Reversal parcial → fila reversal y transfer no “fully reversed” | **PASS** | `tr_…` paid + `trr_…` 5000 |
| R4 | Conciliar Stripe con volumen / >500 BT | OPEN* | test >500 PASS; live BT bajos; Conciliar `done` OK |
| R5 | Thin sync/recovery + fee no huérfano + (opcional) 2ª `acct_*` | **PASS*** | thin recovery live `recovered_events=24`; fees = mocks |

Firmado (founder): __________ Fecha: __________
