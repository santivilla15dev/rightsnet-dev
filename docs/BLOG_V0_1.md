# Blog RightsNet v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Objetivo

Explicar **qué es RightsNet** y **cómo ayuda** a marcas/agencias y creadores,
en narrativa pública, sin sustituir la guía operativa.

| Superficie | Rol |
| --- | --- |
| `/help` | Cómo usar el producto (pasos, FAQ) |
| `/blog` | Por qué existe y para quién ayuda |

## Alcance v0.1

1. Rutas públicas `/blog` (índice) y `/blog/:slug` (artículo).
2. Contenido estático en el repo (`apps/web/src/content/blog/`), español.
3. Cuatro artículos semilla (qué es, marcas, creadores, verificación).
4. Enlace «Blog» en nav pública (junto a Guía), pie de home, sin saturar el hero.
5. CTAs a `/discover` o `/signup?intent=…`; sin claims legales ni comercio live.

## Fuera de alcance

CMS, comentarios, RSS, newsletter, i18n EN, SEO avanzado, sustituir `/help`,
`APP_ENV=production`, `LIVE_COMMERCE_ENABLED`.

## STOP

Blog narrativo estático; guía `/help` intacta. Live/legal OPEN.

## Cierre IMPLEMENT

Rutas `/blog` + `/blog/:slug`; 4 posts tipados en
`apps/web/src/content/blog/posts.ts`; UI `blog.tsx`; nav pública + pie home;
E2E `tests/e2e/blog.spec.ts`. Sin CMS.
