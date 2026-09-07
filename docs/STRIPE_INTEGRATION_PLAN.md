# RightsNet — plan de integración Stripe

Fecha: 2026-09-06. Alcance: MVP exclusivamente test. Producción y comercio real bloqueados. Estado: implementación de pasos 1–5 y ensayo test previo documentados por Cursor; revisión posterior y correcciones descritas al final. Los límites detectados impiden equiparar el ensayo previo con una conciliación completa.

## Procedencia y conexión comprobada

La instalación del plugin fue correcta. Tras completar OAuth se invocó realmente `stripe_implementation_planner` en la cuenta RightsNet, `livemode=false`, sin crear cobros. Guía `iguide_61VM6AgsBMYNGfRVL41PvfIhIOx1O`.

- [Respuesta original del árbol](stripe-planner-decision-tree.json): contiene preguntas, opciones y enlaces para Connect, dashboard, responsabilidades, capacidades y monetización.
- [Respuesta accepted original](stripe-planner-accepted.json): estado `accepted`; `integration_shape={checkout_type:hosted,provider:checkout_studio,origin_context:web}`. Sus `decision_trees` y `use_cases` están vacíos. **No es una validación integral de Connect ni del código.**
- Selección enviada: marketplace de dos lados con comisión por transacción; destination charges; fees/losses application; dashboard express y login links; recipient v2 con stripe_transfers activo; sin suscripción; Checkout alojado. País y entidad de producción quedaron pendientes, sin inventar elegibilidad transfronteriza.
- Las decisiones de Connect proceden del árbol original y de sus enlaces, por ejemplo [destination charges del marketplace](https://docs.stripe.com/connect/marketplace/tasks/accept-payment/destination-charges) y [creación de cuentas](https://docs.stripe.com/connect/marketplace/tasks/create). La respuesta accepted solo confirma la forma de Checkout indicada arriba.
- Diferencias explícitas: el árbol recomienda Platform Pricing Tool, mientras este MVP mantiene `application_fee_amount` exacto del snapshot contractual; recomienda onboarding/componentes embebidos, mientras la entrega actual usa Account Links alojados. Notification banner/gestión embebida siguen pendientes. No se habilitó ningún producto de pago adicional.

La auditoría preliminar anterior al OAuth y el fallback de skills no se presentan como resultados del planner.

## Decisiones del MVP contrastadas con el árbol, con límites operativos pendientes

- Un comprador, un creador, una campaña, una orden; EUR y paquetes de 30/90 días. Comisión provisional 15% congelada en el precio de la orden. Sin suscripciones, voz, entrenamiento ni royalties de consumo.
- Checkout alojado, `mode=payment`, destination charges y `application_fee_amount`. Los métodos se configuran en Dashboard. El retorno del navegador nunca confirma el pago.
- La transferencia de destination charges ocurre al cobrar; no es escrow ni una liberación de fondos posterior a la licencia. El coste Stripe y las pérdidas de la plataforma deben contabilizarse aparte del 15% bruto. Modelo contractual, fiscalidad y responsabilidad comercial requieren aprobación antes de live; no se añade `on_behalf_of` por suposición.
- Nuevas cuentas Connect: Accounts v2, configuración recipient con stripe_transfers; dashboard express; responsabilidades fees/losses application. Onboarding alojado mediante Account Links, estado de capability consultado al pagar. KYC de Stripe no sustituye adultez, consentimiento ni titularidad de RightsNet. Prever notification_banner y gestión/remediación en el panel del creador.
- Credenciales únicamente test, firma con raw body y rechazo de eventos live. Idempotencia persistida, bloqueo por orden, eventos durables y worker de emisión/ledger. Ningún webhook de pago incompleto emite certificados.
- Refund económico separado del estado jurídico de licencia. Reembolso total en MVP; no registrar éxito hasta confirmación del proveedor. Reversión de transferencia y devolución de application fee deben conciliarse.

## Paso 1 — Checkout y eventos (acreditado localmente)

Implementación en:

- [`packages/db/migrations/005_stripe_attempt_snapshot.sql`](../packages/db/migrations/005_stripe_attempt_snapshot.sql) — `stripe_request` y `payment_intent_ref` inmutables
- [`apps/api/src/modules/stripe-checkout.ts`](../apps/api/src/modules/stripe-checkout.ts) — precondiciones, snapshot, sesión reutilizable, idempotency key
- [`apps/api/src/modules/stripe-events.ts`](../apps/api/src/modules/stripe-events.ts) — lifecycle, validación contra snapshot, mismatches permanentes auditados (2xx), gaps reintentables (409)
- [`apps/api/src/integrations/stripe.ts`](../apps/api/src/integrations/stripe.ts) — cliente test-only + puerto inyectable para tests
- Worker monotónico en [`apps/api/src/modules/payments.ts`](../apps/api/src/modules/payments.ts)

Evidencia: `pnpm test` — `tests/stripe-events.test.ts` (15) y `tests/stripe-checkout.test.ts` (7) con proveedor mockeado. **No** sustituye un ensayo contra Dashboard Stripe con claves reales.

## Paso 2 — Connect onboarding (acreditado localmente)

Implementación en:

- [`packages/db/migrations/006_connect_accounts.sql`](../packages/db/migrations/006_connect_accounts.sql) — cuentas por creador/entorno; sin URLs de Account Link
- [`apps/api/src/modules/stripe-connect.ts`](../apps/api/src/modules/stripe-connect.ts) — Accounts v2 recipient, Account Links, sync de capability, eventos thin
- Endpoints `GET /v1/creator/connect` y `POST /v1/creator/connect/onboarding-link`
- Panel creador: paso 4 de cobros / remediación
- Puerto Connect inyectable en [`apps/api/src/integrations/stripe.ts`](../apps/api/src/integrations/stripe.ts)

Configuración: `dashboard=express`, `fees_collector=application`, `losses_collector=application`, capability `stripe_transfers`. País de identidad prefijado `es` para los fixtures test; no acredita la jurisdicción de un piloto. KYC de Stripe no sustituye adultez/consentimiento RightsNet.

Evidencia: `tests/stripe-connect.test.ts` (6). Ensayo Dashboard real sigue pendiente.

## Paso 3 — Refunds / reversals (acreditado localmente)

Implementación en:

- [`packages/db/migrations/007_stripe_refunds.sql`](../packages/db/migrations/007_stripe_refunds.sql) — refs inmutables, estados requested/pending/succeeded/failed
- [`apps/api/src/modules/stripe-refunds.ts`](../apps/api/src/modules/stripe-refunds.ts) — solicitud durable, worker con `reverse_transfer` + `refund_application_fee`, webhooks, bloqueo de emisión
- Admin `POST /v1/admin/orders/:id/refund` unificado (sandbox síncrono / Stripe asíncrono)
- Worker ejecuta `processStripeRefunds` antes de emitir licencias

La licencia emitida no se revoca automáticamente al reembolsar (gestión jurídica aparte). Solo reembolsos totales EUR.

Evidencia: `tests/stripe-refunds.test.ts` (4).

## Paso 4 — Transferencias, disputas y payouts (acreditado localmente)

Implementación en:

- [`packages/db/migrations/008_transfers_disputes_payouts.sql`](../packages/db/migrations/008_transfers_disputes_payouts.sql)
- [`apps/api/src/modules/stripe-money.ts`](../apps/api/src/modules/stripe-money.ts)
- Admin: pestaña dinero + `POST /v1/admin/disputes/:id/review`
- Panel creador: separa pagado / transferido / payout bancario

Reglas: payouts **sin** `order_id`; disputa → `paid_requires_review` + incidencia, **sin** revocar licencia; transferencias recuperadas de forma autoritativa (no confiar en el body thin del evento).

Evidencia: `tests/stripe-money.test.ts` (4).

## Paso 5 — Conciliación externa (acreditado localmente)

Implementación en:

- [`packages/db/migrations/009_external_reconciliation.sql`](../packages/db/migrations/009_external_reconciliation.sql)
- [`apps/api/src/modules/stripe-reconciliation.ts`](../apps/api/src/modules/stripe-reconciliation.ts)
- Worker: `processExternalReconciliation` (cada ~5 min, no desde el GET de ledger)
- Admin: `GET/POST /v1/admin/reconciliation/external`, `POST .../differences/:id/ack`

Reglas: ID único `provider_ref + account_ref + environment`; cursor durable; fees/neto reales; cola de diferencias; recuperación de eventos vía Events API; **GET reconciliation interno no importa Stripe**.

Evidencia: `tests/stripe-reconciliation.test.ts`.

## Orden de implementación y aceptación

1. **Checkout y eventos de pago:** **HECHO (local).**
2. **Connect onboarding:** **HECHO (local).**
3. **Refunds/reversals:** **HECHO (local).**
4. **Transferencias, disputas y payouts:** **HECHO (local).** Transfer/reversal/dispute/payout registrados; payout agregado sin orden; disputa con revisión humana; licencia intacta.
5. **Conciliación externa:** **HECHO (local).** Balance transactions paginadas + cursor; comparación con journals/pagos/refunds/transfers/payouts; diferencias y ack; recuperación de webhooks; separado del control de equilibrio interno.
6. **Ensayo Stripe test real:** **ENSAYO PREVIO documentado por Cursor (test mode); correcciones posteriores pendientes de reensayo.** Checklist 0–10 + disputa EUR en [`docs/runbooks/stripe-test-mode.md`](../runbooks/stripe-test-mode.md) y evidencia en [`docs/VERIFICATION.md`](../VERIFICATION.md). Live / `LIVE_COMMERCE_ENABLED` sigue **NO HABILITADO**.

## Configuración pendiente y mecanismo seguro

OAuth MCP comprobado en esta tarea. Es independiente de las credenciales de la aplicación. No pegar secretos en chat. Configurar localmente `STRIPE_SECRET_KEY` test y `STRIPE_WEBHOOK_SECRET` en el entorno privado del proceso (o `.env` excluido de control de versiones con permisos 0600). `PAYMENTS_PROVIDER=stripe`, `APP_ENV=sandbox`, `LIVE_COMMERCE_ENABLED=false`; URL web local y destino webhook `/v1/webhooks/stripe`. Hacen falta una plataforma Connect test y cuenta recipient test con capability activa. No crear cuentas live ni inventar entidad/país legal.

Permisos mínimos: Checkout Sessions, PaymentIntents, Refunds, Transfers, Balance Transactions, Events, Accounts v2, Payouts (lectura según caso). Preferir restricted test key; el código admite `sk_test_` y `rk_test_`. No compartir logs con claves, enlaces efímeros o KYC.

## Fuentes

- [Checkout y fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Destination charges](https://docs.stripe.com/connect/destination-charges)
- [Expiración de Checkout](https://docs.stripe.com/api/checkout/sessions/expire)
- [Accounts v2](https://docs.stripe.com/connect/accounts-v2)
- Skills oficiales instalados en `.agents/skills/stripe-best-practices`.

## Verificación de esta entrega (pasos 1–5 + Connect thin/UI)

- `pnpm test` — incluye casos Stripe checkout/connect/refunds/money/reconciliation (+ thin Connect)
- `pnpm typecheck` y `pnpm lint` verdes
- Thin destination: `POST /v1/webhooks/stripe/thin`; UI creador con estado transfers/requisitos
- Paso 6: ensayo previo de Cursor documentado; reensayo de las correcciones posteriores pendiente. Live sigue bloqueado por gates.

## Revisión de los cambios posteriores de Cursor

No hay repositorio Git en esta carpeta: se comparó con el código leído anteriormente, el plan, las migraciones y las pruebas actuales; no se puede atribuir cada línea a una herramienta. Se conservaron onboarding, refunds, money, thin webhooks, UI y evidencias del ensayo. Baseline reproducido: 70 tests locales PASS.

Correcciones de esta revisión:

1. Paginación compartida y durable (`stripe-pagination.ts`, migración 011): watermark de lote completo separado de página pendiente. Retoma lotes mayores que el límite; empieza desde los eventos nuevos en cada barrido; no avanza ante error; serializa scans del mismo ámbito mediante advisory lock. Events v1 ya no solicita tipos v2 thin.
2. Conciliación por IDs de proveedor: se elimina matching por importe de cargos y refunds, incluido el escaneo inverso. Un cargo ajeno del mismo precio queda como diferencia; no oculta una orden sin movimiento importado.
3. Refunds consultan el objeto actual antes de aplicar webhook y validan identidad del refund/PaymentIntent/charge. Rechazan scope connected para cargos de plataforma. No crean un journal de reversión de transferencia inexistente; las tablas de movimientos externos se conservan.
4. Checkout deja de prefijar `buyer@example.test` y `payment_method_types=['card']`; el Dashboard controla métodos, EUR y snapshots siguen fijados. Las sesiones existentes conservan sus parámetros inmutables.

Límites aún abiertos (no cerrados por un resultado verde del ensayo previo):

- Reensayar las correcciones con Stripe test; probar realmente los métodos asíncronos si se habilitan en Dashboard. El ensayo previo usó tarjeta y no acredita async.
- Conciliación completa: el comparador actual revisa los últimos 500 movimientos; el worker programa plataforma, no todas las connected accounts. Faltan contabilización integral de fees/transferencias y asociación de application-fee refunds, y recuperación v2 thin paginada. Acknowledged no equivale a resolver una diferencia.
- Transfer/reversal: cubrir reversión parcial y paginación de `reversals`; re-vincular transferencias que llegaron antes de persistir charge_ref. El resumen del creador suma bruto y necesita separar fee/reversión antes de presentarlo como saldo neto disponible.
- Onboarding sigue con país test fijado; definir país real por creador, responsabilidad/entidad y estrategia durable de reintento de creación antes de piloto.
- No reparar journals históricos de forma destructiva. Los marcadores de reversión antiguos requieren conciliación y un asiento corrector auditable si se confirma diferencia.

La siguiente entrega debe cerrar esos límites con casos adversos, antes de declarar terminada la operación de dinero. Live permanece bloqueado.
