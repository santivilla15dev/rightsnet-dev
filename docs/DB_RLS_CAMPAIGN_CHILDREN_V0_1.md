# DB RLS campaign children v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`campaigns` ya tiene FORCE RLS, pero las tablas hijas H2–H6
(`campaign_talent`, `campaign_evidence`, `campaign_deal_requests`,
`campaign_passports`) no. Un actor RLS podría leer vínculos de otra org
si el filtro de aplicación fallara.

## Alcance v0.1

Migración `037_rls_campaign_children.sql`:

| Tabla | Visibilidad |
|-------|-------------|
| `campaign_talent` | miembro de `campaigns.organization_id` vía `campaign_id` |
| `campaign_evidence` | idem |
| `campaign_deal_requests` | `app_is_org_member(organization_id)` |
| `campaign_passports` | idem |

`app_is_org_member` incluye bypass/admin → pool default, worker y verify
público por token (lookup con bypass) siguen OK.

## Fuera de alcance

- `campaign_passport_seq` (contador interno)
- FORCE en `orders` / quotes / ledger / outbox
- `DB_RLS_BYPASS_DEFAULT=false`

## STOP

Policies + test `rightsnet_app` PASS; tests H2–H6 focalizados no regresan.

## Cierre IMPLEMENT

Migración `037_rls_campaign_children.sql`. `db-rls` 4/4 + H1–H6 focalizados
35/35 PASS. Verify público passport sigue con bypass de pool.
