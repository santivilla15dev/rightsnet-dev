# Marketplace UX v0.2 — Discover

Status: **PASS** (extends v0.1).

## Discover

- Título: **Encuentra talento IA licenciable**.
- CTA de card: **Ver derechos** → `/creators/:id` (no “Ver perfil”).
- Filtros cableados a `GET /v1/search`: gender, age_band, language, location, category (industria), ai_usage (`synthetic_image`|`synthetic_video`), territory, duration, max_price, approval, q.
- Facets `creators.gender` / `creators.age_band`: **declarativos** para discovery; no son KYC. `adult_verified` sigue siendo el gate de publicación.
- Territorio de filtro = scope de **policy de licencia**, no el domicilio de la organización compradora.

## v0.1 (sigue vigente)

Ver [`MARKETPLACE_UX_V0_1.md`](./MARKETPLACE_UX_V0_1.md) para home, cuenta dual y Create company.

## STOP

Sin Elasticsearch, sin DOB exacto, sin live commerce.
