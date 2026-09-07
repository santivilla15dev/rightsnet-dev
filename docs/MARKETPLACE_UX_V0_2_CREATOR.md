# Marketplace UX v0.2 — Ficha creador

Status: **PASS** (extends Discover v0.2).

## Ficha pública

- URL: `/creators/{public_slug}` (p.ej. `/creators/lucia-martin`). UUID de asset sigue resolviendo.
- Mezcla **talento + derechos**: Sobre, Disponible para (AI vídeo/imagen, anuncios comerciales), Desde €, Aprobación típica.
- CTA **Configurar licencia** abre el formulario de uso. La marca define el uso antes de comprar; luego Rights Check.
- `public_slug` es un ID de marketing; licencias/contratos usan `asset_id` UUID.

## Configura tu uso (LICENSE INTENT)

- Panel **Configura tu uso**: creador / propósito / exclusividad en solo lectura; tipo, industria, territorio, canales, duración, fecha y nombre de campaña editables.
- CTA **Comprobar derechos** → `POST /v1/license-requests`.
- Producto: **LICENSE INTENT** = el `LicenseRequest` estructurado ya persistido en `requests` (no hay tabla `license_intents`).
- Propósito fijo: publicidad comercial. Exclusividad fija: ninguna.

## Rights Check

- Panel **Rights Check**: checklist de dimensiones del intent cuando `ALLOW`; precio y aprobación; **DECISIÓN RIGHTSNET**.
- `ALLOW` → ✓ **LICENSABLE** + **Continuar** (quote → order).
- `DENY` → ✕ **NO LICENSABLE** + Motivo. **Sin** Continuar / checkout (no se puede forzar).
- La checklist ✓ es presentación del intent aprobado, no un segundo motor de evaluación.

## Tres caminos (así de simple)

```
Rights Check
├── ALLOW → Checkout (Continuar en ficha)
├── REQUIRES_APPROVAL → Solicitud → Creador aprueba → Mis campañas → Completar licencia → Checkout
└── DENY → Stop
```

- En APPROVAL, la ficha explica los pasos y enlaza a Mis campañas → **Completar licencia**.
- En `/company`, solicitudes `ALLOW` muestran «{creador} aprobó…» + **Completar licencia**. Mientras esperan: “Esperando al creador”.

## Modelo oficial

Ver [`RIGHTSNET_OFFICIAL_FLOW.md`](./RIGHTSNET_OFFICIAL_FLOW.md): Discover/Configure/Rights Check sin cuenta; auth en Continuar; Approved ≠ Published.

## Onboarding creador (7 pasos)

Barra `1 ━ 2 ━ 3 ━ 4 ━ 5 ━ 6 ━ 7`: Perfil → Identidad → Likeness → **Derechos** (editor Rights Core en el alta) → Precio → Consentimiento → Revisión → `/application`.

## License Summary (antes de pagar)

- En `awaiting_acceptance`, la orden muestra primero **Resumen de licencia** (licenciatario, creador, uso, territorio, canales, duración, precio) — no el contrato largo.
- Copy: «Al continuar, aceptas la Licencia de likeness digital» + versión (`policy_snapshot.license_terms_version` o `v1.0`).
- **Ver términos completos** revela `contract_text` + `contract_hash` (la aceptación sigue atada al hash completo vía `POST …/acceptance`).
- Checkbox **Acepto los términos de la licencia** → CTA **Continuar al pago**.
- `GET /v1/orders/:id` incluye `organization_legal_name` (JOIN organizations).

## STOP

Sin galería multi-upload, sin SEO CMS, sin entidad intent nueva, sin saltar DENY, sin notificaciones, sin live commerce, sin nuevo texto legal ni quitar `contract_text`.
