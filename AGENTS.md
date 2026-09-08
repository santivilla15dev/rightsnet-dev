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
`check` = policy **preview** (compatible use?). Future `authorize_generation` = executable
authority via ACTIVE **RightsGrant** (SPECIFY in Connect doc; IMPLEMENT **not started**;
no RN-AUTH yet). Do not collapse the two questions.
RightsGrant: `docs/RIGHTS_GRANT_V0_1.md` — SPECIFY **PASS**; marketplace License→Grant
IMPLEMENT v0.1 **PASS**; Existing Deal structured ingest v0.1 **PASS**
(`external_agreements` → confirm → `EXISTING_AGREEMENT` grant). File/OCR upload and
post-Grant trunk (`authorize_generation` IMPLEMENT / RN-AUTH / `report_output`) are
**not started**. Marketplace and Existing Deal converge on RightsGrant; do not mutate
public `RightsPolicy` for bilateral deals. Do **not** open generation APIs without an
explicit next-milestone decision. Do not confuse RightsGrant with Stripe Connect or
Connect routes.
Rights Operations B2B: `docs/RIGHTS_OPERATIONS_V0_1.md` — SPECIFY **PASS**; read-model API
IMPLEMENT v0.1 **PASS** (`GET .../overview`, `POST .../campaign-query`, admin-only).
Overview/campaign **UI**, org-member access, and `authorize_generation` are **not started**.
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
