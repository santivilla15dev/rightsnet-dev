# RightsNet governing scope

Read `docs/RIGHTSNET_MVP_CONSTITUTION.md` before product or implementation work.
It is the governing MVP scope supplied by the founder. It supersedes conflicting
product assumptions in the earlier master development brief, not historical evidence.

Rights Core engine + dual-path purchase integration are **PASS**.
Auth Supabase v0.2 (email + Google/Apple, cuenta dual sin rol exclusivo, **no MFA**) is **PASS**.
Home pública + E2E §28 is **PASS**.
Marketplace UX v0.1 (product home + buyer path feel) is **PASS** —
see `docs/MARKETPLACE_UX_V0_1.md`.
Identity KYC v0.1 (sandbox + Stripe Identity port, **no live**) is **PASS** —
see `docs/IDENTITY_KYC_V0_1.md` (v0.1.1 adds document + matching selfie on Stripe hosted UI).
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
Overview/campaign **UI**: IMPLEMENT PASS (`docs/RIGHTS_OPERATIONS_UI_V0_1.md`).
Org-member access: `docs/RIGHTS_OPERATIONS_ORG_MEMBER_V0_1.md` — SPECIFY **PASS**;
IMPLEMENT **L1+L2+L3 PASS** (read owner/employee; write owner for Existing Deal ingest).
Rights Operations overview/campaign remain under `/v1/admin/rights-operations/*` with
`assertOpsReadAccess` / `assertOpsWriteAccess`.
Default local auth remains `AUTH_PROVIDER=sandbox` for agents/E2E; e2e forces sandbox on :3010/:4010.
**Uso de producto del founder** = `AUTH_PROVIDER=supabase` + keys + `NEXT_PUBLIC_SUPABASE_*` (ver `docs/runbooks/auth-supabase.md`).
Default identity remains `IDENTITY_PROVIDER=sandbox`.

Do **not** open MFA, voice, music, agents, public API platform, or live commerce in parallel
without an explicit next-milestone decision. RightsNet Connect v0.1 is partner-gated only
(`PLATFORM_API_ENABLED`); do not treat it as a public developer platform.

Follow SPECIFY → IMPLEMENT → MIGRATE → TEST → RUN → VERIFY → DOCUMENT → STOP.
Stop after each milestone; begin the next only after the preceding one works.
Preserve issued license, policy, consent, contract and financial snapshots. Never
rewrite historical ES territory grants to AT or reuse an incompatible schema version.
Austria and Germany are the proposed commercial pilot scope, not a claim of legal clearance.
Keep live commerce gated until the documented launch conditions are met.
