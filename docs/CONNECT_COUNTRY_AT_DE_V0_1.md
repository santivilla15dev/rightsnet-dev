# Connect country AT/DE v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT PASS (cierre abajo).

## Alcance

Al crear una cuenta Stripe Connect (Accounts v2 recipient), el país de identidad
deja de estar fijado a `es`. Solo afecta **cuentas nuevas**; no reescribe cuentas
ya creadas en Stripe.

Resolución (orden):

1. Sufijo ISO de `creators.location` si es `AT`/`DE`/`ES` (p. ej. `Vienna, AT` → `at`).
2. Si no, `CONNECT_DEFAULT_COUNTRY` (default **`at`**).
3. Allowlist estricta: `at` | `de` | `es` (ES solo legacy).

No habilita live commerce. No afirma clearance legal. Connect platform setup
sigue siendo responsabilidad del founder en Dashboard test.

## STOP

Sin columna `creators.country` dedicada (sigue location texto). Sin remap de
cuentas Stripe existentes. Sin cambiar currency (EUR).

## Cierre IMPLEMENT

`resolveConnectCountry` + `CONNECT_DEFAULT_COUNTRY`; onboarding usa identity
country resuelto. Tests `tests/stripe-connect.test.ts`. Runbook actualizado.
