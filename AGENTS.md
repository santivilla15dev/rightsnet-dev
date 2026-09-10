# RightsNet governing scope

Read `docs/RIGHTSNET_MVP_CONSTITUTION.md` before product or implementation work.
It is the governing MVP scope supplied by the founder. It supersedes conflicting
product assumptions in the earlier master development brief, not historical evidence.

Rights Core engine + dual-path purchase integration are **PASS**.
Auth Supabase v0.2 (email + Google/Apple, cuenta dual sin rol exclusivo) is **PASS**.
Auth MFA v0.1 (Supabase TOTP, `MFA_ENABLED`): `docs/AUTH_MFA_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **PASS** (CI flag off; no live commerce).
Home pública + E2E §28 is **PASS**.
Marketplace UX v0.1 (product home + buyer path feel) is **PASS** —
see `docs/MARKETPLACE_UX_V0_1.md`.
Identity KYC v0.1 (sandbox + Stripe Identity port; test by default) is **PASS** —
see `docs/IDENTITY_KYC_V0_1.md` (v0.1.1 adds document + matching selfie on Stripe hosted UI).
Identity KYC **live** v0.1: `docs/IDENTITY_KYC_LIVE_V0_1.md` — SPECIFY **PASS**; IMPLEMENT **PASS**
(`IDENTITY_LIVE_ENABLED`; CI flag off; no live commerce).
Creator Rights Core publish editor v0.1 is **PASS** —
see `docs/CREATOR_PUBLISH_RIGHTS_CORE_V0_1.md`.
Official buyer/creator flow: `docs/RIGHTSNET_OFFICIAL_FLOW.md` (Discover sin cuenta; auth en Continuar; Approved ≠ Published; pago Success + RN-LIC; dashboard cards Fase 4).
RightsNet Connect (partner API foundation): `docs/RIGHTSNET_CONNECT_V0_1.md` — module
`platform` / `/v1/platform/*`; **not** Stripe Connect; requires `PLATFORM_API_ENABLED` + admin.
`check` = policy **preview** (compatible use?). `authorize_generation` decision v0.1 **PASS**
(ACTIVE RightsGrant → `AUTHORIZED` / `REQUIRES_APPROVAL` / `DENIED`).
RN-AUTH mint on AUTHORIZED: `docs/RN_AUTH_V0_1.md` — SPECIFY **PASS**; IMPLEMENT **PASS**
(`auth_token` signed + `generation_auths`; `auth_token: null` on deny/approval).
RN-AUTH partner verify: `docs/RN_AUTH_VERIFY_V0_1.md` — SPECIFY **PASS**; IMPLEMENT **PASS**
(`POST /v1/platform/verify-auth` read-only; no consume).
RN-AUTH partner revoke: `docs/RN_AUTH_REVOKE_V0_1.md` — SPECIFY **PASS**; IMPLEMENT **PASS**
(`POST /v1/platform/revoke-auth` ISSUED→REVOKED; no consume).
RN-AUTH partner list: `docs/RN_AUTH_LIST_V0_1.md` — SPECIFY **PASS**; IMPLEMENT **PASS**
(`GET /v1/platform/generation-auths` + `GET .../:id`; sin signature).
`report_output` / GenerationRecord: `docs/REPORT_OUTPUT_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **PASS** (`POST .../report-output` → record + consume auth).
Generation partner **list/GET**: `docs/GENERATION_READ_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **PASS**. Public generation **verify**: `docs/GENERATION_VERIFY_V0_1.md` —
SPECIFY **PASS**; IMPLEMENT **PASS** (`RN-GEN-…` + `/verify/generation/…`).
Higgsfield adapter: `docs/HIGGSFIELD_ADAPTER_V0_1.md` — sandbox IMPLEMENT **PASS**;
live L1 + Nest L2 + webhook L3 IMPLEMENT **PASS** (`docs/HIGGSFIELD_LIVE_V0_1.md`).
CI stays sandbox / mocked live (no network HF). Live keys only in env.
Rights Operations **UI**: `docs/RIGHTS_OPERATIONS_UI_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **PASS** (`/ops/rights`, `/ops/rights/campaign`).
Do not collapse preview vs executable authority.
RightsGrant: `docs/RIGHTS_GRANT_V0_1.md` — SPECIFY **PASS**; marketplace License→Grant
IMPLEMENT v0.1 **PASS**; Existing Deal structured ingest v0.1 **PASS**
(`external_agreements` → confirm → `EXISTING_AGREEMENT` grant).
Existing Deal files/OCR: `docs/EXISTING_DEAL_OCR_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **L1+L2+L3 PASS** (upload, sandbox+live extract, admin/owner ingest UI).
Existing Deal bulk CSV: `docs/EXISTING_DEAL_BULK_CSV_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **PASS** (`POST .../bulk-csv` → pending_confirm only; no auto-grant).
Existing Deal bulk confirm: `docs/EXISTING_DEAL_BULK_CONFIRM_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **PASS** (`POST .../bulk-confirm` → RightsGrant solo con IDs explícitos).
Marketplace and Existing Deal converge on RightsGrant; do not mutate public `RightsPolicy`
for bilateral deals. Do not confuse RightsGrant with Stripe Connect or Connect routes.
Rights Operations B2B: `docs/RIGHTS_OPERATIONS_V0_1.md` — SPECIFY **PASS**; read-model API
IMPLEMENT v0.1 **PASS** (`GET .../overview`, `POST .../campaign-query`).
Overview/campaign **UI**: IMPLEMENT PASS (`docs/RIGHTS_OPERATIONS_UI_V0_1.md`);
pending CTA overview→ingest **PASS** (`docs/OPS_OVERVIEW_PENDING_CTA_V0_1.md`).
Org-member access: `docs/RIGHTS_OPERATIONS_ORG_MEMBER_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **L1+L2+L3 PASS** (read owner/employee; write owner for Existing Deal ingest).
Rights Operations overview/campaign remain under `/v1/admin/rights-operations/*` with
`assertOpsReadAccess` / `assertOpsWriteAccess`.
Default local auth remains `AUTH_PROVIDER=sandbox` for agents/E2E; e2e forces sandbox on :3010/:4010.
**Uso de producto del founder** = `AUTH_PROVIDER=supabase` + keys + `NEXT_PUBLIC_SUPABASE_*` (ver `docs/runbooks/auth-supabase.md`).
Default identity remains `IDENTITY_PROVIDER=sandbox`.
Identity live requires `IDENTITY_LIVE_ENABLED=true` + `IDENTITY_PROVIDER=stripe`
(see `docs/IDENTITY_KYC_LIVE_V0_1.md`). Does **not** enable live commerce.
Live commerce L1 (technical gate): `docs/LIVE_COMMERCE_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **PASS** (`LIVE_COMMERCE_ENABLED`; CI flag off; no `APP_ENV=production`).

Do **not** open voice, music, agents, or public API platform in parallel
without an explicit next-milestone decision. Live commerce **legal** clearance
remains in `docs/launch-gates.md` (founder/counsel). RightsNet Connect v0.1 is
partner-gated only (`PLATFORM_API_ENABLED`); do not treat it as a public developer platform.

Follow SPECIFY → IMPLEMENT → MIGRATE → TEST → RUN → VERIFY → DOCUMENT → STOP.
Stop after each milestone; begin the next only after the preceding one works.
Preserve issued license, policy, consent, contract and financial snapshots. Never
rewrite historical ES territory grants to AT or reuse an incompatible schema version.
Austria and Germany are the proposed commercial pilot scope, not a claim of legal clearance.
Keep live commerce gated until the documented launch conditions are met.

Doc truth-sync (stale “not started” claims): `docs/DOC_TRUTH_SYNC_V0_1.md` — **PASS**.
Backlog abierto (pendiente para agentes): `docs/BACKLOG_OPEN_WORK.md`.

Campaigns H1: entidad de planificación por organización + brief + revisiones + actividad
implementadas y verificadas; `docs/CAMPAIGNS_V0_1.md`. DRAFT / NOT_EVALUATED, sin
autoridad ni conexiones inferidas a históricos. Tests H1 PASS; regresión global tiene
fallos previos documentados. **STOP H1** histórico; continuación H2 autorizada y cerrada abajo.

Campaign Talent H2: My Talent / Rights Inventory privado, filtros temporales/origen y
vínculos explícitos de talento/grant a campañas. Migración 027; docs/TALENT_INVENTORY_V0_1.md.
H2 funcional PASS; 14 tests focalizados + 2 E2E H1/H2 PASS, typecheck/lint/build PASS.
Regresión global 228 PASS / mismos 5 fallos previos. No concede autoridad ni evalúa
clearance; contratos PASS preservados. **STOP H2** histórico; continuación H3–H4 cerrada abajo.

Campaign Clearance H3: uso estructurado + score/status determinista por grant seleccionado,
sin unión de contratos ni RN-AUTH; `docs/CAMPAIGN_CLEARANCE_V0_1.md`. H3 funcional PASS:
20 tests focalizados y 3 E2E H1–H3 PASS, typecheck/lint/build PASS. Solo aplica a talento
humano real; un personaje íntegramente ficticio no requiere este flujo. Regresión global
233 PASS / 6 FAIL, todos fuera de H3 y documentados. **STOP H3** histórico; continuación H4
autorizada y cerrada abajo.

Campaign Flight H4: preflight/postflight + vínculos explícitos AUTH/OUTPUT a RN-AUTH y
GenerationRecord existentes, sin mint/consume ni inspección de media; migración 029;
`docs/CAMPAIGN_FLIGHT_V0_1.md`. H4 funcional PASS: 28 tests focalizados H1–H4 y 4 E2E
PASS, typecheck/lint/build PASS. Regresión global 214 PASS / 33 FAIL (baseline limpio
pre-H4 207/32), fallos fuera de Campaigns y documentados. No concede autoridad ejecutable
ni clearance legal. **STOP H4**.

Campaign Deal Builder H5: gaps estructurados + borrador/envío/retiro de solicitud
humana sin autoactivar permisos; migración 030; `docs/CAMPAIGN_DEAL_BUILDER_V0_1.md`.
H5 funcional PASS: 32 tests focalizados H1–H5 y 5 E2E PASS, typecheck/lint PASS.
No muta grants ni concede autoridad. **STOP H5**.

Campaign Passport H6: resumen técnico compartible con allowlist, caducidad y
revocación (`RN-PAS-…`); migración 031; `docs/CAMPAIGN_PASSPORT_V0_1.md`. H6
funcional PASS: 35 tests focalizados H1–H6 y 6 E2E PASS, typecheck/lint PASS.
Sin autoridad ejecutable ni clearance legal. **STOP H6**.

Org buyers AT: domicilio org `AT|DE|ES` (CHECK 014 + contratos OpenAPI + seed demo
AT); `docs/ORG_BUYERS_AT_V0_1.md`. **PASS**; no remap ES→AT de grants.

Connect country AT/DE: `identity.country` para cuentas Connect nuevas desde
`creators.location` o `CONNECT_DEFAULT_COUNTRY` (default `at`);
`docs/CONNECT_COUNTRY_AT_DE_V0_1.md`. **PASS** código/mocks; no remap de `acct_`
existentes.

Stripe money/recon gaps: compare paginado, reversión parcial, relink charge_ref;
`docs/STRIPE_MONEY_RECON_GAPS_V0_1.md`. **PASS** mocks.

Thin v2 recovery + fees/multi-account: `docs/STRIPE_THIN_FEES_MULTI_V0_1.md`.
**PASS** mocks (migración 032); reensayo founder R1–R5 **PASS*** 2026-09-10.

Asset relationship review v0.1: preview evidencia admin + tests;
`docs/ASSET_RELATIONSHIP_REVIEW_V0_1.md`. **PASS** código; ensayo humano founder opcional.

Storage + scan v0.1: `docs/STORAGE_SCAN_V0_1.md`. **PASS** sandbox (local + EICAR).
DB roles v0.1: `docs/DB_ROLES_TENANCY_V0_1.md`. **PASS** migrator≠`rightsnet_app`.
DB RLS org pilot v0.1: `docs/DB_RLS_V0_1.md` — SPECIFY **PASS**; IMPLEMENT **PASS**
(FORCE en organizations/members/campaigns; bypass runtime por defecto; cableado
progresivo `withRlsActor`: Campaigns H1 **PASS** `docs/DB_RLS_CAMPAIGN_WIRING_V0_1.md`;
H2–H6 **PASS** `docs/DB_RLS_CAMPAIGN_H2_H6_WIRING_V0_1.md`; Rights Ops **PASS**
`docs/DB_RLS_OPS_WIRING_V0_1.md`; grants/external **PASS**
`docs/DB_RLS_GRANTS_EXTERNAL_V0_1.md`; más tablas OPEN).
