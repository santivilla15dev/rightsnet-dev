# RN-AUTH list (partner read) v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: mint / verify / revoke RN-AUTH **PASS**.

---

## Product

Partner lists RN-AUTH ledger rows for one organization: which passes are
`ISSUED`, `REVOKED`, or `CONSUMED`.

Read-only. Does **not** return `signature` (cannot reconstruct a usable token
from the list alone — partner must keep the mint response).

---

## API

`GET /v1/platform/generation-auths`

Requires `PLATFORM_API_ENABLED` + admin.

Query:

| Param | Required | Notes |
|-------|----------|--------|
| `organization_id` | yes | Scope (Nike ≠ Adidas) |
| `status` | no | `ISSUED` \| `REVOKED` \| `CONSUMED` |
| `asset_id` | no | Filter |
| `limit` | no | 1–50, default 20 |
| `cursor` | no | Opaque pagination |

Item shape (no signature):

```json
{
  "auth_id": "…",
  "grant_id": "…",
  "organization_id": "…",
  "asset_id": "…",
  "provider": "higgsfield",
  "status": "ISSUED",
  "use": {},
  "issued_at": "…",
  "expires_at": "…"
}
```

Response: `{ surface: "platform", items, next_cursor }`.

Code: `listPlatformGenerationAuths` in `apps/api/src/modules/generation-auth.ts`.

---

## STOP

No public browser list. No MFA. No live commerce. No re-mint from list.
