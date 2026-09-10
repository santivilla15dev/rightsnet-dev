# Staging host scaffold v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

El gate «host staging real» sigue OPEN. Hace falta un andamiaje
documentado (web vs API, región EU, env) sin fingir un deploy cloud.

## Alcance v0.1

1. Spec + runbook: web (Vercel EU) + API/worker/DB (host Node aparte).
2. `.env.staging.example` — plantilla sin secretos.
3. `apps/web/vercel.json` — hints de build monorepo (no despliega solo).
4. `pnpm product:ready` exige `demo_ui===false` en API (reinicio tras pull).

## Fuera de alcance

`vercel deploy` / provisionar Fly/RDS, DNS, certificados, live commerce,
`APP_ENV=production`.

## STOP

Andamiaje + runbook PASS; host cloud real OPEN (founder ejecuta).

## Cierre IMPLEMENT

Runbook + `.env.staging.example` + `apps/web/vercel.json` (fra1).
`product:ready` exige `demo_ui===false` en API. Host cloud OPEN.
