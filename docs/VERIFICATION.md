# Verificación del MVP sandbox — 6 septiembre 2026

Historia: una marca elige un creador, configura el uso, obtiene una decisión determinista, acepta el contrato, simula el pago y recibe un certificado firmado; el creador y administración gestionan derechos, solicitudes y operaciones.

| Comprobación                                   | Resultado        | Evidencia                                                                                                                                   |
| ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript estricto web/API/worker/dominio     | PASS             | `pnpm typecheck`                                                                                                                            |
| ESLint                                         | PASS             | `pnpm lint`                                                                                                                                 |
| Pruebas dominio, PostgreSQL y adaptador Stripe | PASS             | `pnpm test` — 127 tests (dominio, rights-core, auth supabase, integración, Stripe)                                                          |
| Build optimizado Next.js 16.3.4                | PASS             | `pnpm build`                                                                                                                                |
| Navegador Chromium sobre build                 | 9 PASS           | `pnpm test:e2e` — home + commerce + matriz §28 (~24 s, stack :3010/:4010)                                                                   |
| Escritorio y móvil sin overflow                | PASS             | Capturas 1440px / 390px y comprobación DOM                                                                                                  |
| Stripe Checkout + webhooks (local)             | PASS             | Mocks: snapshot, idempotencia, lifecycle, race `provider_ref`, mismatch permanente, fallos antiguos, duplicados                             |
| Stripe Connect onboarding (local)              | PASS             | Mocks: Accounts v2 recipient, Account Links sin persistir URL, sync thin events, remediación `account_update`, thin requirements/capability |
| Stripe Refunds (local)                         | PASS             | Mocks: refund total con reverse_transfer/fee, pending→webhook, failed→review, bloqueo de emisión, licencia intacta                          |
| Stripe Money (local)                           | PASS             | Mocks: transfer vinculada, disputa sin revocar licencia, payout sin order_id, reversal idempotente                                          |
| Stripe conciliación externa (local)            | PASS             | Mocks: BT paginadas + cursor, fees/neto, cola de diferencias, recovery Events API, GET interno sin import                                   |
| Stripe externo (Dashboard / API keys)          | PASS (modo test) | Ensayo autenticado 6 sep 2026 — ver sección siguiente                                                                                       |
| Rights Core v0.1 motor puro                    | PASS             | `tests/rights-core-acceptance.test.ts` (matriz); `packages/domain/src/rights-core/`                                                         |
| Rights Core integración dual-path              | PASS             | `tests/rights-core-integration.test.ts` (8); migración `012`; seed Greta DE rights-policy                                                   |
| Auth Supabase v0.1 (sin MFA)                   | PASS             | `tests/supabase-auth.test.ts`; `docs/AUTH_SUPABASE_V0_1.md`; runbook `docs/runbooks/auth-supabase.md`                                       |
| Auth MFA v0.1 (TOTP)                           | PASS             | `MFA_ENABLED`; `docs/AUTH_MFA_V0_1.md`; `tests/supabase-mfa.test.ts`                                                                        |
| Home pública + E2E §28                         | PASS             | `/` bare shell; `pnpm test:e2e` **9 PASS**; `docs/HOME_AND_E2E_V0_1.md`                                                                     |
| Marketplace UX v0.1                            | PASS             | Home producto + pasos licencia; `docs/MARKETPLACE_UX_V0_1.md`                                                                               |
| Identity KYC v0.1.1                            | PASS             | Port sandbox/stripe + selfie matching; `docs/IDENTITY_KYC_V0_1.md`; tests `identity-kyc.test.ts`                                            |
| Identity KYC live v0.1                         | PASS             | `IDENTITY_LIVE_ENABLED`; `docs/IDENTITY_KYC_LIVE_V0_1.md`; livemode gated                                                                   |
| Live commerce L1 (técnico)                     | PASS             | `LIVE_COMMERCE_ENABLED`; `docs/LIVE_COMMERCE_V0_1.md`; CI flag off                                                                          |
| Creator publish Rights Core v0.1               | PASS             | Editor AT/DE en `/dashboard`; `docs/CREATOR_PUBLISH_RIGHTS_CORE_V0_1.md`                                                                    |
| Launch gates AT–DE                             | Documentado      | `docs/launch-gates.md` — gate técnico commerce PASS; legales pendientes                                                                     |
| Piloto live / APP_ENV=production               | NO HABILITADO    | Gates legales/ops pendientes; production sigue bloqueada                                                                                    |

## Identity KYC v0.1 (7 sep 2026)

