# RN-AUTH revoke HTTP v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: `docs/RN_AUTH_V0_1.md`, `docs/RN_AUTH_VERIFY_V0_1.md`.

---

## Product

Partner / admin invalidates an **ISSUED** RN-AUTH so it can no longer authorize
generation (`verify-auth` → invalid; `report_output` → `AUTH_REVOKED`).

Does **not** mint. Does **not** create GenerationRecord. Idempotent if already
`REVOKED`. Cannot revoke `CONSUMED` (already used).

---

## API

`POST /v1/platform/revoke-auth`

Requires `PLATFORM_API_ENABLED` + admin.

Body:

```json
{
  "auth_id": "<uuid>",
  "organization_id": "<uuid>"
}
```

`organization_id` must match the ledger row (Nike cannot revoke Adidas auth).

Success:

```json
{
  "surface": "platform",
  "auth_id": "…",
  "status": "REVOKED",
  "idempotent": false
}
```

Already revoked → same with `idempotent: true`.

Errors: `NOT_FOUND` / org mismatch → 404; `CONSUMED` → 409 `AUTH_ALREADY_CONSUMED`.

Code: `revokeRnAuthToken` in `generation-auth.ts` · `platformRevokeAuth` in `platform.ts`.

---

## STOP

No public revoke UI. No MFA. No live commerce. No silent revoke of all auths for a grant.
