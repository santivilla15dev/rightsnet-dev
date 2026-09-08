# RightsGrant v0.1 — domain concept (SPECIFY)

**Status:** SPECIFY **PASS** — documentation only  
**Date:** September 2026  
**IMPLEMENT:** not started (see STOP)

This document fixes the missing middle object between creator willingness (policy),
legal evidence (agreement / license), and what AI platforms must read at generation time.

It does **not** add SQL, Zod schemas, or API routes. Runtime remains Policy → Request →
License as implemented today.

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md`.  
Connect surface today: `docs/RIGHTSNET_CONNECT_V0_1.md` (policy-based `check` only).

---

## 1. Three concepts

| Concept | Question it answers | Today in code | Role |
|---------|---------------------|---------------|------|
| **RightsPolicy** | What is the creator willing to allow *in general*? | `policies` + `RightsPolicy` (`packages/domain/src/rights-core/schemas.ts`) | Pre-transaction / Discover / Rights Check |
| **Agreement / License** | What legal evidence did two parties agree? | Marketplace: `orders` + `contract_*` + `licenses`. External agreements: **not built** | Immutable legal evidence |
| **RightsGrant** | What is *this* party currently authorized to do, machine-readable? | **Does not exist** | What Connect / AI should consult for bilateral authority |

### Anti-examples (do not do this)

- **Wrong:** Nike signs with Cristiano → set `Sportswear = ALLOW` on Cristiano’s public policy.  
  Adidas would then look allowed under the same general policy.
- **Wrong:** Treat a signed License payload as the only Connect input without a grantee-scoped grant.  
  Public policy check answers “could someone buy this use?”, not “is Nike already authorized?”
- **Wrong:** Collapse Grant into GenerationRecord.  
  Grant = authority; GenerationRecord (future) = that a specific output used that authority.

### Golden rule (Nike vs Adidas)

Cristiano’s **policy** may say Sportswear → `REQUIRES_APPROVAL`.  
Nike has a **bilateral** deal. Create a **RightsGrant** Nike → Cristiano.  
Do **not** rewrite the general policy to `ALLOW`.

```text
Nike → Cristiano     ✓ RightsGrant ACTIVE exists
Adidas → Cristiano   ✕ no RightsGrant for that pair
```

Conceptual acceptance test: any design that would make Adidas inherit Nike’s sportswear
allowance by mutating policy **fails** this milestone’s intent.

---

## 2. Two paths to the same RightsGrant

Both paths must end in a **RightsGrant**. They must not end only in a mutated policy.

```text
                    RIGHTSNET

           ┌────────────┴────────────┐
           │                         │
           ▼                         ▼
    NUEVO ACUERDO              ACUERDO EXISTENTE
    Marketplace                 Brand + Talent
           │                         │
    Creator Policy              Upload Contract
           │                         │
      Rights Check              Extract Rights
           │                         │
       Purchase                  Human Review
           │                         │
    RN License                       │
    (Agreement)                      │
           └────────────┬────────────┘
                        ▼
                   RIGHTS GRANT
                        │
                        ▼
                Machine-readable
                     rights
                        │
                        ▼
                RightsNet Connect
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
       Higgsfield     Runway       Adobe
                        │
                        ▼
                   Generation
                        │
                        ▼
                  Report Output
                  (future GenerationRecord)
