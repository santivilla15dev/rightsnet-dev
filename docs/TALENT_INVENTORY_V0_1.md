# H2 — Campaign Talent + My Talent / Rights Inventory

Fecha: 2026-09-09. H2 funcional PASS; regresión global NO PASS (fallos previos).
Autorizado por el founder: «sigamos» después del STOP H1.
Constitución, contratos PASS y gates live revisados en H1 siguen vigentes.

## Entrega y límites

Inventario privado por organización de activos con RightsGrant (marketplace o Existing
Agreement) o acuerdo pendiente. Un activo aparece una vez; cada grant conserva su ID,
source_type/source_id, estado y alcance declarado. Campos ausentes se muestran sin
especificar; no se completan ni se convierten en ALLOW. Sin contrato completo, importes,
archivos OCR, firmas, auth tokens ni datos KYC en esta proyección.

Vigencia temporal CURRENT requiere status ACTIVE y valid_from <= now < valid_until.
SCHEDULED si ACTIVE antes de inicio; EXPIRED al alcanzar fin; SUSPENDED/REVOKED dominan.
Filtros: source all/marketplace/existing; availability all/current/expiring/not_current;
expiring = CURRENT con fin dentro de 30 días UTC. Se evalúa el filtro sobre grants del
origen seleccionado. Pending no crea derechos. Una campaña no altera estos resultados.
El reloj es del servidor y se devuelve evaluated_at; no se cachea una autorización.

Disponibilidad marketplace se obtiene del buscador existente. Para añadir a una campaña,
un activo debe tener una relación propia (grant o acuerdo pendiente) o estar publicado
con relación reviewed e identidad/adultez vigentes y política, como el marketplace.
Un activo no publicado de otra organización nunca puede añadirse por UUID.

## Persistencia y API

027 campaign_talent: campaign_id + asset_id únicos; selected_grant_id opcional. Selección
solo si el grant pertenece a la misma organización y activo. No reasignar automáticamente
un grant expirado ni alterar payloads. Añadir/quitar vínculos de planificación, auditados;
quitar talento nunca revoca derechos. Sin cambios en RN-AUTH / GenerationRecord.

GET /v1/talent-inventory: organization_id, q, source, availability, limit 1–50, offset.
GET /v1/campaigns/:id/talent: lista paginada y grants seleccionados con vigencia actual.
POST /v1/campaigns/:id/talent: asset_id, selected_grant_id opcional/null.
POST /v1/campaigns/:id/talent/:assetId/remove: body vacío.
Writes requieren Idempotency-Key; duplicate add devuelve vínculo existente (no cambia
selección silenciosamente; selección diferente exige quitar/añadir). Lectura owner/employee,
escritura owner; otro org/viewer/admin sin membresía = 404. Employee write = 403.
Añadir/quitar incrementa revision de Campaign y audita en la misma transacción. H1
edición concurrente detecta el cambio. Actividad incluye acciones de talento.

## UI

/company/talent: organización, filtros y tarjetas con grants, vigencia y scopes.
Campaña → Talento: lista vinculada, quitar, inventario propio y buscador marketplace
existente. Selección de grant explícita y opcional, nunca equivale a clearance.
IDs de licencia/acuerdo visibles como referencia; no enlaces a rutas incompatibles.

## Aceptación

Pruebas DB con fixtures propios: dos organizaciones aisladas; rol; estado temporal y
límites exactos; source+availability; pending; grant ajeno o de otro asset rechazado;
activo oculto ajeno bloqueado; duplicados/reintentos; quitar sin revocar; auditoría/revisión.
E2E H1 y H2 + typecheck/lint/build; revisión visual escritorio/móvil. Documentar por
separado regresiones conocidas de H1. STOP H2 antes del clearance H3.

## Cierre H2 — 2026-09-09

SPECIFY → IMPLEMENT → MIGRATE → TEST → RUN → VERIFY → DOCUMENT → **STOP H2**.

- Migración 027 aplicada en DB local y test; segunda ejecución del migrador no aplica cambios.
  Sin backfill ni modificación de RightsGrant, RN-AUTH, contratos o snapshots históricos.
- Tests focalizados H1 + H2: 14/14 PASS (9 nuevos). Suite completa: 228 PASS / 5 FAIL.
  Los cinco fallos son los mismos documentados en H1: creator-lifecycle (2),
  generation-read-verify (1), rights-operations (2). Base compartida con fixtures acumulados;
  no se acredita el repo entero ni una ejecución sobre base limpia como PASS.
- Typecheck y lint PASS. Build Next PASS, también durante arranque manual tras ajuste
  del breadcrumb de Mi talento. E2E focalizados H1 + H2: 2/2 PASS.
- E2E: filtrar vigencia, crear campaña, añadir marketplace, recargar, retirar, añadir
  con grant explícito, comprobar API persistida y actividad (2 altas / 1 baja), móvil 390px
  sin desbordamiento horizontal. Capturas revisadas en escritorio y móvil.
- Manual en navegador integrado, sandbox :3010/:4010: marca demo → Mi talento,
  origen Existing + vigencia current, desplegar scope y mostrar más derechos.
  Confirmados territorios DE/AT y canales/duración «Sin especificar», pendientes sin autoridad.
  Breadcrumb correcto. El flujo de mutaciones completo está cubierto por E2E automatizado.
- Capturas: docs/screenshots/talent-inventory-desktop.png y talent-inventory-mobile.png.

## Límites y riesgos conocidos

La disponibilidad es temporal, no clearance ni promesa legal. La selección admite grants
caducados/revocados para planificación y los muestra como tales. Los perfiles añadidos
solo desde marketplace se guardan en la campaña; Mi talento global requiere grant propio
o acuerdo pendiente. No se crea una licencia al vincularlos.

La lista pagina activos; por activo se muestran inicialmente tres grants y se expanden
de tres en tres. La API todavía devuelve todos los grants de los activos de esa página:
una organización con gran historial requerirá paginación de grants en servidor antes de
escalar. Los filtros de vigencia seleccionan activos, no ocultan los demás grants del origen.
Offsets pueden desplazarse por escrituras concurrentes; sin snapshot transaccional de lectura.
Autorización en API; RLS sigue siendo el gate previo pendiente. Sin cambios de flags live.

H3 (clearance determinista de campaña) sigue propuesto, no implementado.
