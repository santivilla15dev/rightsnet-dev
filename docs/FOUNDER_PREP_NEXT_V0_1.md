# Founder — próximos pasos (prep producto, no live)

2026-09-10. Cierre IMPLEMENT abajo.

## Ya listo en local (no rehacer)

- Demo UI off + copy de producto (`DEMO_UI_GATE`, `PRODUCT_COPY_*`)
- `pnpm product:ready` / `pnpm product:smoke`
- Scaffold staging: Vercel web + Docker/Fly API (`STAGING_*`)
- Auth Supabase + Stripe **test** en tu `.env`

Comando diario:

```bash
pnpm product:smoke
# + pnpm worker  (si el smoke avisa WARN worker)
```

## Prioridad sugerida (tú eliges uno)

| # | Qué | Por qué | Bloqueo |
|---|-----|---------|---------|
| 1 | **Ensayo humano** del flujo oficial (signup → discover → licencia test) | Valida producto real con tu cuenta Supabase | 30–60 min tuyos |
| 2 | **Host staging** (Vercel web + Fly/Docker API + Postgres EU) | URL compartible; scaffold ya escrito | Cuenta cloud + secretos |
| 3 | **Textos legales / IVA** (asesoría) | Sustituir plantillas DEMO | Founder + counsel |
| 4 | SMTP / email real | Tras outbox sandbox | Proveedor email |
| 5 | `LIVE_COMMERCE` / production | Solo tras gates en `launch-gates.md` | Legal + ops |

No hace falta más scaffolding de Docker/Vercel en código hasta que elijas **2**.

## Qué no hacer aún

- `APP_ENV=production`
- `LIVE_COMMERCE_ENABLED=true` en CI o default
- Afirmar piloto legal AT–DE listo
- `DB_RLS_BYPASS_DEFAULT=false` sin ensayo aislado

## Referencias

- Flujo: `docs/RIGHTSNET_OFFICIAL_FLOW.md`
- Humo: `docs/runbooks/product-smoke-manual.md`
- Staging: `docs/runbooks/staging-host-scaffold.md`
- Gates: `docs/launch-gates.md`
- Backlog abierto: `docs/BACKLOG_OPEN_WORK.md`

## Cierre IMPLEMENT

Doc + WARN worker en `product:smoke`. Decisiones 1–5 OPEN (founder).