```

| Path | Source of truth before Grant | Grant `source.type` (v0.1 draft) |
|------|------------------------------|----------------------------------|
| New agreement (marketplace) | Active `RightsPolicy` → check → purchase → issued `License` | `MARKETPLACE_LICENSE` |
| Existing agreement | Uploaded contract → extract → **human review** → external agreement record | `EXISTING_AGREEMENT` |

---

## 3. Canonical shape (data-contract draft — not Zod/SQL yet)

Illustrative IDs (`RG_*`, `PERSON_*`, …) are **product language**, not current DB primary keys.
When IMPLEMENT lands, map to UUIDs (`users` / `organizations` / `assets` / `licenses` / future
`agreements`).

```json
{
  "schema_version": "rightsnet.rights-grant/0.1-draft",
  "grant_id": "RG_839201",
  "grantor": "PERSON_CR7",
  "grantee": "ORG_NIKE",
  "asset": "AST_CR7_LIKENESS",
  "source": {
    "type": "EXISTING_AGREEMENT",
    "id": "AGR_8392"
  },
  "rights": {
    "synthetic_video": "ALLOW",
    "synthetic_image": "ALLOW",
    "commercial_advertising": "ALLOW"
  },
  "industry": ["sportswear"],
  "territories": ["WORLDWIDE"],
  "approval": {
    "creative_approval": "REQUIRED"
  },
  "valid_from": "2026-01-01T00:00:00.000Z",
  "valid_until": "2027-12-31T23:59:59.000Z",
  "status": "ACTIVE"
}
```

Marketplace projection example (same shape, different source):

```json
{
  "schema_version": "rightsnet.rights-grant/0.1-draft",
  "grant_id": "RG_FROM_LICENSE",
  "grantor": "<creator_user_or_person_ref>",
  "grantee": "<orders.organization_id>",
  "asset": "<orders.asset_id>",
  "source": {
    "type": "MARKETPLACE_LICENSE",
    "id": "<licenses.id>"
  },
  "rights": {},
  "industry": [],
  "territories": [],
  "approval": {},
  "valid_from": "<license starts_at>",
  "valid_until": "<license ends_at>",
  "status": "ACTIVE"
}
```

Field notes for IMPLEMENT later:

- `rights` / `industry` / `territories` / `approval` should be derived from frozen order
  `scope` + policy snapshot for marketplace grants — never from “current” creator policy alone.
- `status` lifecycle (draft idea): `ACTIVE` | `SUSPENDED` | `EXPIRED` | `REVOKED`.
- Grant is **not** a second signed license blob; it is the operational authorization view.

---

## 4. Projection from today’s marketplace (conceptual)

Current chain (already shipped):

1. `requests` (org + asset + usage + decision)  
2. `quotes` → `orders` (`organization_id`, `asset_id`, `scope`, `policy_snapshot`, contract hashes)  
3. `licenses` (1:1 `order_id`, signed `rightsnet.license/0.1` payload)

See [`packages/db/migrations/001_core.sql`](../packages/db/migrations/001_core.sql) and issuance in
[`apps/api/src/modules/payments.ts`](../apps/api/src/modules/payments.ts) (`issueLicenses`).

**Projection rule (SPECIFY):**

> When a marketplace License becomes issued/active, RightsNet **shall** (in a future IMPLEMENT
> milestone) upsert a RightsGrant with `source.type = MARKETPLACE_LICENSE`, grantee =
> `orders.organization_id`, asset = `orders.asset_id`, validity from license scope, without
> rewriting `policies.payload`.

Until that IMPLEMENT milestone, Connect and the engine continue to use policy + license verify
as today. This doc only defines the target model.

---

## 5. Existing-agreement path (conceptual only)

Not built. Intended v0 states:

```text
uploaded → extracted → human_reviewed → grant_active
```

| State | Meaning |
|-------|---------|
| `uploaded` | Contract file / metadata stored; no machine authority yet |
| `extracted` | Candidate rights fields proposed (tooling may assist; not binding) |
| `human_reviewed` | Operator/legal confirms extraction against the agreement |
| `grant_active` | RightsGrant `ACTIVE` with `source.type = EXISTING_AGREEMENT` |

**Human review is mandatory** before `grant_active` in v0.  
No public API for upload/extract in this SPECIFY milestone. No automatic mutation of
`RightsPolicy` from an external deal.

---

## 6. How RightsNet Connect should evolve (design only — not implemented)

**Today (Connect v0.1):**  
`POST /v1/platform/check` → `previewRightsCheck` → evaluates against the creator **policy**
(and related preview rules). Partner-gated; `preview: true`. See
`docs/RIGHTSNET_CONNECT_V0_1.md`.

**Future (after RightsGrant IMPLEMENT + explicit Connect milestone):**

1. Resolve **grantee** (partner org) + **asset** + requested **use**.  
2. If an **ACTIVE** RightsGrant matches (grantee, asset, time window, use dimensions) →  
   authorize under that grant (including `approval` constraints such as creative approval).  
3. Else → fall back to marketplace policy preview **or** DENY, per product rules decided in
   that milestone (do not invent dual engines).  
4. Still **must not** duplicate Rights Core evaluation logic for the policy path.

**This SPECIFY milestone does not change** `/v1/platform/search` or `/v1/platform/check`.

Generation / `report_output` / GenerationRecord remain later constitution items, fed by Grant
authority — not replacements for Grant.

---

## 7. Invariants (constitution-aligned)

1. **Snapshots stay frozen.** Changing policy tomorrow must not rewrite yesterday’s contract,
   license, or (future) grant source hashes.  
2. **Grant does not replace Agreement/License.** Legal evidence remains order/contract/license
   or the external agreement record. Grant is the machine-readable authorization view.  
3. **Grant is not GenerationRecord.** Linking outputs to authority is a separate future object.  
4. **No silent ES→AT territory rewrites** or incompatible schema reuse on historical rows.  
5. **AT/DE pilot scope ≠ legal clearance.** Grants are operational records, not legal opinions.  
6. **Live commerce stays gated** until documented launch conditions are met.  
7. **Do not open** public API platform, API keys, MFA, voice, music, or agents without an
   explicit next-milestone decision (`AGENTS.md`).

---

## 8. STOP

**SPECIFY PASS** when:

- This file exists with sections 1–8.  
- `AGENTS.md` points here and forbids parallel IMPLEMENT without a decision.  
- No SQL / evaluator / platform route changes shipped under this milestone.  
- Nike vs Adidas acceptance test is written above.

**Do not start in the same breath:**

- `rights_grants` table or Zod `rightsnet.rights-grant/0.1`  
- Automatic License→Grant projection in `payments.ts`  
- Connect `check` that reads grants  
- Contract upload / extract / human-review UI  
- `authorize_generation()` / GenerationRecord  

### Next milestone (separate decision only)

`RIGHTS_GRANT_IMPLEMENT_V0_1` (suggested): table + Zod + marketplace License→Grant projection +
admin read path.  

**After that:** Connect milestone to consult ACTIVE grants.  

**Later still:** existing-agreement upload + human review pipeline.

---

## Related docs

- `docs/RIGHTSNET_MVP_CONSTITUTION.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RIGHTSNET_OFFICIAL_FLOW.md`  
- `docs/CREATOR_PUBLISH_RIGHTS_CORE_V0_1.md`  
