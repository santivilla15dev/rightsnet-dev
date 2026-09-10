# H5 — Campaign Deal Builder

2026-09-10. SPECIFY PASS; IMPLEMENT PASS (cierre abajo). Continuación autorizada tras STOP H4.

## Alcance y contratos

Tras H3 (clearance) y H4 (flight), el buyer ve huecos concretos: campos de uso o de
grant incompletos, dimensiones DENY/INCOMPLETE, o condiciones `approval` pendientes.
H5 convierte esos huecos en una **propuesta estructurada de solicitud humana** hacia
quien puede ampliar o aclarar el acuerdo — sin inventar texto legal, sin mutar
RightsGrant/RightsPolicy, y **sin autoactivar permisos**.

Solo talento humano real vinculado a la campaña (mismo límite H2–H4). Un personaje
íntegramente ficticio no entra en este flujo. AI no redacta cláusulas ni infiere
términos; como máximo puede etiquetar huecos ya calculados por reglas.

### Qué es

- Lectura privada por campaña: lista de **gaps** derivados del clearance H3 actual
  (y, si aplica, blockers de preflight H4 que no sean evidencia AUTH/OUTPUT).
- Borrador de **solicitud** (`deal_request`) por talento/grant seleccionado: dimensiones
  pedidas, valores deseados tomados del `usage` de campaña cuando existan, nota humana
  opcional corta.
- Estados de solicitud: `DRAFT` → `SENT` (registro interno) → `WITHDRAWN` | `CLOSED`.
  `SENT` no notifica aún por email/cola (infra pendiente); es un registro auditable
  para ops/humano. Sin canal externo en v0.1.
- Nunca crea RightsGrant, nunca confirma Existing Deal, nunca minta RN-AUTH, nunca
  cambia `scope_snapshot` ni policy pública.

### Qué no es

- No es Marketplace checkout ni extensión automática de licencia.
- No es aprobación de condiciones `approval` (sigue resolviéndose en el acuerdo de origen).
- No es Campaign Passport (H6).
- No es clearance legal ni autoridad ejecutable.

## Modelo de datos (migración aditiva propuesta 030)

`campaign_deal_requests`:

| Columna | Notas |
|---------|--------|
| `id` | uuid PK |
| `campaign_id` | FK campaigns |
| `asset_id` | talento vinculado |
| `selected_grant_id` | grant seleccionado al crear/enviar; STALE si luego cambia |
| `status` | `DRAFT` \| `SENT` \| `WITHDRAWN` \| `CLOSED` |
| `gaps` | jsonb: lista `{ dimension, reason, desired }` calculada al guardar/enviar |
| `desired_usage` | jsonb subset del usage H3 (solo campos explícitos del request) |
| `note` | text 0–2000; sin Markdown legal inventado |
| `revision` | entero; optimistic concurrency |
| `created_by` / `updated_by` | users |
| `created_at` / `updated_at` / `sent_at` | timestamptz |
| `organization_id` | denormalizado para aislamiento |

Índice `(campaign_id, status)`. Un DRAFT activo por `(campaign_id, asset_id)` como
máximo (único parcial). SENT históricos se conservan; no reescribir. Retirar vínculo
de talento no borra requests: quedan `CLOSED` o lectura STALE.

Sin backfill. Sin tocar tablas PASS de grants/licencias/RN-AUTH.

## API privada (owner write; owner/employee read; ajenos 404)

- `GET /v1/campaigns/:id/deal-builder` — snapshot: clearance summary + gaps sugeridos
  por talento + requests existentes. Lectura REPEATABLE READ; gaps se recalculan;
  no se presenta un gap guardado como vigente si el clearance ya cambió (marcar
  `stale_gaps: true` si `gaps` del DRAFT ≠ cálculo actual).
- `POST /v1/campaigns/:id/deal-requests` — crear/actualizar DRAFT (`expected_revision`
  si update; Idempotency-Key). Body estricto: `asset_id`, `desired_usage` parcial,
  `note` opcional. Rechazar campos desconocidos. Solo owner.
