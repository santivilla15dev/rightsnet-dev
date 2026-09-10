# Staging host scaffold (sin deploy automático)

RightsNet no es una sola app serverless: **web** (Next) + **API Nest** +
**worker** + **Postgres** (+ firmas/uploads).

## Arquitectura recomendada v0.1

| Pieza | Host sugerido | Notas |
|-------|---------------|--------|
| Web | Vercel (región **EU**/Frankfurt) | Proyecto con Root Directory `apps/web` o build monorepo |
| API + worker | Fly.io / Railway / VM EU | Proceso Node largo; no meter Nest en Vercel Functions |
| Postgres | Neon / RDS / Supabase DB EU | Separado de prod futura; ensayo `pnpm db:backup-drill` local sigue válido |
| Auth | Mismo proyecto Supabase o uno **staging** | Redirect URLs del host HTTPS |
| Stripe | **test** keys | `LIVE_COMMERCE_ENABLED=false` |

## Plantilla env

Copia [`.env.staging.example`](../../.env.staging.example) al secret store
del host (nunca a Git).

## Web en Vercel (manual)

1. Crear proyecto Vercel en equipo EU.
2. Root Directory: `apps/web` **o** usar `apps/web/vercel.json` desde monorepo.
3. Env: `API_URL=https://api.staging…`, `NEXT_PUBLIC_SUPABASE_*`, `WEB_URL=https://…`.
4. Deploy preview/staging. Comprobar: `WEB_URL` + `pnpm staging:health` con esas URLs.

## API (manual, otro host)

1. Build: `pnpm install --frozen-lockfile && pnpm build` (o image Docker propia).
2. Procesos: `pnpm api` y `pnpm worker` (o equivalentes).
3. `DATABASE_URL`, `MIGRATE_DATABASE_URL`, claves `.local/keys` montadas o
   volumen; `DEMO_UI_ENABLED=false`; `AUTH_PROVIDER=supabase`.
4. Migraciones: `pnpm db:migrate` con rol migrator.

## Checklist post-deploy

```bash
API_URL=https://api… WEB_URL=https://… pnpm staging:health
pnpm product:ready   # local .env founder; no sustituye secrets del host
pnpm staging:security
```

## Qué no hace este scaffold

No ejecuta `vercel`/`fly` por ti. No acredita piloto legal ni live.

Alcance: `docs/STAGING_HOST_SCAFFOLD_V0_1.md`.
