# Product smoke manual v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

Tras demo gate + product:ready, el founder necesita un humo corto
(automático + checklist visual) antes de usar el stack local como producto.

## Alcance v0.1

1. `pnpm product:smoke` = `product:ready` + `staging:health` + assert
   `GET /v1/config` (`demo_ui=false`, `auth=supabase`, live off).
2. Runbook checklist visual ~1 min (home / login /demo / discover).
3. Copy signup sandbox alineado (sin empujar a demo si está off).

## Fuera de alcance

E2E Playwright completo, deploy cloud, live commerce.

## STOP

Script + runbook PASS; host staging cloud OPEN.

## Cierre IMPLEMENT

`pnpm product:smoke` + runbook visual; signup sandbox copy alineado.