- `POST /v1/campaigns/:id/deal-requests/:requestId/send` — DRAFT→SENT; congela `gaps`
  y `desired_usage` del momento; audita. Idempotente si ya SENT.
- `POST /v1/campaigns/:id/deal-requests/:requestId/withdraw` — SENT→WITHDRAWN (owner).

Límite: 50 requests por campaña. 409 al exceder. Employee: solo GET.

Gaps admitidos (mapeo desde reasons H3, lista cerrada):

- `USAGE_FIELD_MISSING`, `GRANT_SCOPE_MISSING`, `GRANT_DURATION_MISSING`,
  `USAGE_WINDOW_MISSING`, `NO_SELECTED_GRANT`, `INVALID_GRANT` (solo como “revisar
  evidencia”; no proponer términos), `GRANT_APPROVAL_REQUIRED`, y denegaciones
  dimensionales (`OPERATION_DENIED`, etc.) como “solicitar ampliación” **sin**
  rellenar el valor legal — el humano elige `desired` dentro del enum Rights Core
  ya usado en usage (industria, operación, propósito, territorios AT/DE, canales
  conocidos, duración 1–365).

No inventar territorios, canales ni industrias fuera del vocabulario PASS.
WORLDWIDE no se sugiere automáticamente.

## UI

Nueva pestaña o sección **Solicitudes** en detalle de campaña (tras Derechos /
Producción). Mostrar por talento: gaps actuales, borrador editable, enviar/retirar.
Disclaimer fijo: “Esto no modifica derechos ni concede permiso; es una solicitud
humana registrada.” Sin botón “aprobar grant” ni “aplicar extensión”.

Mobile 390px sin desbordar. Activity: `deal_request_created` / `updated` / `sent` /
`withdrawn`.

## Pruebas y cierre (cuando se implemente)

Fixtures H3 incompletos + grant con approval. Roles, aislamiento, revisión,
idempotencia send, STALE gaps, límite 50, no mutación de grants al enviar.
E2E: crear borrador → enviar → recargar → withdraw. Typecheck/lint/build.
Documentar regresión global sin atribuir fallos legacy a H5.
**STOP H5** antes de Campaign Passport (H6).

## Límites y riesgos

Sin notificaciones externas, sin portal del licensor, sin e-sign. SENT es registro
interno. Un grant revocado después de SENT no se “arregla” solo: el request queda
histórico; clearance/flight siguen siendo la verdad operativa. RLS y gates live
siguen pendientes.

## Cierre H5 — 2026-09-10

SPECIFY → IMPLEMENT → MIGRATE → TEST → RUN → VERIFY → DOCUMENT → **STOP H5**.

- Migración 030 aplicada (local + test); reaplicación idempotente. Tabla
  `campaign_deal_requests` con único parcial DRAFT `(campaign_id, asset_id)`.
- API: `GET …/deal-builder`, `POST …/deal-requests`, `…/send`, `…/withdraw`.
  Gaps desde clearance H3 (lista cerrada); sin mutar RightsGrant; límite 50 → 409;
  roles owner write / employee read / outsider 404; STALE gaps en borrador;
  retirar talento → CLOSED.
- UI pestaña **Solicitudes**; disclaimer de no autoridad; sin botón aprobar/aplicar.
- Tests focalizados H1–H5: 32/32 PASS (4 nuevos). E2E H1–H5: 5/5 PASS.
  Typecheck/lint PASS. Capturas: `docs/screenshots/campaign-deal-builder-desktop.png`
  y `campaign-deal-builder-mobile.png`.

No notificaciones externas ni e-sign. **STOP H5** antes de Campaign Passport (H6).
H6 SPECIFY + IMPLEMENT PASS: `docs/CAMPAIGN_PASSPORT_V0_1.md`.
