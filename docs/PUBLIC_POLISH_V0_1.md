# Public polish / Home trust v0.1

2026-09-10. SPECIFY **PASS**; IMPLEMENT **PASS**.

## Objetivo

Hacer que la superficie pública (home, nav anónima, tipografía, trust)
se sienta profesional y usable en móvil, sin claims de comercio live ni
clientes inventados como pagadores reales.

## Alcance v0.1

1. Asset hero estático `apps/web/public/home/hero-atmosphere.jpg` (atmósfera
   de marca; no generación in-product).
2. Nav anónima: solo Descubrir / Blog / Guía (+ Entrar / Crear cuenta); no
   rutas de workspace marca (campañas, talento, ops…).
3. Topbar home: links públicos + CTA «Encontrar creadores».
4. Tipografía pública vía `next/font` (sans + display), sin Arial por defecto.
5. Discover móvil: CTA «Cómo funciona» legible; lead no comprimido a 250px.
6. Home trust: testimonios **ilustrativos** etiquetados; FAQ corto; CTA en
   «Qué incluye»; nota territorios AT/DE + enlace verificación/guía.
7. Footer unificado (home + app) con Discover/Signup + stubs legales
   `/legal/privacy` y `/legal/terms` (copy provisional, no counsel).
8. Ficha creador: pasos 1–3 de licencia visibles (CSS `.license-steps`).

## No-claims

- No logos de marcas como clientes pagados.
- Testimonios = «Ejemplo de caso» / narrativa de producto.
- Sin `LIVE_COMMERCE_ENABLED`, sin `APP_ENV=production`.
- Stubs legales no sustituyen textos aprobados por counsel (`launch-gates`).

## Fuera de alcance

Redesign dashboard, CMS blog, MFA, commerce live, i18n EN, SEO avanzado.

## Criterios VERIFY

- Home muestra hero media, secciones trust/FAQ, topbar con Descubrir/Blog/Guía.
- Visitante sin sesión en `/discover` ve solo nav pública (sin Campañas/Ops).
- `/legal/privacy` y `/legal/terms` renderizan stubs.
- E2E home (+ nav anónima / legal) PASS; typecheck/lint web PASS.

## Cierre IMPLEMENT

- Hero estático `apps/web/public/home/hero-atmosphere.jpg`.
- Nav anónima = solo públicos; topbar home con Descubrir/Blog/Guía + CTA.
- Tipografía Source Sans 3 + Fraunces (`next/font`).
- Home: testimonios ilustrativos, FAQ, CTA en alcance, nota AT/DE.
- Footers unificados + `/legal/privacy` y `/legal/terms` stubs.
- Ficha creador: pasos 1–3 de licencia.
- Discover móvil: CTA legible.
- E2E: `tests/e2e/home.spec.ts` (home + nav anónima + legal).

**STOP** Public polish v0.1. Live/legal counsel OPEN.
