# H3 — Clearance determinista de campaña v0.1

2026-09-09. H3 funcional PASS; regresión global NO PASS. Continuación autorizada tras H2.

## Contrato

Evaluación privada de cobertura del uso estructurado guardado, no autorización de
producción, validez legal ni RN-AUTH. Reutiliza schemas de Rights Core, RightsGrant y
hash canónico; nuevo evaluador puro de grants sin cambiar clasificadores PASS. No usa
la policy pública actual para reescribir derechos ya adquiridos. No usa AI.

Uso parcial editable por owner: industria, operación visual, propósito comercial,
territorios AT/DE, canales Instagram/TikTok/YouTube, inicio UTC, duración entera 1–365.
Campos ausentes permitidos para borradores, nunca inferidos del brief; vacíos/duplicados,
campos desconocidos o fechas inválidas se rechazan. Guardar exige expected_revision y
Idempotency-Key, incrementa revisión y audita. Lectura owner/employee; sin bypass admin.

Un grant seleccionado por talento, sin unión ni sustitución automática. Diez checks de
igual peso: selección, estado actual, ventana, operación, propósito, industria,
territorios, canales, duración declarada, condiciones de aprobación. Datos desconocidos
= INCOMPLETE; estados de permiso reutilizan ALLOW/DENY/REQUIRES_APPROVAL/NOT_SPECIFIED.
Listas vacías no son wildcard. WORLDWIDE explícito cubre territorios. Sin aliases inferidos.
Ventana: grant vigente ahora y cobertura completa [inicio,inicio+duración); fin igual al
fin del grant se admite. Inicio pasado = DENY; duración se compara con máximo declarado
en scope_snapshot.duration_days. Existing Deal sin canales/duración queda INCOMPLETE.
Condiciones approval no vacías requieren aprobación humana; H3 no las resuelve ni
interpreta como aprobación cumplida. Payload no válido o binding inconsistente bloquea.

Precedencia: DENY > INCOMPLETE > REQUIRES_APPROVAL > ALLOW. Score = floor(100 * checks
ALLOW / total checks), sin redondear a 100 un bloqueo. Sin talento: INCOMPLETE, score 0,
NO_TALENT. Se devuelven checks, blockers/reasons, versión, revisión, evaluated_at e input_hash.
Toda lectura recalcula en snapshot DB REPEATABLE READ; no hay resultado persistido que
pueda presentarse como vigente después de revocación. evaluated_at es instante de
consulta, no TTL. Resultado ALLOW solo significa cobertura declarada para ese uso;
preflight, safety, identidad y autoridad ejecutable siguen en H4/tronco existente.

API GET /v1/campaigns/:id/clearance; POST /v1/campaigns/:id/usage.
Migración aditiva 028: campaigns.usage jsonb default {}. Sin backfill de términos.
UI Derechos: formulario, score claramente separado de status, motivos por talento y
botón de actualizar evaluación. No llamar al endpoint de mint para evaluar.

## Aceptación

Checks puros para todas dimensiones, precedencia, límites exactos, faltantes, grants
revocados y grants múltiples no fusionados; DB persistencia, revisión, acceso, retry y
reevaluación. E2E guardar/recargar, incomplete y blockers; H1/H2 regresión focalizada.
Typecheck/lint/build; manual y capturas. Documentar fallos globales previos. STOP H3.

## Cierre H3 — 2026-09-09

SPECIFY → IMPLEMENT → MIGRATE → TEST → RUN → VERIFY → DOCUMENT → **STOP H3**.

- Migración 028 aplicada en DB local y test; segunda ejecución sin cambios. Añade únicamente
  `campaigns.usage` como JSON estructurado vacío por defecto. Sin backfill de términos ni
  cambios a RightsGrant, Rights Engine, licencias, RN-AUTH o GenerationRecord.
- Tests focalizados H1–H3: 20/20 PASS; seis nuevos prueban las diez dimensiones,
  precedencia, límites temporales, datos ausentes, aprobación, revocación, no talento,
  aislamiento, roles, revisión, auditoría e idempotencia.
- Typecheck, lint, build Next y `git diff --check`: PASS. E2E H1–H3: 3/3 PASS.
  Recorrido H3: crear campaña, elegir talento/derecho, guardar uso, evaluar, recargar,
  actividad y móvil 390px sin desbordamiento.
- Verificación manual en navegador integrado: marca demo → Campañas → Derechos. Confirmados
  mensaje de alcance para personas reales, disclaimer de no autoridad, score 0/10 y los
  diez motivos `INVALID_GRANT` de un grant demo histórico incompatible.
- Capturas revisadas: `docs/screenshots/campaign-clearance-desktop.png` y
  `campaign-clearance-mobile.png`.

Suite global sobre DB compartida: 233 PASS / 6 FAIL (239). Cinco son los casos ya registrados
en H1/H2: creator-lifecycle (2), generation-read-verify (1) y rights-operations (2).
También falla rn-auth-list (1); se reprodujo aisladamente en la misma base compartida.
Corrección H4: los intentos de usar DB nueva pasaron DATABASE_URL, pero Vitest exige
TEST_DATABASE_URL. La afirmación anterior de DB nueva era incorrecta. El baseline correcto
antes de código H4 da 207 PASS / 32 FAIL; ver docs/CAMPAIGN_FLIGHT_V0_1.md.
H3 no crea ni lista RN-AUTH. No se declara PASS global ni se atribuye causalidad solo por módulo.

## Límites y riesgos

Solo cubre talento humano explícitamente vinculado. Un personaje ficticio creado íntegramente
con IA no necesita licenciar likeness mediante este flujo. El resultado es una lectura actual,
privada y determinista de términos declarados; no prueba titularidad legal, safety, consentimiento
completo ni autoriza producción. No persiste resultados, no combina grants y no resuelve
aprobaciones. Un payload histórico incompatible queda INCOMPLETE hasta que exista evidencia
estructurada válida; no se migra silenciosamente. El reloj del servidor y el snapshot de lectura
evitan mezclar estados dentro de una evaluación, pero el resultado puede cambiar después.
RLS y gates live siguen pendientes. H4 cerrado por separado (`docs/CAMPAIGN_FLIGHT_V0_1.md`).
