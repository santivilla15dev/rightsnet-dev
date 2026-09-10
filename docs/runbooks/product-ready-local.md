# Product ready (local founder)

Antes de usar RightsNet como producto (Supabase + Stripe test):

```bash
pnpm product:ready
```

Comprueba `.env` (sin mostrar secretos):

- no `APP_ENV=production`
- `LIVE_COMMERCE_ENABLED` / `DEMO_UI_ENABLED` / `IDENTITY_LIVE_ENABLED` off
- `AUTH_PROVIDER=supabase` + keys públicas/privadas de proyecto

Si la API está arriba, también valida `GET /v1/config`.

Guía auth: [`auth-supabase.md`](auth-supabase.md) ·
alcance `docs/PRODUCT_READY_LOCAL_V0_1.md`.

No acredita host staging ni comercio live.
