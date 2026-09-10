# H6 — Campaign Passport

2026-09-10. SPECIFY PASS; implementación pendiente. Continuación autorizada tras STOP H5.

## Alcance y contratos

El **Campaign Passport** es una vista **compartible y acotada** del estado técnico de una
campaña (clearance H3 + flight H4 + solicitudes H5 en resumen), dirigida a terceros
autorizados por allowlist — sin exponer datos comerciales privados, sin firmas RN-AUTH,
sin URI de media, sin notes internas, y **sin promesa de validez legal**.

Solo campañas de talento humano real (mismo límite H1–H5). Un personaje íntegramente
ficticio no usa este flujo. AI no genera el passport: se ensambla con lecturas
deterministas ya existentes y se reevalúa en cada consulta pública.

### Qué es

- Token público opaco `RN-PAS-YYYY-######` (o UUID firmado interno + etiqueta pública)
  emitido por el **owner** de la org.
- Allowlist explícita de destinatarios (emails o org ids normalizados; máx. 20).
  Sin allowlist abierta al mundo: v0.1 **exige** al menos un destinatario o un flag
  `link_open=false` por defecto. Un modo `link_open=true` solo si el founder lo
  confirma en IMPLEMENT; el SPECIFY asume **allowlist obligatoria**.
- Caducidad (`expires_at`) obligatoria, máx. 30 días desde emisión; revocación
  inmediata por owner (`REVOKED`).
- Lectura pública `GET /v1/public/campaign-passports/:token`: recalcula clearance y
  flight en el instante (como H3/H4); no sirve un snapshot congelado como “verdad
  vigente” salvo campos de metadatos del passport (quién emitió, expires, revoked).
- Resumen: nombre de campaña (o alias), estados agregados ALLOW/DENY/INCOMPLETE/
  REQUIRES_APPROVAL de clearance/preflight/postflight, score H3, conteo de talentos,
  flags `authority:false`, `media_verified:false`, `legal_clearance:false`, y si hay
  solicitudes H5 `SENT` abiertas (conteo, sin notas ni desired_usage).

### Qué no es

- No es licencia, RightsGrant, RN-AUTH ni GenerationRecord.
- No es clearance legal ni certificación de compliance.
- No sustituye verify de generación (`RN-GEN-…`) ni de licencia (`RN-LIC-…`).
- No expone brief completo, precios, payouts, PII de creadores más allá del
  `display_name` ya visible en clearance privado, ni evidencia IDs crudos si el
  recipient no está en la org (mostrar solo conteos / status).

## Modelo de datos (migración aditiva propuesta 031)

`campaign_passports`:

| Columna | Notas |
|---------|--------|
| `id` | uuid PK |
| `campaign_id` | FK campaigns |
| `organization_id` | denormalizado |
| `public_token` | text unique `RN-PAS-…` |
| `status` | `ACTIVE` \| `REVOKED` \| `EXPIRED` (EXPIRED puede derivarse en lectura) |
| `allowlist` | jsonb array de `{ type: 'email'\|'org', value }` normalizado |
| `expires_at` | timestamptz NOT NULL |
| `revoked_at` | timestamptz null |
| `created_by` / `revoked_by` | users |
| `created_at` / `updated_at` | timestamptz |
| `label` | text 0–80, opcional (ej. “Partner review”) |

Índice `(campaign_id, status)`, unique `public_token`. Máx. 10 passports ACTIVE por
campaña. Revocar no borra fila. Sin backfill.

## API

Privada (owner write; owner/employee read; ajenos 404):

- `GET /v1/campaigns/:id/passports` — lista
- `POST /v1/campaigns/:id/passports` — emitir (`allowlist`, `expires_at` ≤ +30d,
  `label?`; Idempotency-Key). Audita `campaign.passport_issued`.
- `POST /v1/campaigns/:id/passports/:passportId/revoke` — ACTIVE→REVOKED.
  Idempotente si ya REVOKED.

Pública (sin auth de sesión):

- `GET /v1/public/campaign-passports/:token` — si token inválido/revocado/caducado →
  404 genérico (no filtrar existencia a atacantes). Si allowlist no vacía: v0.1 **no**
  autentica al lector por email (sin magic link aún); el token es el secreto.
  Allowlist queda registrada para auditoría y para H6.1 (notificación / acceso
  acotado). Documentar este límite: el secreto del enlace = acceso de lectura del
  resumen; rotar/revocar ante fuga.

Respuesta pública mínima (strict allowlist de campos): `token`, `status`,
`evaluated_at`, `expires_at`, `campaign` `{ id, name }`, `clearance` `{ status, score }`,
`preflight.status`, `postflight.status`, `talent_count`, `open_deal_requests`,
`flags` `{ authority, media_verified, legal_clearance }` todos false salvo conteos.
Sin firmas, gaps detallados, notes, evidence ids, usage completo.

## UI

- Sección **Passport** en detalle de campaña (owner): emitir, ver caducidad, copiar
  enlace `/verify/campaign-passport/:token`, revocar.
- Página pública de verify (estilo generation-verify): disclaimer fijo en español:
  “Resumen técnico de comprobaciones RightsNet. No constituye autorización legal ni
  permiso de uso.”
- Activity: `passport_issued` / `passport_revoked`.

## Pruebas y cierre (cuando se implemente)

Roles, límite 10, caducidad, revocación, 404 genérico, payload sin campos prohibidos,
reevaluación tras cambiar usage/talent, typecheck/lint/build, E2E emitir→abrir
público→revocar→404. Documentar regresión global. **STOP H6** — no abrir notificaciones
email ni portal licensor en la misma entrega.

## Límites y riesgos

El token compartido es un secreto de lectura. Allowlist sin enforcement de identidad
en v0.1 reduce el valor de la allowlist a registro + UX; H6.1 puede añadir magic link
o auth de destinatario. RLS y gates live siguen pendientes. No afirmar clearance AT–DE.
