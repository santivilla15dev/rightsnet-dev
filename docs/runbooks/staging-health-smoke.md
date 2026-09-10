# Staging health smoke

Tras arrancar API/web locales o un host staging:

```bash
# Local (defaults 4000 / 3000)
pnpm staging:health

# Host remoto
API_URL=https://api.staging.example WEB_URL=https://staging.example pnpm staging:health

# Solo API
STAGING_SKIP_WEB=1 API_URL=https://api.staging.example pnpm staging:health
```

Esperado: `status=ok`, entorno ≠ `production`, commerce ≠ `live_enabled`
(salvo `STAGING_ALLOW_LIVE_COMMERCE=1` deliberado).

Alcance: `docs/STAGING_HEALTH_SMOKE_V0_1.md`. No acredita piloto legal ni
live commerce.
