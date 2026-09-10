# Product ready local v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

Tras quitar demo UI, el founder necesita un chequeo único de que el
`.env` local está en modo **producto** (Supabase, demo off, live off)
sin confundirlo con CI sandbox.

## Alcance v0.1

1. `pnpm product:ready` — lee `.env` (sin imprimir secretos) y opcionalmente
   `GET $API_URL/v1/config`.
2. Exige: no `production`, no live commerce, `DEMO_UI_ENABLED` off,
   `AUTH_PROVIDER=supabase`, keys Supabase presentes.
3. Tests unitarios con `.env` temporal.
4. Extender higiene staging: `.env.example` con `DEMO_UI_ENABLED=false`;
   CI con `DEMO_UI_ENABLED=true`.

## Fuera de alcance

Host cloud, SMTP, `LIVE_COMMERCE_ENABLED=true`, `APP_ENV=production`.

## STOP

Script + tests PASS; staging cloud OPEN.

## Cierre IMPLEMENT

`pnpm product:ready` + tests product-ready; higiene staging incluye
`DEMO_UI_ENABLED` en example/CI.
