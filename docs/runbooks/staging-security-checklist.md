# Staging deploy + seguridad v0.1

Checklist operativo y higiene del repo. **No** despliega cloud ni marca
piloto comercial listo.

## Cuándo usarlo

Antes de apuntar un host staging a Stripe test / Supabase / DB remota.
Complementa `docs/launch-gates.md` (fila «Despliegue staging y seguridad»).

## Higiene automática (repo)

```bash
pnpm staging:security
```

Comprueba:

- `.gitignore` ignora `.env` y `.local/`
- `.env.example` con `APP_ENV=sandbox` y flags live off
- CI (`.github/workflows/ci.yml`) con sandbox + `LIVE_COMMERCE_ENABLED=false`
- Sin `sk_live_` / `rk_live_` en archivos rastreados del árbol (excluye
  `node_modules`, `.local`, `work`, etc.)

## Checklist humana (founder)

Imprimida por el mismo comando. Resumen:

1. Región EU alineada con piloto AT–DE propuesto.
2. Secretos solo en el store del host.
3. HTTPS en `WEB_URL` / `API_URL`.
4. Entornos aislados (DB, Stripe test, Auth, storage).
5. `APP_ENV` ≠ `production` (`assertConfiguration` bloquea production).
6. Flags live off salvo ensayo aislado documentado.
7. CI verde en el commit desplegado.
8. Health checks alcanzables.
9. Claves de firma persistentes fuera del contenedor efímero.
10. Plan de backup/restore; PITR cloud OPEN.

## Qué no acredita

- Un despliegue real en Vercel/Fly/AWS.
- Clearance legal AT–DE.
- `LIVE_COMMERCE_ENABLED=true` o `APP_ENV=production`.
- KMS remoto, WORM cloud, PITR managed.

## Evidencia

Pegar salida de `pnpm staging:security` (Hygiene PASS) en el ticket o en
`docs/VERIFICATION.md` cuando se haga un ensayo de host staging real.
