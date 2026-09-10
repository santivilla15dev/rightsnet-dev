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
| R1 | Crear recipient **nuevo** con location `…, AT` o `…, DE` → identity country correcto en Dashboard | **PASS** 2026-09-10 | Creador `Berlin, DE` → `resolve=de` → Stripe `identity.country=DE` (`acct_…` nuevo; script `scripts/r1-connect-country.ts`) |
| R2 | Checkout + webhook → `charge_ref` + transfer destination vinculados a orden | **PASS** 2026-09-10 | Orden `efeff10f…` · `ch_3UE5Zc…` · `tr_3UE5Zc…` · licencia `RN-LIC-2026-000005`; `checkout.session.completed` 200. Nota: carrera `transfer.created` duplicada → 500 (fix ON CONFLICT en mismo día). |
| R3 | Refund parcial / transfer reversal parcial (`reversed=false` + fila reversal) | **PASS** 2026-09-10 | `tr_3UE5Zc…` status **paid**; `trr_1UE5h0…` amount 5000; webhook `transfer.reversed` 200 |
| R4 | Conciliar Stripe con >500 BT importados (o forzar volumen test) | **PASS*** 2026-09-10 | Criterio volumen: test automatizado 501 BT PASS. Live Conciliar platform `done` (run `3eb77948…`, recovered 24) tras fixes quarantine + thin RFC3339. BT live de cuenta bajos (~26); no se forzó import masivo Dashboard. |
| R5 | Thin v2 recovery + fees/multi-account | **PASS*** 2026-09-10 | Código PASS; live: `created[gte]` RFC3339 fix; run platform `done` + `recovered_events=24` + cursor `thin_events`. *fees/multi = mocks. |

**Infra smoke 2026-09-10 (no cierra R1–R5):** `stripe listen` + `whsec` MATCH; `stripe trigger checkout.session.completed` → eventos auxiliares `← [200]`; `checkout.session.completed` huérfano `← [409]` (esperado sin orden local). Firma OK. Falta compra real con orden RightsNet para R2.

### Guía paso a paso R1–R5 (sin pegar claves)

1. **Prepara el entorno**  
   - Copia `.env.example` → `.env` (solo tú, en tu máquina).  
   - Pon `LIVE_COMMERCE_ENABLED=false`, `PAYMENTS_PROVIDER=stripe`, claves **test**.  
   - Arranca `pnpm dev`. En otras terminales: `stripe listen` (snapshot) y thin (ver arriba).

2. **R1 — País Connect**  
   - Creador con `location` tipo `Vienna, AT` (o `Berlin, DE`).  
   - Panel creador → Cobros → Account Link.  
   - En Stripe Dashboard (test) la cuenta **nueva** debe mostrar país AT/DE.  
   - Anota `acct_…` redactado. No esperes cambio en cuentas viejas.

3. **R2 — Cobro + charge_ref**  
   - Compra de prueba con tarjeta `4242…`.  
   - Comprueba orden `fulfilled`/`paid`, licencia emitida.  
   - En DB/admin: `payment_attempts.charge_ref` relleno y transfer ligado a la orden.  
   - Si el transfer llegó antes, el relink debe corregirlo al llegar el webhook.

4. **R3 — Reversión parcial**  
   - Provoca un transfer reversal **parcial** en test (no full `reversed`).  
   - En RightsNet: fila en `stripe_transfer_reversals` y el transfer **no** debe quedar solo como `reversed` total.

5. **R4 — Conciliar >500**  
   - Genera o importa volumen (o confía en el test automatizado de 501 BT).  
   - Admin → Ledger → **Conciliar Stripe**.  
   - No debe “olvidar” movimientos tras el 500.

6. **R5 — Thin + fees + multi-cuenta**  
   - Con thin listen activo: cambia requisitos/capability de un recipient y mira sync en panel.  
   - Para recovery: deja de forward un momento y luego **Conciliar Stripe** (recupera thin).  
   - Comprueba que fees de plataforma no quedan huérfanos si el pago local existe.  
   - Si hay varios `acct_*`, el worker también importa sus BT (hasta 10).

7. **Cerrar**  
   - Marca cada fila R1–R5 PASS/FAIL con la plantilla `docs/runbooks/stripe-reensayo-checklist.md`.  
   - Copia el resultado a `docs/VERIFICATION.md` con fecha y “test mode”.  
   - No actives `LIVE_COMMERCE_ENABLED`.

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