| Entrega                            | Resultado | Evidencia                                               |
| ---------------------------------- | --------- | ------------------------------------------------------- |
| Spec `IDENTITY_KYC_V0_1`           | PASS      | `docs/IDENTITY_KYC_V0_1.md`                             |
| Migración `013_identity_checks`    | PASS      | refs proveedor, sin blobs de documento                  |
| Port sandbox + Stripe Identity     | PASS      | `apps/api/src/integrations/identity-kyc.ts`             |
| Session + webhook + simulate gated | PASS      | `identity-kyc` module; webhook en `/v1/webhooks/stripe` |
| Tests mocks                        | PASS      | `tests/identity-kyc.test.ts` (3)                        |
| MFA / live commerce                | NO        | STOP                                                    |

## Identity KYC v0.1.1 selfie (7 sep 2026)

| Entrega                                     | Resultado | Evidencia                                                   |
| ------------------------------------------- | --------- | ----------------------------------------------------------- |
| `require_matching_selfie` en create session | PASS      | `stripeIdentityCreateParams`                                |
| Copy UI documento + selfie                  | PASS      | `creator-dashboard.tsx`                                     |
| Sin blobs biométricos / live gated          | PASS      | STOP docs + `IDENTITY_LIVE_ENABLED` + `assertConfiguration` |
| MFA / live commerce                         | NO        | STOP                                                        |
| Identity live flag                          | PASS      | `docs/IDENTITY_KYC_LIVE_V0_1.md`                            |

## Identity KYC live v0.1

| Entrega                         | Resultado | Evidencia                        |
| ------------------------------- | --------- | -------------------------------- |
| Spec `IDENTITY_KYC_LIVE_V0_1`   | PASS      | `docs/IDENTITY_KYC_LIVE_V0_1.md` |
| `assertIdentityLivemodeAllowed` | PASS      | create + webhook                 |
| Flag off blocks livemode        | PASS      | `tests/identity-kyc.test.ts`     |
| MFA / live commerce             | NO        | Roadmap after STOP               |

## Live commerce L1 (gate técnico)

| Entrega                            | Resultado     | Evidencia                                                    |
| ---------------------------------- | ------------- | ------------------------------------------------------------ |
| Spec `LIVE_COMMERCE_V0_1`          | PASS          | `docs/LIVE_COMMERCE_V0_1.md`                                 |
| `assertLiveCommerceAllowed`        | PASS          | checkout/Connect/refunds/money/recon                         |
| Flag off blocks livemode           | PASS          | `tests/live-commerce.test.ts`, `tests/stripe-events.test.ts` |
| Flag on accepts livemode mock      | PASS          | sin red Stripe                                               |
| `GET /v1/config` → `live_commerce` | PASS          | `controllers.ts`                                             |
| `APP_ENV=production`               | Aún bloqueado | `assertConfiguration`                                        |
| Clearance legal AT–DE              | NO            | `docs/launch-gates.md`                                       |

**STOP.** CI mantiene `LIVE_COMMERCE_ENABLED=false`. Sin voz/agents/API pública. Sin afirmar piloto legal listo.

## Creator publish Rights Core v0.1 (7 sep 2026)

| Entrega                                       | Resultado | Evidencia                       |
| --------------------------------------------- | --------- | ------------------------------- |
| Editor AT/DE en `/dashboard`                  | PASS      | `creator-dashboard.tsx`         |
| Default policy cuando `RIGHTS_CORE_PURCHASES` | PASS      | `GET /v1/creator`               |
| Legacy ES editor intacto                      | PASS      | perfiles `rightsnet.policy/0.1` |
| Live / remap ES→AT                            | NO        | STOP                            |

**STOP (publish).** Remap ES→AT fuera de alcance. Live commerce: ver gate L1 en esta misma verificación.

## Rights Core v0.1 — motor puro (7 sep 2026)

Hito de implementación del motor determinista **sin** cablear compras ni migrar políticas ES→AT.

| Entrega                                                                                      | Resultado | Evidencia                                                              |
| -------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| Schemas Zod `rights-policy` / `license-request` / `license-decision` / `rights-passport` 0.1 | PASS      | `packages/domain/src/rights-core/schemas.ts`                           |
| Canonicalización + hash nuevos (legacy intacto)                                              | PASS      | `rightsCanonical` / `rightsHash`; `canonical`/`hash` legacy sin cambio |
| Evaluador puro + approvals + passport allowlist + issuance gate                              | PASS      | `evaluate.ts`, `approvals.ts`, `passport.ts`, `issuance.ts`            |
| Matriz de aceptación RIGHTS_CORE_V0_1                                                        | PASS      | 37 casos en `tests/rights-core-acceptance.test.ts`                     |

## Rights Core integración dual-path (7 sep 2026)

