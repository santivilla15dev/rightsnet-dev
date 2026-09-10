# Ensayo humano founder v0.1 (producto local)

Guía para recorrer RightsNet **como producto** (Supabase + Stripe test),
sin modo demo. No es clearance legal ni comercio live.

## Antes (2 min)

```bash
pnpm product:smoke
# Si hace falta: pnpm api · pnpm worker · pnpm --filter @rightsnet/web start
```

Esperado: PASS (incl. `demo_ui=false` y worker).

Abre: http://localhost:3000

## A) Marca / comprador (~15–25 min)

1. **Signup** `/signup` → cuenta real (email Supabase).  
   Si “confirm email” está on en Supabase, confirma el correo.
2. **Welcome** → elige espacio **marca** → crea organización (`/company/setup`).
3. **Discover** `/discover` — debe listar creadores (seed local ~7).  
   Sin banner «MODO DEMO», sin chip «Entorno de prueba».
4. Abre p.ej. `/creators/ines-soler` o `/creators/lucia-martin` o `/creators/greta-vogel`.
5. **Configurar licencia** → campaña beauty, territorio AT o DE si aparece, canal Instagram.
6. **Comprobar derechos** → ALLOW o REQUIRES_APPROVAL (DENY en política/adult/gambling).
7. **Continuar** → login si hace falta → contrato provisional → checkout Stripe **test**.
8. Paga con tarjeta test Stripe (`4242…`). Espera «Confirmando…» / licencia.  
   Worker debe estar arriba. Anota `RN-LIC-…` si aparece.

Si algo falla: anota URL + mensaje; no actives `LIVE_COMMERCE_ENABLED`.

## B) Creador (~20–40 min, opcional el mismo día)

1. Misma cuenta o otra → Welcome → **creador** → `/onboarding` (7 pasos).
2. Identidad: Stripe Identity **test** o simulación según `IDENTITY_PROVIDER`.
3. Hasta **Approved** → **Publish** → `/dashboard`.
4. (Opcional) Con otra sesión marca, pide uso que requiera aprobación y aprueba en dashboard.

## Qué NO esperar

- Cobros live / payouts reales  
- Textos contractuales legales definitivos (siguen plantillas provisionales)  
- `/demo` como camino de producto  

## Evidencia

Marca en chat o nota: fecha + «buyer path PASS/FAIL» + «creator path PASS/FAIL» + captura Success si hubo licencia.

Modelo mental: `docs/RIGHTSNET_OFFICIAL_FLOW.md` · Prioridad: `docs/FOUNDER_PREP_NEXT_V0_1.md`.
