# RN-AUTH verify-auth HTTP v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: `docs/RN_AUTH_V0_1.md` (mint + `verifyRnAuthToken` helper **PASS**).

---

## Product

Partner asks: **“Is this RN-AUTH token still valid authority right now?”**

Read-only check. Does **not** consume the token (`report_output` still consumes).  
Does **not** mint. Does **not** replace public generation verify (`RN-GEN-…`).

---

## API

`POST /v1/platform/verify-auth`

Requires `PLATFORM_API_ENABLED` + admin (`assertPlatformApiAccess`).

Body:

```json
{
  "auth_token": { "payload": {}, "signature": "…", "key_id": "…" }
}
```

Response (valid):

```json
{
  "surface": "platform",
  "valid": true,
  "reason": null,
  "status": "ISSUED",
  "payload": { "auth_id": "…", "grant_id": "…", "organization_id": "…", "…" }
}
```

Response (invalid):

```json
{
  "surface": "platform",
  "valid": false,
  "reason": "EXPIRED|BAD_SIGNATURE|CONSUMED|…",
  "status": null,
  "payload": null
}
```

HTTP **200** even when `valid: false` (decision payload, not transport error).  
Malformed body without `auth_token` → 422.

Code: `platformVerifyAuth` in `apps/api/src/modules/platform.ts` → `verifyRnAuthToken`.

---

## STOP

No public browser verify page for RN-AUTH. No MFA. No live commerce. No auto-consume on verify.
