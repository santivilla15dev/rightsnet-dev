# Demo UI gate v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

La web de producto muestra “modo demo” (`/demo`, banner, chip «Entorno de
prueba», CTA en login) aunque el founder ya usa `AUTH_PROVIDER=supabase`.
Eso confunde prep de producto con un playground.

## Alcance v0.1

1. Flag `DEMO_UI_ENABLED` (default **false**).
2. `GET /v1/config` expone `demo_ui: boolean`.
3. `/demo` y banner solo si `demo_ui`; sin flag → redirect `/login` y limpia
   marcador `demo-session`.
4. Chip «Entorno de prueba» eliminado del chrome de producto.
5. Login sandbox: CTA a `/demo` solo si `demo_ui`; si no, texto a configurar
   Supabase / flag interno.
6. Copy checkout: sin “DEMO” juguete; plantilla contractual provisional.
7. CI/E2E: `DEMO_UI_ENABLED=true` + `AUTH_PROVIDER=sandbox`.

## Fuera de alcance

`APP_ENV=production`, `LIVE_COMMERCE_ENABLED=true`, textos legales aprobados,
host staging cloud.

## STOP

Producto sin demo visible por defecto; E2E con flag. Live/production OPEN.

## Cierre IMPLEMENT

`DEMO_UI_ENABLED` (default false) + `demo_ui` en `/v1/config`; gate
`/demo`; sin chip «Entorno de prueba»; login CTA solo con flag; copy
checkout provisional. CI/E2E con flag on. Tests demo-ui-gate + clarity.
