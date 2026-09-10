# Product smoke (founder, ~1 min)

## Automático

Con API + web arriba:

```bash
pnpm product:smoke
```

Equivale a `product:ready` + `staging:health` + asserts de `/v1/config`.

## Visual (navegador)

1. **Inicio** http://localhost:3000 — sin chip «Entorno de prueba»; pie sin «modo demo».
2. **Login** `/login` — correo/OAuth (Supabase); **no** botón «Ir a Demo».
3. **`/demo`** — redirige a login o no muestra el selector de personas.
4. **Discover** `/discover` — listado usable sin banner MODO DEMO.
5. (Opcional) Signup `/signup` — formulario real, no mensaje de playground.

Si algo falla: reinicia `pnpm api` / `pnpm dev` tras un pull.

Alcance: `docs/PRODUCT_SMOKE_MANUAL_V0_1.md`.
