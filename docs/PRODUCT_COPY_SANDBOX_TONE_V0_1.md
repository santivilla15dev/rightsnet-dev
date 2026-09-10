# Product copy — tono sandbox v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

Tras `DEMO_UI_GATE`, la web de producto aún dice «Sandbox», «Entorno de
prueba» y «cuenta de prueba» en notas globales y home. Suena a playground
aunque el founder use Supabase + Stripe test.

## Alcance v0.1

1. `SandboxNote` → nota honesta sin etiqueta «Sandbox:» (pagos/KYC de prueba,
   licencias sin clearance legal).
2. `AuthRequired` → CTA de login de producto (no «acceso de prueba»).
3. Home footer, guía `/help`, etiquetas ops «Demo sandbox», «Pago sandbox».
4. Sin tocar lógica, flags live, ni copy interno de `/demo` (gated).

## Fuera de alcance

Textos legales aprobados, `LIVE_COMMERCE`, `APP_ENV=production`.

## STOP

Copy de producto más serio; honestidad de prueba conservada.

## Cierre IMPLEMENT

`SandboxNote` / `AuthRequired` / home / help / ops labels / checkout
pago simulado. Banda final home sin «Entorno de prueba» playground.
Sin lógica live.
