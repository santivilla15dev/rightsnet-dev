# Generation read (list / GET) v0.1 — SPECIFY

**Status:** SPECIFY **PASS** · IMPLEMENT **not started**  
**Date:** September 2026  

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md`.  
Depends on: `docs/REPORT_OUTPUT_V0_1.md` (IMPLEMENT **PASS** — `generation_records`).  
Related (separate milestone): `docs/GENERATION_VERIFY_V0_1.md` (public verify).

**Documentation only.** Do not add routes until an explicit IMPLEMENT decision.

---

## 1. Product question

```text
report_output already stored GenerationRecord rows.

Partner / admin read (this SPECIFY)
  → “¿Qué generaciones registró esta organización?”
  → “¿Qué hay en este generation_id?”
```

| Surface | Audience | Auth |
|---------|----------|------|
| **This milestone** | Partner / internal admin | `PLATFORM_API_ENABLED` + admin Bearer |
| Public verify | Anyone with an id | None — see `GENERATION_VERIFY_V0_1.md` |

Read-only. Does **not** mint RN-AUTH, does **not** un-consume auth, does **not** mutate grants.

Nike vs Adidas: list/GET always scoped by `organization_id` (or record ownership). Adidas
cannot list Nike’s rows.

---

## 2. Proposed routes

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/v1/platform/generations` | List for one org (paginated) |
| `GET` | `/v1/platform/generations/:id` | Single record (must belong to queried org or return 404) |

Gate: same as other platform routes (`assertPlatformApiAccess`).

### List query

```text
organization_id=uuid   (required)
asset_id=uuid          (optional)
provider=string        (optional)
limit=1..50            (default 20)
cursor=opaque          (optional; reported_at+id)
```

### List response (illustrative)

```json
{
  "surface": "platform",
  "items": [
    {
      "generation_id": "<uuid>",
      "auth_id": "<uuid>",
      "grant_id": "<uuid>",
      "organization_id": "<uuid>",
      "asset_id": "<uuid>",
      "provider": "higgsfield",
      "reported_at": "2026-06-15T12:10:00.000Z",
      "output": {
        "content_type": "synthetic_video",
        "external_job_id": "hf_1",
        "uri": "https://partner.example/out/1"
      }
    }
  ],
  "next_cursor": null
}
```

Do **not** return full RN-AUTH signature blobs or private key material.  
Returning embedded `payload` snapshot (sanitized) is OK; prefer the fields above.

### GET by id

- 200 + same item shape if found.  
- Optional query `organization_id` — if present and mismatch → **404** (no existence leak across orgs).  
- If omitted (admin global): still allowed in v0.1 partner-gated admin mode; document that
  tightening to org-scoped API keys comes later.

---

## 3. Non-goals

- Public unauthenticated verify (other doc)  
- Web UI for Operations / partner dashboard  
- Re-opening `CONSUMED` auths  
- Streaming or proxying media bytes  
- Org-member (non-admin) RBAC  

---

## 4. Acceptance criteria (future IMPLEMENT)

1. List returns only rows for `organization_id`.  
2. Pagination stable by `reported_at DESC, id DESC`.  
3. GET unknown id → 404.  
4. GET other org’s id with `organization_id` filter → 404.  
5. Tests + AGENTS; **STOP** before public verify unless that milestone is separately decided.

---

## 5. STOP

**SPECIFY PASS** = this document + pointers.  
**IMPLEMENT** = only after explicit decision. Prefer implementing **this** before public verify.

---

## Related docs

- `docs/REPORT_OUTPUT_V0_1.md`  
- `docs/GENERATION_VERIFY_V0_1.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RN_AUTH_V0_1.md`  
