# Ensayo Stripe test real (paso 6)

Objetivo: probar movimientos simulados en **modo test** de Stripe (sin dinero real).

La tabla inferior conserva el ensayo previo de Cursor. Después de la revisión de paginación/refunds, repetir los casos afectados; no considerar el checklist anterior como validación de esos cambios. Checkout usa ahora métodos configurados en Dashboard: probar async si se habilita.  
`LIVE_COMMERCE_ENABLED` debe seguir en `false`. No pegues claves en el chat.

## Qué necesitas antes

1. Cuenta Stripe en **Test mode**.
2. Clave secreta de test (`sk_test_…` o `rk_test_…`).
3. Webhook signing secret de test (`whsec_…`) — snapshot y/o thin.
4. Stripe CLI instalado (en este Mac: `/opt/homebrew/bin/stripe`).
5. Plataforma Connect en test (modelo **marketplace**: Cliente → Tú → Destinatario) y un recipient con capability de cobros activa.
   Si ves `CONNECT_PLATFORM_REQUIRED` / `non_connect_platform_accounts_v2_access_blocked`:
   en Dashboard test abre [Connect platform setup](https://dashboard.stripe.com/test/settings/connect/platform-setup)
   (o **Connect → Get started / Configurar plataforma**) y completa el alta. Sin eso, Accounts v2 no deja crear `acct_`.
6. Identidad de cuentas Connect nuevas: país desde `creators.location` (sufijo `AT`/`DE`/`ES`)
   o `CONNECT_DEFAULT_COUNTRY` (default **`at`**); moneda **EUR**. No reescribe cuentas ya creadas.
   Ver `docs/CONNECT_COUNTRY_AT_DE_V0_1.md`.

## Configuración local (tú la haces; no se versiona)

```bash
cp .env.example .env
chmod 600 .env
```

En `.env`:

```bash
APP_ENV=sandbox
LIVE_COMMERCE_ENABLED=false
AUTH_PROVIDER=sandbox
PAYMENTS_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_…          # solo test
STRIPE_WEBHOOK_SECRET=whsec_…       # snapshot listen
CONNECT_DEFAULT_COUNTRY=at          # opcional; at|de|es
# Opcional; si falta, se reutiliza STRIPE_WEBHOOK_SECRET:
STRIPE_THIN_WEBHOOK_SECRET=whsec_…
WEB_URL=http://localhost:3000
API_URL=http://127.0.0.1:4000
```

Reinicia `pnpm dev` después de guardar.

## Webhooks hacia tu API local

Hacen falta **dos** forwards: snapshot (Checkout/refunds/money) y thin (Accounts v2).

### Snapshot (obligatorio para cobros)

```bash
stripe login
stripe listen --forward-to http://127.0.0.1:4000/v1/webhooks/stripe
```

Copia el `whsec_…` a `STRIPE_WEBHOOK_SECRET` y reinicia la API.

Si `stripe listen` muestra `← [400]` en todos los eventos, la firma falla casi siempre porque el body JSON se parseó sin conservar bytes crudos (`req.rawBody`). La API debe montar `express.json` con `verify` que guarde `rawBody` (ver `apps/api/src/main.ts`). Tras corregirlo, reinicia solo la API (`pnpm api`) y comprueba un `← [200]`.

Los eventos pueden llegar igual a `provider_events` vía **Conciliar Stripe** (recuperación por Events API); eso no sustituye webhooks sanos en producción.

Si **Conciliar Stripe** no importa cargos nuevos y deja `missing_balance_transaction`, el cursor antiguo solo avanzaba hacia el pasado (`starting_after`). El import usa watermark `created[gte]` hacia adelante; reinicia la API tras actualizar código y vuelve a conciliar.

### Thin Accounts v2 (requisitos / capability)

En otra terminal (o el mismo CLI si combinas flags):

```bash
stripe listen \
  --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated' \
  --forward-thin-to http://127.0.0.1:4000/v1/webhooks/stripe/thin
```

Si el CLI imprime otro `whsec_…`, guárdalo en `STRIPE_THIN_WEBHOOK_SECRET` (si no, se usa el de snapshot).

El handler thin hace `parseEventNotification` → `v2.core.events.retrieve` → sync de cuenta vía Accounts API (nunca confía en el body thin como snapshot).

## Checklist del ensayo (marcar y anotar IDs redactados)

| # | Caso | Resultado | IDs (redactados) |
|---|---|---|---|
| 0 | Platform setup marketplace completado | PASS | — |
| 1 | Creador completa Connect onboarding (Account Link test) | PASS | `acct_1UClG2…` |
| 1b | Thin requirements/capability sincroniza panel creador | PASS | thin evt |
| 2 | Checkout pagado con tarjeta test `4242…` | PASS | `cs_test_…` / `pi_3UClNM…` |
| 3 | Webhook `checkout.session.completed` → orden paid → licencia | PASS | `evt_1UClNO…` (recovery + luego firma 200) |
| 4 | Reenviar el mismo evento (idempotente, sin doble cobro/ledger) | PASS | `stripe events resend` → `← [200]`; `provider_events` y journals sin duplicar |
| 5 | Entregar eventos desordenados / retraso | PASS | `stripe events resend` post-flujo (p. ej. `charge.succeeded`); `provider_events`/journals sin duplicar |
| 6 | Fallo asíncrono de pago (si aplica al método) | N/A MVP | Checkout card síncrono; async no usado |
| 7 | Expirar sesión Checkout sin pagar | PASS | Orden `7295138c…` · `cs_test_a1Pfx…` → intento `expired`; 0 licencias; webhook `checkout.session.expired` 200 |
| 8 | Refund total con `reverse_transfer` + fee | PASS | `re_3UClNM…` · orden `refunded` · licencia `issued` |
| 9 | Payout de prueba en cuenta connected (sin `order_id`) | PASS | Nuevo pago `21884812…` + fondeo available; `po_1UCmK1…` en `acct_1UClG2…`; `payout_records` **sin** `order_id` |
| 10 | Admin → Ledger → **Conciliar Stripe** → 0 diferencias críticas | PASS* | Run `96261f8d…`; críticas 0; avisos no críticos ack (CLI / funding auxiliar) |
| — | Disputa EUR ligada a orden viva | PASS | Orden `18caba7b…` · tarjeta `…0259` · `du_1UCn0k…`; licencia `issued`; admin review → `acknowledged`, sin revocar |

\* Críticas: 0. Avisos no críticos (BT huérfanos de CLI trigger / cargos de fondeo auxiliar) se acusan al cerrar el ensayo.

## Reensayo post-corrección (OPEN — founder)

Tras gaps money/recon (`docs/STRIPE_MONEY_RECON_GAPS_V0_1.md`) y Connect country AT/DE.
No marcar PASS hasta completar contra Dashboard/CLI. `LIVE_COMMERCE_ENABLED=false`.

| # | Caso | Resultado | Notas |
|---|---|---|---|
| R1 | Crear recipient **nuevo** con location `…, AT` o `…, DE` → identity country correcto en Dashboard | OPEN | No reescribe `acct_` antiguos |
| R2 | Checkout + webhook → `charge_ref` + transfer destination vinculados a orden | OPEN | Relink tardío si transfer llega antes |
| R3 | Refund parcial / transfer reversal parcial (`reversed=false` + fila reversal) | OPEN | Status transfer no debe ser `reversed` completo |
| R4 | Conciliar Stripe con >500 BT importados (o forzar volumen test) | OPEN | Compare paginado |
| R5 | Thin v2 recovery + fees/multi-account | OPEN | Sigue gap aparte |

## Dónde mirar en RightsNet

- **Panel creador → Cobros:** transfers, requisitos, listo para recibir, CTA Account Link.
- **Admin → Pagos y licencias:** estados de orden y refund.
- **Admin → Transfer / disputa / payout:** dinero Connect.
- **Admin → Ledger:**
  - **Conciliar ledger** = solo nuestro cuaderno (débitos = créditos).
  - **Conciliar Stripe** = extracto Stripe + cola de diferencias.

## Qué no hacer

- No uses `sk_live_` / `pk_live_`.
- No pongas `LIVE_COMMERCE_ENABLED=true`.
- No pegues secretos, Account Links ni datos KYC en issues/chat.
- No declares el paso 6 “PASS” sin haber corrido la tabla de arriba contra Dashboard/CLI (cerrado 6 sep 2026 en modo test; ver `docs/VERIFICATION.md`).
- No hace falta Supabase para este ensayo (`AUTH_PROVIDER=sandbox`).

## Evidencia mínima al cerrar

Actualizar `docs/VERIFICATION.md` con fecha, “PASS/FAIL” por fila del checklist y nota de que fue **test mode**. Guardar capturas locales fuera de Git si contienen IDs sensibles.
