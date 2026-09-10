# H4 — Campaign Preflight / Postflight

2026-09-09. SPECIFY PASS; IMPLEMENT PASS (cierre abajo). Continuación autorizada tras STOP H3.

## Alcance y contratos

Campañas de talento real. Añade vínculos explícitos a RN-AUTH y GenerationRecord ya
existentes, sin emitir/consumir tokens ni llamar a proveedores. Autoridad ejecutable sigue
en Connect/Higgsfield. AI no es necesaria en estas comprobaciones estructuradas.

029: campaign_evidence (campaign_id, kind AUTH/OUTPUT, evidence_id, added_by, created_at),
unicidad por campaña/kind/id. Evidence_id polimórfico validado en API; sin modificar tablas
PASS. Owner añade/retira, owner/employee lee, ajenos 404. Misma organización, activo
vinculado y grant seleccionado deben coincidir al añadir. Retirar no revoca ni borra evidencia
original. Revisión y auditoría transaccionales; duplicados idempotentes; bloqueo campaign.

API privada GET /campaigns/:id/flight devuelve preflight, outputs con postflight y proyecciones
de acuerdos/aprobaciones. POST /campaigns/:id/evidence {kind,evidence_id}; POST
/campaigns/:id/evidence/remove mismo body. Lecturas snapshot REPEATABLE READ. Lista de
evidencias acotada a 100 vínculos por campaña; al alcanzar límite, 409 explícito. No truncar
una comprobación global para presentarla como completa.

Preflight: clearance H3 completo + para cada talento al menos una autorización vinculada
actual ISSUED, firma verificada, payload/ledger/org/activo/grant/proveedor/fechas consistentes,
uso coincidente. RN-AUTH v0.1 expresa un territorio: campaña multiterritorio se marca
INCOMPLETE, no se infiere una unión de autorizaciones. Todos los vínculos se muestran con
su propio status; un token caducado no invalida otro vigente para el mismo talento. Un link
que ya no corresponde al talento/grant actual es STALE y bloquea hasta retirarse.

Postflight por output: payload GenerationRecord válido y binding con ledger, RN-AUTH
consumido con firma válida, reporte dentro de ventana de autorización, uso y proveedor
coincidentes. Expiración natural del token después del reporte no invalida esa evidencia.
Comprueba además cobertura H3 y grant vigente hoy. Si la campaña está en curso, evalúa
su ventana original al inicio (sin error de inicio pasado de H3) y la vigencia actual por
separado; fin de campaña alcanzado = DENY. No modifica el evaluador H3.

Status ALLOW/DENY/INCOMPLETE/REQUIRES_APPROVAL, precedence H3. ALLOW significa que estas
comprobaciones técnicas pasan, nunca legal clearance ni permiso nuevo. El fichero de salida
no se descarga ni se inspecciona: media_verified=false incluso si hay sha256 declarado.
No devolver firmas, payloads completos, uri privada, notes ni referencias de job privado.

UI: Producción con preflight/links AUTH; Outputs con links OUTPUT/postflight; Aprobaciones
con condiciones declaradas pendientes (sin botón aprobar); Licencias con referencias de
grants seleccionados, origen y vigencia. Sin conexiones inferidas por nombre.

## Pruebas y cierre

Fixtures propios, grants completos, RN-AUTH real sandbox, report_output existente. Comprobar
aislamiento/roles/retries/revisión, no mutación de tokens por lectura, consumo, revocación,
expiry antes/después del reporte, mismatch y vínculos obsoletos, campaña en curso y media no
verificada. UI/E2E + typecheck/lint/build. STOP H4 antes de Deal Builder.

## Corrección de evidencia H3

Vitest sobrescribe DATABASE_URL y exige TEST_DATABASE_URL. Los ensayos H3 descritos como
DB nueva usaron por error rightsnet_test. H4 repitió baseline con TEST_DATABASE_URL apuntando
a rightsnet_h3_clean_test: 207 PASS / 32 FAIL (239), antes de código H4. Predominan fallos
legacy CATEGORY_DENIED. Se conserva el detalle en work/h4-baseline-clean.log. No PASS global.

## Cierre H4 — 2026-09-10

SPECIFY → IMPLEMENT → MIGRATE → TEST → RUN → VERIFY → DOCUMENT → **STOP H4**.

- Migración 029 aplicada en DB local y test; reaplicación idempotente. Crea únicamente
  `campaign_evidence` (AUTH/OUTPUT, PK campaña/kind/evidence_id). Sin mutar RightsGrant,
  RN-AUTH, GenerationRecord ni tablas Connect/Higgsfield.
- API: `GET /v1/campaigns/:id/flight`, `POST …/evidence`, `POST …/evidence/remove`.
  Vínculos explícitos; lectura no mint/consume; límite 100 → 409; STALE bloquea;
  multiterritorio → INCOMPLETE; `media_verified=false`; sin firmas/URI/notes en respuesta.
- UI: pestañas Producción / Outputs / Aprobaciones / Licencias en detalle de campaña.
  Sin botón aprobar; Aprobaciones solo informativas.
- Tests focalizados H1–H4: 28/28 PASS (8 nuevos en `tests/campaign-flight.test.ts`).
- E2E H1–H4: 4/4 PASS (`tests/e2e/campaign-flight.spec.ts` + H1–H3).
- Typecheck, lint, build Next y diff-check: PASS (logs `work/h4-*-final.log`,
  build en `work/h4-manual-server.log`).
- Capturas: `docs/screenshots/campaign-flight-desktop.png` y
  `campaign-flight-mobile.png`.

Suite global post-código (DB compartida): 214 PASS / 33 FAIL (247). Baseline limpio
pre-código H4: 207 PASS / 32 FAIL. Fallos fuera de módulos Campaigns (Stripe mock,
integration, creator-lifecycle, rights-grants/ops, etc.); no se declara PASS global ni
causalidad solo por H4. Detalle: `work/h4-tests-final.log`, `work/h4-baseline-clean.log`.

H4 no emite autoridad ejecutable ni clearance legal. **STOP H4** antes de Deal Builder (H5).
H5 SPECIFY PASS: `docs/CAMPAIGN_DEAL_BUILDER_V0_1.md` (IMPLEMENT pendiente). H6 propuesto.
