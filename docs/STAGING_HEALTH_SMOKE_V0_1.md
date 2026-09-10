# Staging health smoke v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

La checklist de staging pide health alcanzable, pero no había un comando
único para probar `API_URL` / `WEB_URL` tras un deploy o en local.

## Alcance v0.1

1. Script `pnpm staging:health`:
   - `GET $API_URL/v1/health`
   - `GET $WEB_URL/api/health` (proxy Next → API), salvo `STAGING_SKIP_WEB=1`
2. Valida HTTP 2xx, `status=ok`, rechaza `environment=production`,
   rechaza `commerce=live_enabled` salvo `STAGING_ALLOW_LIVE_COMMERCE=1`.
3. Tests unitarios del evaluador (sin red).

## Fuera de alcance

Provisionar host cloud, TLS, secret stores, E2E completo.

## STOP

Script + tests PASS; host cloud staging sigue OPEN.

## Cierre IMPLEMENT

`pnpm staging:health` + runbook + tests staging-health 3/3.
Host cloud staging sigue OPEN.
