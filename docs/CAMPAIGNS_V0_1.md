# Campaigns v0.1 — H1: espacio persistente de planificación

SPECIFY / IMPLEMENT / MIGRATE / RUN / VERIFY funcional H1: PASS. TEST H1: PASS; regresión global NO PASS. DOCUMENT / STOP: completados.
Fecha: 2026-09-08. Autorización: petición del founder de auditar y entregar solo el primer hito.

## Auditoría y orden mínimo

El repo dispone de Rights Core dual-path, RightsGrant marketplace/Existing Deal,
Rights Operations, Connect, RN-AUTH, GenerationRecord y Higgsfield. Se conservan sus
contratos PASS. `campaign_name` en solicitudes y snapshots no es una entidad Campaign.
`rights-operations/campaign-query` es una consulta efímera, no un proyecto guardado.
Su clasificador no comprueba canales y admite algunas dimensiones vacías como wildcard;
no debe convertirse directamente en un porcentaje de autorización ejecutable.
Los PASS documentales son antecedentes; las comprobaciones de esta entrega se registran abajo.

1. **H1 (esta entrega):** Campaign persistente por organización, listado paginado,
   creación, edición con control de revisión, overview, creative brief y actividad.
2. **H2:** talento vinculado, My Talent + Rights Inventory (Existing Deal y marketplace),
   filtros de vigencia actual, referencias explícitas a grants/licencias; sin inferir
   asociaciones por nombres de campañas históricos.
3. **H3:** clearance versionado determinista por talento y dimensiones; reutilizar
   Rights Engine/RightsGrant, explicitar datos faltantes, blockers y reasons. Score
   de cobertura separado del status, nunca compensar un DENY con un porcentaje alto.
   Especificar canales, vigencia, múltiples grants y aprobaciones antes de implementar.
4. **H4:** preflight/postflight, pestañas production/outputs/approvals/licenses/rights,
   vínculos explícitos a RN-AUTH y GenerationRecord sin modificar sus snapshots;
   interpretar con AI solo cuando sea necesario y decidir con reglas.
5. **H5:** Deal Builder: propuesta estructurada de campos faltantes/extensiones y
   solicitud humana, sin términos legales inventados ni permisos autoactivados.
6. **H6:** Campaign Passport compartible, allowlist pública, revocable, caducidad y
   reevaluación; sin datos comerciales privados ni promesas de validez legal.

## Contrato H1

Justificación de entidad (§27 Constitución): conservar el brief que agrupa el trabajo
buyer sin duplicar licencias ni grants. Campaign es planificación, no autoridad.
Estado único `DRAFT`; `clearance_status: NOT_EVALUATED`. Sin score ni generación.

API autenticada interna `/v1/campaigns`: GET por organization_id, limit (1–50), offset;
POST crear con Idempotency-Key. GET `/:id` incluye actividad paginada (50 por página).
POST `/:id` reemplaza nombre/brief con `expected_revision` + Idempotency-Key.
Nombre 1–120 caracteres; brief 0–10000; campos desconocidos rechazados.
Org inmutable. Owner/employee leen; solo owner edita. Otros reciben 404; employee
write 403. Admin no recibe bypass: este es un espacio buyer por membresía.
Mutación + auditoría + idempotencia en la misma transacción. Conflicto de revisión 409.

UI `/company/campaigns` y `/:id`: organización explícita, lista, crear, resumen,
brief editable, actividad. Se enlaza desde navegación buyer y CTA de `/company`.
Las otras seis áreas se entregarán cuando tengan datos y comportamiento real en H2–H4,
no mediante pestañas vacías que aparenten funcionalidad. `/company` conserva compras.

## Migración y aceptación

026: tabla `campaigns` e índice organization_id/created_at/id. Sin backfill por nombre,
sin modificación de históricos. Reaplicación mediante migrator idempotente.
Pruebas: persistencia, aislamiento, roles, datos inválidos, revisión concurrente,
idempotencia y auditoría; navegador crear/editar/recargar y móvil. Regresión suites
existentes, typecheck, lint, build. Usar sandbox/base de pruebas; ningún proveedor live.

## Evidencia de cierre

Ver cierre y límites abajo. STOP tras H1 histórico; H2–H4 cerrados en docs propias;
H5–H6 solo propuestos.

## Cierre H1 — 2026-09-09

SPECIFY → IMPLEMENT → MIGRATE → TEST → RUN → VERIFY → DOCUMENT → **STOP**.
Implementación y verificación funcional H1: **PASS**. Regresión global: **NO PASS**;
no se declara el repositorio completo verde ni se inicia H2.

- `pnpm exec vitest run tests/campaigns.test.ts`: **5/5 PASS**; también pasan en suite completa.
- `pnpm typecheck`, `pnpm lint`: **PASS** tras corregir errores menores previos de
  imports, tipos opcionales, inferencia literal y directivas lint inexistentes.
  Ningún contrato de Rights Core, grant, RN-AUTH ni proveedor cambia.
- `DATABASE_URL=postgresql://rightsnet@127.0.0.1:55432/rightsnet_test pnpm exec playwright test tests/e2e/campaigns.spec.ts`:
  **1/1 PASS**, build Next incluido, API + web ejecutadas en sandbox :4010/:3010.
- Recorrido manual en navegador integrado: marca demo → Campañas → crear
  «Verificación manual H1» → editar brief → guardar → recargar → revisión 2 y
  ambas entradas de actividad visibles. Comprobación visual desktop y móvil 390px.
- Capturas: `docs/screenshots/campaigns-desktop.png`, `campaigns-mobile.png`.
- Migración nueva **026** aplicada en DB local y test; segundo `pnpm db:migrate`
  no aplica nada. La DB local tenía pendientes **023–025**: el migrador estándar
  las aplicó antes de 026. No hay backfill ni cambios de snapshots por campañas.
- Suite completa final: **219 PASS / 5 FAIL (224)**. Copia intacta de HEAD `5530635`:
  **214 PASS / los mismos 5 FAIL (219)**, sobre la misma base de test, en ejecuciones
  secuenciales. Fallan dos expectativas de creator-lifecycle, una de
  generation-read-verify y dos de rights-operations. La base de test es compartida
  por suites y acumula fixtures: esta comparación no es una acreditación en DB limpia.
- E2E global inicial: **18 PASS / 4 FAIL**. El fallo nuevo de campaña (etiqueta de
  textarea) se corrigió y reejecutó con éxito. Otros tres timeouts en selectores
  existentes: Ops «Pagos y licencias», «Aprobar» onboarding y Journey creator.
  No se ha repetido toda la suite E2E ni acreditado esos tres casos como PASS.

Límites: solo borradores; sin talento vinculado, evaluación, permisos, generación,
share público ni conexión automática a compras. La actividad registra actor en auditoría
interna y revisión, no almacena versiones completas del brief. Listado con offset puede
cambiar de página si otro usuario crea campañas. El cliente genera una nueva clave por
intento: después de una respuesta perdida debe comprobarse el listado antes de repetir
una creación. Autoridad/tenancy se controla en API, sin introducir RLS (gate ya pendiente).
Sin ejecución de servicios live ni cambios de flags. Continuaciones H2–H4: ver
`TALENT_INVENTORY_V0_1.md`, `CAMPAIGN_CLEARANCE_V0_1.md`, `CAMPAIGN_FLIGHT_V0_1.md`.
H5 Deal Builder y H6 Passport permanecen propuestos.
