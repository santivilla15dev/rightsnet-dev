# Staging API Docker / Fly scaffold v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

El scaffold de staging documentó web (Vercel) pero no había imagen ni
plantilla para API/worker en un host Node EU.

## Alcance v0.1

1. `deploy/Dockerfile` — imagen monorepo; `PROCESS=api|worker`.
2. `deploy/fly.api.toml.example` + `deploy/fly.worker.toml.example` (región `fra`).
3. `.dockerignore`.
4. Actualizar runbook staging-host + `.env.staging.example` notas.
5. `pnpm staging:api-dockerfile` — valida que el Dockerfile existe y el
   target `PROCESS` está documentado (smoke sin `docker build` obligatorio).

## Fuera de alcance

`fly launch` / `docker push`, Postgres managed, secretos reales, live.

## STOP

Andamiaje API PASS; deploy cloud OPEN.

## Cierre IMPLEMENT

`deploy/Dockerfile` + fly `fra` examples + `.dockerignore` +
`pnpm staging:api-dockerfile`. Deploy cloud OPEN.
