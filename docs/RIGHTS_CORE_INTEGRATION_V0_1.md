# Rights Core — Integration Migration Spec v0.1

Status: **HECHO (sandbox dual-path)** (2026-09-07). Engine acceptance PASS; purchase dual-path implemented and verified.  
Depends on: engine acceptance PASS (`docs/RIGHTS_CORE_V0_1.md`, `tests/rights-core-acceptance.test.ts`).  
Governing: `AGENTS.md`, MVP Constitution. Live commerce remains gated.
Flag: `RIGHTS_CORE_PURCHASES` (default false) forces new policies onto rights-policy/0.1; evaluation always branches by payload `schema_version`.

## Goal

Route **new** publish / request / approve / quote / issue paths through
`packages/domain/src/rights-core` while keeping every historical
`rightsnet.policy/0.1` snapshot, consent, contract and license hash readable and
byte-stable. ES→AT is never an automatic remap.

## Non-goals (this milestone)

- Auth Supabase, MFA, KYC, Stripe reensayo, live commerce.
- Rewriting issued licenses or order `policy_snapshot` rows.
- Forcing existing creators onto AT/DE overnight.
- AI parsers that invent ALLOW grants.

## Compatibility strategy

| Kind | Behavior |
|---|---|
| Legacy policy payload `rightsnet.policy/0.1` | Keep serving evaluateLicense for those assets until migrated |
| New policy payload `rightsnet.rights-policy/0.1` | Only evaluateRightsDecision |
| Mixed marketplace | Asset/policy row carries schema_version; API branches by version |
| Historical ES territories | Remain ES in stored JSON; UI may label “legacy territory” |
| New grants | Territories AT \| DE only |

Feature flag (proposed): `RIGHTS_CORE_PURCHASES=false` by default. When true, **new**
policies created after the flag must use rights-policy/0.1; legacy rows unchanged.

## Workstreams (order)

### 1. Persistence (MIGRATE)

- New migration(s): store rights-policy payloads in `policies.payload` (same table) with
  `schema_version` inside JSON; optional columns only if needed for indexing
  (`schema_version text GENERATED` or explicit column).
- Tables or columns for: safety assessments bound to `request_hash`; approval actions
  with request/policy/platform hashes (replace “approve → direct ALLOW” semantics);
  decision rows with `missing_fields` + four-way decision enum including `INCOMPLETE`.
- Constraints: reject unknown schema_version on write; never UPDATE historical payload/sha256.
- Passport: derive private projection from DB; public endpoint builds via
  `projectPublicPassport` allowlist only.

### 2. API wiring (IMPLEMENT)

Replace / dual-path in:

- `apps/api/src/modules/marketplace.ts` — publish/update policy validation
  (`RightsPolicySchema` + publication rules); consent must bind policy_id +
  `license_terms_version` (renewal when policy revision changes).
- `apps/api/src/modules/licensing.ts` — `createRequest` accepts draft or complete
  license-request/0.1; loads TrustedContext server-side; calls
  `evaluateRightsDecision`; persists decision + hashes.
- `approveRequest` — record ApprovalAction; **re-run** evaluator (never assign ALLOW
  solely from approve button).
- Quote / order / issue — `assertIssuanceAllowed`; fulfillment recheck with
  `checkStart: false`; keep acceptance-before-checkout.
- OpenAPI + web types for new request/decision shapes; legacy endpoints remain for
  old schema assets until sunset criteria exist.

### 3. Fixtures and seed

- Seed at least one creator asset with beauty/DE/30d rights-policy (AT unspecified).
- Keep existing ES demo creators on legacy schema for regression.
- No celebrity likeness; synthetic fixtures only.

### 4. TEST

- Unit: already covered by rights-core acceptance (keep green).
- Integration: createRequest → INCOMPLETE/ALLOW/DENY/REQUIRES_APPROVAL against DB.
- Approval re-evaluation; consent missing after policy revision; passport public
  scrub; issuance blocked without contract; legacy ES purchase path still works
  when flag off or asset still legacy.
- E2E smoke on legacy path must stay green; optional E2E for rights-core path behind flag.

### 5. VERIFY → DOCUMENT → STOP

- Update `docs/VERIFICATION.md` with integration PASS/FAIL evidence.
- Flip `RIGHTS_CORE_PURCHASES` only in sandbox after tests pass.
- **STOP** before Auth, Stripe live, or mass ES→AT migration tooling.

## Acceptance criteria (integration)

1. New rights-policy asset can complete sandbox loop to issued license using the new engine.
2. Legacy ES asset still purchases via evaluateLicense without hash drift.
3. approveRequest never bypasses evaluateRightsDecision.
4. Public passport never leaks private fields.
5. `pnpm test`, typecheck, lint green; e2e legacy smoke green.
6. Docs state clearly which schema each fixture uses.

## Explicit decisions (locked for this spec)

- Dual-path by policy `schema_version`, not a big-bang cutover.
- Default flag off; sandbox opt-in first.
- Platform baseline industries remain gambling/tobacco/political_advertising/adult.
- Fee math stays provisional 15% floor split until fiscal gate.

## Ready to IMPLEMENT?

Implemented 2026-09-07. Evidence: `tests/rights-core-integration.test.ts` + migration `012_rights_core_integration.sql`.
**STOP** before Auth Supabase, Stripe live, or mass ES→AT migration tooling.
