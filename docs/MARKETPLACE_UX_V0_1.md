# Marketplace UX v0.1

Status: **PASS**.

## Goal

Make the public buyer path feel like a talent marketplace (discover → license → verify),
not a developer demo hub.

## Changes

- `/` product home: hero con dos caminos (Encontrar creadores → `/discover` sin auth; Licenciar tu likeness → `/signup?intent=creator` solo preselecciona el chooser `/welcome` tras el alta, sin fijar rol DB), login secundario, enlace ligero agencias/marcas → `/help`, más Cómo funciona + audiencias + qué incluye la licencia + nota de entorno.
- Cuenta dual: registro sin rol; post-signup `/welcome` elige primer espacio. Marca: Create company (`/company/setup` → `/company/ready` → `/discover`). Capacidades por `has_creator` + organizations. País de org = domicilio (AT/DE/ES), no territorio de licencia de campaña.
- Hero visual: static design asset at `apps/web/public/home/hero-atmosphere.jpg` (brand atmosphere for full-bleed hero). Produced offline with a design tool; **not** an in-product generative feature and **not** wired to any image/video generation API.
- Sandbox demo accounts remain on `/login` (labeled “Cuentas de demostración”) and are pointed from `/help`.
- Creator detail shows license steps 1–3; order/checkout copy aligned to contrato → pago → licencia.
- Discover v0.2: ver [`MARKETPLACE_UX_V0_2_DISCOVER.md`](./MARKETPLACE_UX_V0_2_DISCOVER.md) (filtros wireframe + CTA Ver derechos).
- Ficha creador: slug público (`/creators/lucia-martin`), resumen talento+derechos, CTA **Configurar licencia** antes del Rights Check. Ver [`MARKETPLACE_UX_V0_2_CREATOR.md`](./MARKETPLACE_UX_V0_2_CREATOR.md).

## STOP

No MFA, no live commerce. Signup email/password (marca|creador) está habilitado con `AUTH_PROVIDER=supabase`.
No Higgsfield (or other) generation API in RightsNet backend; no user-facing “generate image/video” UI.
