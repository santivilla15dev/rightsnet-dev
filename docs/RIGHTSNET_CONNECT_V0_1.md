# RightsNet Connect v0.1 (platform API foundation)

**Status:** internal / partner-gated foundation  
**Date:** September 2026  
**Does not** open a public API platform.

## Naming (critical)

| Term | Meaning in this repo |
|------|----------------------|
| **Stripe Connect** | Creator payouts / destination charges (`apps/api/src/modules/stripe-connect.ts`) |
| **RightsNet Connect** | Partner API for AI platforms (`search` / `check` / future `authorize_generation` / …) |

In code, RightsNet Connect surfaces live under the **`platform`** module and `/v1/platform/*` routes so they never collide with Stripe Connect.

## Product boundary (MVP)

- Constitution still forbids a general **public** API platform without an explicit milestone decision.
- This milestone is **partner-gated / internal-first**:
  - Requires `PLATFORM_API_ENABLED=true`
  - Requires authenticated **admin** Bearer (sandbox or Supabase admin)
  - No API keys, OAuth client-credentials, MCP, SDK, or outgoing webhooks yet
- Live commerce remains gated.

## Two questions Connect must never confuse

Marketplace purchase and Existing Deal both converge on a **RightsGrant** (see
`docs/RIGHTS_GRANT_V0_1.md`). Connect then serves **two different questions**:

| Operation | Question | Looks at | Binding? |
|-----------|----------|----------|----------|
| **`check`** (shipped) | Would this *use* be **compatible** with the creator’s general willingness / marketplace policy? | `RightsPolicy` via `previewRightsCheck` | **No** — preview only (`preview: true`) |
| **`authorize_generation`** (future) | Does this **organization** currently hold **executable** authority to run **this generation**? | Active **RightsGrant** (grantee + asset + use + approvals) | **Yes** — later returns `AUTHORIZED` + signed RN-AUTH token |

```text
check()
  → ¿Esta utilización sería compatible?
  → Policy preview (Discover / pre-purchase / sandbox partner probe)

authorize_generation()
  → ¿Esta organización tiene autorización ejecutable ahora?
  → Active RightsGrant?
           ↓ YES
        Use within grant?
           ↓ YES
        Approval satisfied?
           ↓ YES
        AUTHORIZED  (+ signed token in a later step)
```

**Do not** answer the second question by mutating the creator’s public `RightsPolicy`
(Nike deal must not become Adidas ALLOW). **Do not** treat `check` as issuance or
generation authority.

## Non-duplication rules

RightsNet Connect **must call** existing domain logic:

| Operation | Reuse |
|-----------|--------|
| `search` | `marketplace.search` |
| `check` | `previewRightsCheck` → Rights Core `evaluateRightsDecision` / legacy `evaluateLicense` |
| `authorize_generation` (future) | Lookup / match **ACTIVE** `rights_grants` (marketplace or existing-deal sourced); **not** a second pricing engine; **not** a rewrite of policy evaluation |

**Do not** implement a second rights engine, second pricing path, or parallel license issuance.

## Current routes (v0.1) — shipped

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/v1/platform/search` | Same filters/results as `GET /v1/search` |
| `POST` | `/v1/platform/check` | Same decision as `POST /v1/public/rights-check` (preview, non-binding) |

Responses add `surface: "platform"` for traceability. `check` remains **preview** (`preview: true`): not a paid license, not a RightsGrant, and not generation authority.

## Future route (SPECIFY only — not implemented)

`POST /v1/platform/authorize-generation`

Illustrative body:

```json
{
  "organization_id": "<org uuid>",
  "asset_id": "<asset uuid>",
  "provider": "higgsfield",
  "use": {
    "content_type": "synthetic_video",
    "purpose": "commercial_advertising",
    "territory": "DE"
  }
}
```

Decision path (product):

1. Active RightsGrant for `(organization_id, asset_id)` in validity window?  
2. Requested `use` within grant dimensions (`rights` / industry / territories / …)?  
3. Grant `approval` constraints satisfied (e.g. creative approval)?  
4. → `AUTHORIZED` (signed RN-AUTH token and `report_output` / GenerationRecord = later milestones)

Until an explicit IMPLEMENT milestone: **no** route, **no** token, **no** Higgsfield wiring.

## Out of scope (later milestones)

- API keys / client credentials
- `license()` purchase over API
- `authorize_generation()` IMPLEMENT + RN-AUTH token + `report_output()` (GenerationRecord)
- Outgoing webhooks, MCP, C2PA, provider-specific adapters
- Changing `check` to be grant-aware (it stays policy preview)

## STOP

v0.1 PASS = search + check wrappers + tests.  
Do **not** ship `authorize-generation`, RN-AUTH, or grant-aware `check` without a new milestone decision.  
Do not expand to license purchase over API without a separate decision.