| Entrega                                                             | Resultado | Evidencia                                                        |
| ------------------------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| Migración 012 (INCOMPLETE, safety, approvals hashes, consent terms) | PASS      | `packages/db/migrations/012_rights_core_integration.sql`         |
| Dual-path createRequest / approve (re-eval) / quote / order / issue | PASS      | `licensing.ts`, `payments.ts` `assertOrderIssuable`              |
| Flag `RIGHTS_CORE_PURCHASES` + seed Greta DE                        | PASS      | `.env.example`; `seedRightsCoreFixture`                          |
| Passport público allowlist                                          | PASS      | `GET /v1/assets/:id/passport` → `projectPublicPassport`          |
| Tests integración                                                   | PASS      | 8 casos; suite total **122** tests                               |
| UI dual-path (descubrimiento + ficha)                               | PASS      | `creator-detail` / `discover` / `policy.ts`; Greta DE + Lucía ES |
| Auth / live / ES→AT masivo                                          | NO        | STOP explícito (Auth abierta como hito siguiente)                |

**STOP (histórico).** Tras decisión explícita se abrió Auth Supabase v0.1 — ver sección siguiente.

## Auth Supabase v0.1 (7 sep 2026)

Login / refresh / provisioning con mocks. Default local sigue `AUTH_PROVIDER=sandbox`.

| Entrega                                   | Resultado | Evidencia                                           |
| ----------------------------------------- | --------- | --------------------------------------------------- |
| Spec `AUTH_SUPABASE_V0_1`                 | PASS      | `docs/AUTH_SUPABASE_V0_1.md`                        |
| Port inyectable + login/refresh/provision | PASS      | `apps/api/src/integrations/supabase-auth.ts`        |
| Rutas API + actor dual-path               | PASS      | `auth/supabase/login`, `refresh`; `actor()` vía JWT |
| Proxy cookies access + refresh            | PASS      | `apps/web/src/app/api/[...path]/route.ts`           |
| UI email/password si `auth=supabase`      | PASS      | `login.tsx` lee `GET /config`                       |
| Tests mocks                               | PASS      | `tests/supabase-auth.test.ts`                       |
| Runbook proyecto real                     | PASS      | `docs/runbooks/auth-supabase.md`                    |
| MFA / live commerce / OAuth               | NO        | STOP explícito                                      |

**STOP.** No MFA, no live commerce, no remap ES→AT. Siguiente gate de producto solo tras decisión explícita.

## Home pública + E2E §28 (7 sep 2026)

| Entrega                          | Resultado | Evidencia                                         |
| -------------------------------- | --------- | ------------------------------------------------- |
| Landing `/` + hub demo sandbox   | PASS      | `home.tsx` + shell bare                           |
| Marketplace solo `/discover`     | PASS      | catch-all `page.tsx`                              |
| E2E fuerza sandbox (:3010/:4010) | PASS      | `scripts/e2e-server.mjs` + `WEB_ORIGINS`          |
| Matriz journeys 1–10             | PASS      | `tests/e2e/journeys.spec.ts` + commerce           |
| Vitest con AUTH sandbox          | PASS      | `vitest.config.ts` fuerza `AUTH_PROVIDER=sandbox` |
| Playwright                       | PASS      | **9** tests                                       |
| MFA / live / generador IA        | NO        | STOP (J10 = `/verify` only)                       |

**STOP.** No MFA, no live commerce, no remap ES→AT. Siguiente gate solo tras decisión explícita.

## Marketplace UX v0.1 (7 sep 2026)

| Entrega                                   | Resultado | Evidencia                                 |
| ----------------------------------------- | --------- | ----------------------------------------- |
| Home sin hub demo / sin Auth banner       | PASS      | `home.tsx` → Cómo funciona                |
| Login demo secundaria / supabase producto | PASS      | `login.tsx`                               |
| Pasos 1–3 en ficha + copy discover/order  | PASS      | `creator-detail` / `discover` / `company` |
| E2E home actualizado                      | PASS      | `tests/e2e/home.spec.ts`                  |
| Signup público / MFA / live               | NO        | STOP                                      |

**STOP.** No MFA, no live commerce, no remap ES→AT.

## Revisión posterior a los cambios de Cursor

Revisión de código y pruebas repetidas en esta tarea; no se ha repetido el ensayo externo ni se han generado nuevos cobros. La evidencia de Dashboard/CLI de la sección siguiente se conserva como informe del ensayo anterior de Cursor, no como prueba de las correcciones posteriores.

