# RightsNet Connect v0.1 (platform API foundation)

**Status:** internal / partner-gated foundation  
**Date:** September 2026  
**Does not** open a public API platform.

## Naming (critical)

| Term | Meaning in this repo |
|------|----------------------|
| **Stripe Connect** | Creator payouts / destination charges (`apps/api/src/modules/stripe-connect.ts`) |
| **RightsNet Connect** | Future partner API for AI platforms (`search` / `check` / `license` / …) |

In code, RightsNet Connect surfaces live under the **`platform`** module and `/v1/platform/*` routes so they never collide with Stripe Connect.

## Product boundary (MVP)

- Constitution still forbids a general **public** API platform without an explicit milestone decision.
- This milestone is **partner-gated / internal-first**:
  - Requires `PLATFORM_API_ENABLED=true`
  - Requires authenticated **admin** Bearer (sandbox or Supabase admin)
  - No API keys, OAuth client-credentials, MCP, SDK, or outgoing webhooks yet
- Live commerce remains gated.

## Non-duplication rules

RightsNet Connect **must call** existing domain logic:

| Operation | Reuse |
|-----------|--------|
| `search` | `marketplace.search` |
| `check` | `previewRightsCheck` → Rights Core `evaluateRightsDecision` / legacy `evaluateLicense` |

**Do not** implement a second rights engine, second pricing path, or parallel license issuance.

## Current routes (v0.1)

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/v1/platform/search` | Same filters/results as `GET /v1/search` |
| `POST` | `/v1/platform/check` | Same decision as `POST /v1/public/rights-check` (preview, non-binding) |

Responses add `surface: "platform"` for traceability. `check` remains **preview** (`preview: true`): not a paid license and not issuance authority.

## Out of scope (later milestones)

- API keys / client credentials
- `license()` purchase over API
- `authorize_generation()` / `report_output()` (GenerationRecord)
- Outgoing webhooks, MCP, C2PA, provider-specific adapters

## STOP

After search + check wrappers work and tests pass, stop. Do not expand to license purchase without a new milestone decision.
