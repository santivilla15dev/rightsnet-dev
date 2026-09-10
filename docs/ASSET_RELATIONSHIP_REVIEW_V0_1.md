# Asset relationship human review v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT PASS (cierre abajo).

## Qué es

Antes de publicar, un admin debe confirmar que el creador es la persona de la
likeness (vínculo con el activo). No es KYC de identidad: es comparación visual
de la evidencia subida.

Estados:

- `assets.status`: `draft` → `pending_review` → (`draft` si aprueba | `rejected`)
- `assets.relationship_status`: `pending` → `reviewed` | `rejected`
- Publish exige `relationship_status=reviewed`

## Checklist operativo (revisor)

1. Abrir Admin → Verificación; filas `pending_review`.
2. Mirar la **evidencia** (imagen) junto al creador.
3. Comparar con el retrato / identidad esperada (sandbox: criterio explícito en motivo).
4. Aprobar solo si el vínculo es creíble; si no, rechazar con motivo ≥10 caracteres.
5. Tras aprobar, el creador puede publicar (si identity/adult/Connect listos).

## Alcance v0.1

- Preview de evidencia en Admin Verificación.
- `Content-Type` correcto en `GET /v1/files/:id` para previsualizar.
- Overview admin incluye `evidence_files`.
- Tests submit → review approve/reject.
- Runbook checklist en este doc + launch-gates.

## Fuera de alcance

Malware scan real, storage remoto, MFA admin, representantes,
`LIVE_COMMERCE_ENABLED`, clearance legal.

## STOP

Sandbox operable con preview + tests + docs. Validación founder: marcar gate
cuando haya ensayo humano anotado (no solo botón).

## Cierre IMPLEMENT

Preview evidencia en Admin Verificación; `GET /v1/files/:id` con mime image inline;
overview incluye `evidence_files`; `reviewAssetRelationship` exige fichero;
tests `tests/asset-relationship-review.test.ts`. Gate launch-gates: sandbox operable;
ensayo founder humano sigue pendiente de marcar.