- Baseline recibido: **70 tests locales PASS**. Después de las correcciones: **77 tests PASS**, `pnpm lint`, `pnpm typecheck` y `pnpm build` PASS. Migración 011 aplicada también a la base local `rightsnet`; health API responde OK. Los procesos existentes no se reiniciaron en esta revisión; recargar API/worker antes del reensayo externo.
- Nuevas regresiones: retomar 250 balance transactions en tres ciclos limitados sin perder páginas; descubrir eventos nuevos después del cursor anterior; no avanzar tras error; cargos y refunds ajenos del mismo importe no se concilian con órdenes locales; estado de refund consultado al proveedor; refund ID y ámbito conectados rechazados si no corresponden.
- Migración 011 añade progreso de paginación sin borrar ni reescribir movimientos/journals históricos. Los journals de reversión sintéticos existentes se conservan y requieren revisión; ahora no se generan nuevos sin transferencia contabilizada.
- Checkout no fija email ficticio ni lista de métodos. Mantiene EUR; los métodos se controlan en Dashboard. Por tanto, la fila anterior «async N/A» solo describe el ensayo de tarjeta, no todos los métodos configurables.
- Planner real disponible y usado: respuestas originales en `stripe-planner-decision-tree.json` y `stripe-planner-accepted.json`. La respuesta accepted confirma hosted/web, no valida integralmente Connect ni las pruebas.

**Pendiente:** reensayo externo founder R1–R5 (`docs/runbooks/stripe-test-mode.md`).
**Avance 2026-09-10:** R1 PASS (Connect `Berlin, DE` → `identity.country=DE`);
R2 PASS (Checkout+`charge_ref`+transfer+`RN-LIC-2026-000005`);
R3 PASS (reversión parcial `trr_…` 5000, transfer sigue `paid`). R4 **PASS*** (test 501 BT +
Conciliar platform `done` `3eb77948…`). R5 **PASS*** (thin recovery live: `recovered_events=24`,
cursor `thin_events`; fees/multi mocks). Reensayo R1–R5 **cerrado** en test mode 2026-09-10.
**Fix worker 2026-09-10:** spam `Worker cycle failed PAYMENT_MISMATCH` por recovery de
`checkout.session.completed` ajeno (USD, sin metadata). Soft-quarantine + catch en
`processExternalReconciliation`. Tests checkout/recon focalizados PASS (23).
**Fix thin 2026-09-10:** `created[gte]` unix→RFC3339 en `stripeThinPort().listEvents`
(+ backoff 60s tras failed).
Gaps código cerrados: compare >500, reversión parcial, relink transfer↔`charge_ref`,
thin v2 recovery paginada, fees + multi connected (`docs/STRIPE_THIN_FEES_MULTI_V0_1.md`).

## Ensayo Stripe modo test (6 sep 2026) — evidencia previa de Cursor

Acreditación operativa local con `PAYMENTS_PROVIDER=stripe`, claves `sk_test_…`, `stripe listen` (snapshot + thin) y Dashboard test. IDs redactados.

