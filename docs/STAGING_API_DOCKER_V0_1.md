# Staging API Docker / Fly scaffold v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

El scaffold de staging documentó web (Vercel) pero no había imagen ni
plantilla para API/worker en un host Node EU.

## Alcance v0.1

1. `deploy/Dockerfile` — imagen monorepo; `PROCESS=api|worker` (sin apps/web).
2. `deploy/fly.api.toml.example` + `deploy/fly.worker.toml.example` (región `fra`).
3. `deploy/docker-compose.staging.example.yml` — api+worker, Postgres externo.
4. `.dockerignore`.
5. Actualizar runbook staging-host + `.env.staging.example` notas.
6. `pnpm staging:api-dockerfile` — valida archivos (smoke sin `docker build`
   obligatorio; build real OPEN si no hay daemon).

## Fuera de alcance

`fly launch` / `docker push`, Postgres managed, secretos reales, live.

## STOP

Andamiaje API PASS; deploy cloud OPEN.

## Cierre IMPLEMENT

`deploy/Dockerfile` (api/worker only) + fly `fra` + compose example +
`.dockerignore` + `pnpm staging:api-dockerfile`. `docker build` real OPEN
(sin daemon en workstation de ensayo 2026-09-10).
