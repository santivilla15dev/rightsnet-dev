# Rate limiting distributed v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`main.ts` usa un `Map` en proceso: con varias instancias API el límite
no se comparte (ADR sandbox / backlog).

## Alcance v0.1

1. Puerto `RateLimitPort.hit(key, limit, windowMs)`.
2. Provider `memory` (default CI) — misma semántica que hoy.
3. Provider `redis` opt-in (`RATE_LIMIT_PROVIDER=redis` + `REDIS_URL`) —
   `INCR` + `EXPIRE` vía RESP mínimo (sin cliente npm).
4. Middleware Express usa el puerto; umbrales: auth 60/min, api 1500/min.
5. Tests memoria + Redis mock; CI sin Redis.

## Fuera de alcance

Redis Cluster/Sentinel, sliding window sofisticado, per-user quotas,
cambiar umbrales de producto.

## STOP

Puerto + tests PASS; default memoria intacto.

## Cierre IMPLEMENT

`RateLimitPort` memory + redis RESP; middleware en `main.ts`.
Tests `rate-limit` 3/3. `RATE_LIMIT_PROVIDER=redis` + `REDIS_URL` opt-in.