| Caso                                                     | Resultado             | Evidencia                                                                                                         |
| -------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Platform setup marketplace (Cliente → Tú → Destinatario) | PASS                  | Connect platform setup completado                                                                                 |
| Connect creador (Accounts v2 recipient + Account Link)   | PASS                  | Lucía `acct_…`; `transfers_status=active`; thin sync UI                                                           |
| Checkout hosted €650 campaña «zara»                      | PASS                  | `cs_test_…` → orden `6330abc6-…` `fulfilled` → licencia `479a931e-…`                                              |
| Webhook snapshot firma                                   | PASS (tras fix)       | Antes: todos `← [400]` por `rawBody` vacío; después `← [200]`. Fulfillment inicial vía recovery Events API        |
| Licencia pública                                         | PASS                  | `/verify/Igo65BWYhPp4i9UxZ7yuUYfOdZQukmMW` — `signature_valid`, `NOT_YET_VALID` hasta `starts_at` 2026-09-09      |
| Conciliar Stripe (cierre paso 6)                         | PASS*                 | Run `96261f8d…`; import OK; **0 críticas**; avisos no críticos (CLI/funding) ack                                  |
| Refund total test                                        | PASS                  | Orden → `refunded`; refund `re_3UClNM…` `succeeded` €650; licencia **sigue `issued`** (sin auto-revocación)       |
| Idempotencia `events resend`                             | PASS                  | Mismo `evt_…` → HTTP 200; sin nuevos `provider_events` ni journals                                                |
| Eventos desordenados / retraso (#5)                      | PASS                  | Resend post-flujo de evento secundario; sin doble ledger                                                          |
| Expirar Checkout sin pagar (#7)                          | PASS                  | Orden `7295138c…` · sesión `cs_test_a1Pfx…` → intento `expired`; 0 licencias                                      |
| Pago nuevo + payout connected (#9)                       | PASS                  | Orden `21884812…` fulfilled + transfer; `po_1UCmK1…` en `acct_1UClG2…`; `payout_records` **sin** `order_id`       |
| Disputa CLI `stripe trigger`                             | PASS (skip)           | Fixture USD → ack 200 sin insertar (MVP solo EUR); licencia intacta                                               |
| Disputa EUR (orden viva)                                 | PASS                  | Orden `18caba7b…` · `du_1UCn0k…` €650; licencia `issued`; review admin → `acknowledged`, `license_changed: false` |
| `charge_ref` en intentos                                 | HECHO                 | Migración `010`; matching recon/disputas por `ch_…`                                                               |
| **Paso 6 cerrado**                                       | **HECHO (test mode)** | Checklist runbook 0–10 + disputa EUR. `LIVE_COMMERCE_ENABLED` sigue false                                         |

### Correcciones aplicadas en el ensayo

- `express.json` conserva `req.rawBody` para firma Stripe (`apps/api/src/main.ts`).
- Account Link: fallback `account_update` → `account_onboarding` si Stripe solo permite onboarding.
- Conciliación: el cursor ya no usa solo `starting_after` (miraba al pasado); usa `created[gte]` + watermark al txn más reciente.
- Matching de cargos: `charge_ref` + filtro `provider='stripe'` al cruzar por importe.
- Disputas no-EUR (fixtures CLI): se acusan 2xx y se omiten (sin reintentos infinitos).

## Recorridos de navegador

1. Marketplace, filtros, resultado vacío, favoritos y layout móvil.
2. Compra: aceptación requerida, pago rechazado, retry, emisión única, descarga JSON, verificación pública anónima, refund y suspensión administrativa.
3. Cambio de política con nuevo consentimiento y aprobación manual por el creador antes de cotizar.
4. Viewer bloqueado en escritura, administración restringida y rechazo de origen CSRF ajeno.
5. Alta de creador desde cero: perfil, evidencia PNG de prueba, identidad simulada, consentimiento, revisión administrativa, publicación y retirada del fixture conservando evidencias.

## Evidencia visual

- [Marketplace escritorio](screenshots/marketplace-desktop.png)
- [Marketplace móvil](screenshots/marketplace-mobile.png)
- [Orden emitida](screenshots/order-issued.png)
- [Verificación de certificado](screenshots/license-verification.png)
- [Panel del creador](screenshots/creator-dashboard.png)

Las pruebas no usaron identidades, tarjetas ni licencias reales. El fixture de onboarding se retiró de publicación tras probarlo; las campañas y auditoría E2E se conservan.

## Correcciones verificadas

- El constraint trigger del ledger usaba un campo que no existía en ambas tablas. Se corrigió en migración 003 y se comprobaron doble partida, refunds, duplicados y cierre transaccional.
- Next.js normaliza ciertos orígenes locales. La protección CSRF ahora usa una allowlist explícita de localhost/127.0.0.1; un origen ajeno sigue bloqueado.
- Los snapshots contractuales y de licencia se protegen en DB; los journals no admiten líneas en transacciones posteriores.
- Paso 1 Stripe: mismatches permanentes de webhook se auditan y responden 2xx (sin reintento infinito); ausencia de `provider_ref` sigue en 409 reintentable. Puerto Stripe inyectable para tests sin red.
- Paso 2 Connect: cuentas por creador/entorno; Account Links efímeros no se guardan; eventos thin recuperan el Account autoritativo; panel creador con paso de cobros/remediación.
- Paso 3 Refunds: solicitud durable + worker; `reverse_transfer` y `refund_application_fee`; webhooks sin doble ledger; emisión bloqueada si hay refund pendiente; la licencia no se revoca sola.
- Paso 4 Money: transferencias/disputas/payouts; payouts sin orden; disputa abre revisión humana sin revocar licencia; UI admin y resumen pagado/transferido/payout en creador.
- Paso 5 Conciliación: balance transactions con cursor; comparación vs journals/pagos/refunds/transfers/payouts; diferencias + ack; recovery de eventos; GET ledger interno no llama a Stripe.

## Límites de esta evidencia

El resultado no acredita KYC, suficiencia contractual, impuestos, antimalware, MFA real, backup/restore ni despliegue cloud. El ensayo Stripe **modo test** (paso 6) sí acredita Checkout/Connect/refund/payout/disputa/conciliación frente a Dashboard/CLI; **no** sustituye un cobro live ni cierra gates de piloto. Tampoco se ha ejecutado una prueba de carga de 20 usuarios ni una auditoría de seguridad independiente. Los workflows CI están preparados; la ejecución remota exige publicar el repositorio.

## Campaigns H1 — cierre 9 septiembre 2026

Ver especificación, orden de hitos y límites en `docs/CAMPAIGNS_V0_1.md`.

| Comprobación                                                                              | Resultado                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Migración 026 campaigns, local + test, reejecución idempotente                            | PASS; local también aplicó 023–025 pendientes                                                    |
| Tests H1: persistencia, aislamiento, roles, revisión concurrente, reintentos y validación | 5/5 PASS                                                                                         |
| Typecheck / lint                                                                          | PASS (correcciones menores previas, sin cambiar contratos)                                       |
| Build Next + ejecución API/web sandbox + E2E H1                                           | PASS; 1 recorrido desktop/móvil                                                                  |
| Manual crear → editar → recargar → actividad                                              | PASS, brief y revisión 2 conservados                                                             |
| Regresión completa final                                                                  | 219 PASS / 5 FAIL; original HEAD 5530635: 214 PASS / mismos 5 FAIL                               |
| E2E global inicial                                                                        | 18 PASS / 4 FAIL; fallo nuevo de campaña corregido y retestado; 3 timeouts existentes pendientes |

Capturas nuevas: `screenshots/campaigns-desktop.png` y `screenshots/campaigns-mobile.png`.
No se sobreescriben capturas históricas. No se acredita PASS global, readiness legal
ni producción. Campaña = borrador de planificación; derechos sin evaluar. **STOP H1**.

## Campaign Talent / Rights Inventory H2 — 2026-09-09

Cierre funcional PASS y STOP H2: docs/TALENT_INVENTORY_V0_1.md.
Migración 027 local/test aplicada y reaplicación idempotente. H1/H2: 14/14 tests y
2/2 E2E PASS; typecheck/lint/build PASS. Verificación manual de inventario, filtros,
scopes y expansión; capturas desktop/mobile en docs/screenshots/talent-inventory-*.
Suite global 228 PASS / 5 FAIL: mismos casos previos que H1 (creator-lifecycle x2,
generation-read-verify x1, rights-operations x2). No PASS global, sin repetir E2E legacy.
No se abre H3 ni cambia ningún gate live o contrato PASS.

## Campaign Clearance H3 — 2026-09-09

Cierre funcional PASS y STOP H3: `docs/CAMPAIGN_CLEARANCE_V0_1.md`. Migración 028
local/test aplicada y reaplicación idempotente. H1–H3: 20/20 tests focalizados y 3/3 E2E
PASS; typecheck/lint/build/diff-check PASS. Verificación manual del uso estructurado,
disclaimer, score y motivos; capturas desktop/mobile en `docs/screenshots/campaign-clearance-*`.

Suite global sobre DB compartida: 233 PASS / 6 FAIL. Cinco fallos conocidos (creator-lifecycle
x2, generation-read-verify x1, rights-operations x2) y rn-auth-list x1 reproducido también
de forma aislada sobre la misma DB compartida. Corrección H4: Vitest exige TEST_DATABASE_URL;
el uso de DATABASE_URL no cambió la base de pruebas. Baseline H4 realmente nuevo: 207 PASS /
32 FAIL, registrado antes de código H4. Sin PASS global. Ningún
gate live, contrato PASS o autoridad ejecutable cambia. **STOP H3** histórico; H4 cerrado
abajo.

## Campaign Flight H4 — 2026-09-10

Cierre funcional PASS y STOP H4: `docs/CAMPAIGN_FLIGHT_V0_1.md`. Migración 029 local/test
aplicada y reaplicación idempotente (`campaign_evidence`). H1–H4: 28/28 tests focalizados
y 4/4 E2E PASS; typecheck/lint/build/diff-check PASS. UI Producción/Outputs/Aprobaciones/
Licencias; vínculos AUTH/OUTPUT explícitos sin mint/consume; `media_verified=false`.
Capturas desktop/mobile en `docs/screenshots/campaign-flight-*`.

Suite global post-código (DB compartida): 214 PASS / 33 FAIL. Baseline limpio pre-código
H4: 207 PASS / 32 FAIL (`work/h4-baseline-clean.log`). Fallos fuera de módulos Campaigns
(Stripe mock, integration, creator-lifecycle, rights-grants/ops, etc.). Sin PASS global.
Ningún gate live o autoridad ejecutable cambia. H5 Deal Builder cerrado abajo.

## Campaign Deal Builder H5 — 2026-09-10

Cierre funcional PASS y STOP H5: `docs/CAMPAIGN_DEAL_BUILDER_V0_1.md`. Migración 030
local/test aplicada. H1–H5: 32/32 tests focalizados y 5/5 E2E PASS; typecheck/lint PASS.
UI Solicitudes: borrador → enviar → retirar; sin mutación de grants. Capturas
`docs/screenshots/campaign-deal-builder-*`. H6 Passport cerrado abajo.

## Campaign Passport H6 — 2026-09-10

Cierre funcional PASS y STOP H6: `docs/CAMPAIGN_PASSPORT_V0_1.md`. Migración 031
aplicada. H1–H6: 35/35 tests focalizados y 6/6 E2E PASS; typecheck/lint PASS.
Emitir → verify público → revocar → 404. Capturas `docs/screenshots/campaign-passport-*`.
Serie Campaigns H1–H6 cerrada a nivel funcional documentado.

## Org buyers AT — 2026-09-10

Cierre PASS y STOP: `docs/ORG_BUYERS_AT_V0_1.md`. CHECK DB ya `AT|DE|ES` (014);
OpenAPI/contratos regenerados; seed demo buyer en AT; tests `org-buyers-at` +
supabase-auth AT PASS; typecheck/lint PASS. Sin remap de grants. Connect country
cerrado aparte (`docs/CONNECT_COUNTRY_AT_DE_V0_1.md`).

## Connect country AT/DE — 2026-09-10

Cierre PASS código/mocks: `docs/CONNECT_COUNTRY_AT_DE_V0_1.md`. `identity.country`
desde sufijo `creators.location` o `CONNECT_DEFAULT_COUNTRY` (default `at`). Solo
cuentas nuevas. Tests `stripe-connect` PASS.

## Stripe money/recon gaps — 2026-09-10

Implementación parcial PASS mocks: `docs/STRIPE_MONEY_RECON_GAPS_V0_1.md`. Compare
paginado >500; reversión parcial; relink huérfanos al setear `charge_ref`. Reensayo
founder CLI: R1–R5 **PASS*** 2026-09-10 (test mode; R4 volumen vía test 501 BT).

## Thin v2 recovery + fees / multi-account — 2026-09-10

Cierre PASS código/mocks: `docs/STRIPE_THIN_FEES_MULTI_V0_1.md`. Migración 032.
`recoverMissedThinEvents`; match application fee/refund; worker multi-`acct_*`.
Tests recon + typecheck/lint PASS. Reensayo founder sigue OPEN.

## Asset relationship review v0.1 — 2026-09-10

Cierre PASS código: `docs/ASSET_RELATIONSHIP_REVIEW_V0_1.md`. Preview evidencia en
Admin Verificación; review exige fichero; tests `asset-relationship-review` PASS.
Ensayo humano founder opcional para marcar gate operativo.

## Storage + malware scan v0.1 — 2026-09-10

Cierre PASS sandbox: `docs/STORAGE_SCAN_V0_1.md`. Puertos local store + scanner EICAR;
submit/review/extract exigen `clean`.

## Storage S3 + ClamAV v0.1 — 2026-09-10

Cierre PASS opt-in: `docs/STORAGE_S3_CLAMAV_V0_1.md`. `s3Store` SigV4 +
`clamavScanner` INSTREAM; CI defaults local/sandbox; tests storage-scan 5/5.

## Storage presigned GET v0.1 — 2026-09-10

Cierre PASS: `docs/STORAGE_PRESIGNED_V0_1.md`. `presignGet` + redirect
`GET files/:id` cuando S3; runbook MinIO/ClamAV local. Tests storage-scan 6/6.

## Storage multipart v0.1 — 2026-09-10

Cierre PASS: `docs/STORAGE_MULTIPART_V0_1.md`. S3 multipart auto en `put`
sobre umbral; tests storage-scan 7/7.

## Signing key rotation v0.1 — 2026-09-10

Cierre PASS local: `docs/SIGNING_KEY_ROTATION_V0_1.md`. `SigningKeyStore` +
admin rotate/list; pubs históricos conservados. Tests signing-rotation 3/3.
KMS remoto OPEN.

## Rate limit distributed v0.1 — 2026-09-10

Cierre PASS: `docs/RATE_LIMIT_DISTRIBUTED_V0_1.md`. Puerto memory + Redis
RESP opt-in; middleware API. Tests rate-limit 3/3. CI memory.

## Audit archive v0.1 — 2026-09-10

Cierre PASS: `docs/AUDIT_ARCHIVE_V0_1.md`. Append JSONL con hash-chain desde
`audit()`; verify admin. Tests audit-archive 2/2. WORM cloud OPEN.

## Backup/restore drill v0.1 — 2026-09-10

Cierre PASS local: `docs/BACKUP_RESTORE_V0_1.md`. `pnpm db:backup-drill`
dump→restore smoke PASS. PITR cloud OPEN.

## Notifications v0.1 — 2026-09-10

Cierre PASS sandbox: `docs/NOTIFICATIONS_V0_1.md`. Alertas ops en pago/
licencia/outbox.dead; admin recent. Tests notifications 3/3. Email OPEN.

## Staging deploy security v0.1 — 2026-09-10

Cierre PASS higiene: `docs/STAGING_DEPLOY_SECURITY_V0_1.md`.
`pnpm staging:security` Hygiene PASS; tests staging-security; paso en CI.
Host cloud staging OPEN.

## Notifications email outbox v0.1 — 2026-09-10

Cierre PASS sandbox: `docs/NOTIFICATIONS_EMAIL_OUTBOX_V0_1.md`.
`NOTIFY_PROVIDER=email_outbox` encola a JSONL; admin email-outbox.
Tests notifications 4/4. SMTP OPEN.

## Staging health smoke v0.1 — 2026-09-10

Cierre PASS: `docs/STAGING_HEALTH_SMOKE_V0_1.md`. `pnpm staging:health`
valida API/web; tests staging-health 3/3. Host cloud OPEN.

## Demo UI gate v0.1 — 2026-09-10

Cierre PASS: `docs/DEMO_UI_GATE_V0_1.md`. Producto sin `/demo`/banner/chip
por defecto; CI/E2E `DEMO_UI_ENABLED=true`. Test demo-ui-gate.

## DB roles / tenancy v0.1 — 2026-09-10

Cierre PASS roles: `docs/DB_ROLES_TENANCY_V0_1.md`. Migración 033; `MIGRATE_DATABASE_URL`;
test niega DDL a `rightsnet_app`.

## DB RLS org pilot v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_V0_1.md`. Migración 034 FORCE en organizations /
organization_members / campaigns; helpers `withRlsActor`; bypass de pool por
defecto; test `db-rls` aísla por membership. Cableado Nest progresivo OPEN.

## DB RLS Campaigns H1 wiring v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_CAMPAIGN_WIRING_V0_1.md`. `list`/`get`/`create`/`update`
con GUCs RLS; `mutate(..., rls?)`. Tests campaigns + `db-rls` PASS.

## DB RLS Campaigns H2–H6 wiring v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_CAMPAIGN_H2_H6_WIRING_V0_1.md`. Talent inventory, clearance,
flight, deal builder y passport con `campaignRlsActor` + `withRlsActor` /
`mutate(..., rls)`; lecturas snapshot con `{ readonly: true }`. Sin
`findCampaign(pool, …)` en módulos campaign. Tests focalizados H1–H6 + `db-rls`:
36/36 PASS.

## DB RLS Rights Ops wiring v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_OPS_WIRING_V0_1.md`. `assertOps*` + overview/campaign-query
+ Existing Deal mutates con `opsRlsActor`. Tests ops / org-member / writes / `db-rls`
12/12 PASS.

## DB RLS grants + external agreements v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_GRANTS_EXTERNAL_V0_1.md`. Migración 035 FORCE en
`rights_grants` / `external_agreements` (org member o grantor). Tests `db-rls` 2/2
+ talent/ops focalizados PASS.

## DB RLS licenses + generation v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_LICENSES_GENERATION_V0_1.md`. Migración 036 FORCE en
`licenses` / `generation_auths` / `generation_records`. Tests `db-rls` 3/3 +
rn-auth/report-output PASS.

## DB RLS campaign children v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_CAMPAIGN_CHILDREN_V0_1.md`. Migración 037 FORCE en
`campaign_talent` / `campaign_evidence` / `campaign_deal_requests` /
`campaign_passports`. Tests `db-rls` 4/4 + H1–H6 35/35 PASS.

## DB RLS orders chain v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_ORDERS_V0_1.md`. Migración 038 FORCE en
`requests` / `quotes` / `orders` (org o creador del asset; alineado con
licenses). Tests `db-rls` 5/5 + rights-core/checkout PASS.

## DB RLS ledger + outbox v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_LEDGER_OUTBOX_V0_1.md`. Migración 039 FORCE en
`outbox` / `journals` / `ledger_entries` (vía orden). Tests `db-rls` 6/6 +
stripe checkout/money/refunds PASS.

## DB RLS payment attempts + refunds v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_PAYMENTS_REFUNDS_V0_1.md`. Migración 040 FORCE en
`payment_attempts` / `refunds`. Tests `db-rls` 7/7 + checkout/refunds PASS.

## DB RLS provider events + contract acceptances v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_PROVIDER_ACCEPTANCES_V0_1.md`. Migración 041 FORCE en
`contract_acceptances` (vía orden) y `provider_events` (bypass/admin).
Tests `db-rls` 8/8 + stripe events/checkout PASS.

## DB RLS Stripe money v0.1 — 2026-09-10

Cierre PASS: `docs/DB_RLS_STRIPE_MONEY_V0_1.md`. Migración 042 FORCE en
transfers/reversals/disputes/payouts/balance BT + reconciliation_*.
Helpers `app_can_see_order` / `app_owns_connected_account`. Tests `db-rls` 9/9
+ stripe-money/recon PASS.
