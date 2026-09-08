# Existing Deal bulk CSV v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: structured Existing Deal ingest **PASS**.

---

## Product

Import many contract **drafts** as CSV → each row becomes `external_agreements` with
`pending_confirm`. **Never** auto-confirms or creates RightsGrant.

Human confirm (single or later batch UI) remains mandatory.

---

## API

`POST /v1/admin/external-agreements/bulk-csv`

Body:

```json
{
  "organization_id": "<uuid>",
  "csv": "organization_id,asset_id,title,...\n...",
  "fail_fast": false
}
```

Auth: `assertOpsWriteAccess` (admin or org **owner**). All rows must use the same
`organization_id` as the body scope.

Max **100** rows per request.

### CSV columns

Required: `organization_id`, `asset_id`, `title`, `territories`, `industry`, `rights`,
`valid_from`, `valid_until`.

Optional: `external_ref`, `approval_json`.

- Lists: `|` or `;` separated  
- `rights`: `key:STATE` pairs (`synthetic_video:ALLOW|commercial_advertising:ALLOW`)

Response: `{ created[], errors[], total_rows }` — partial success allowed unless
`fail_fast`.

Code: `apps/api/src/modules/external-agreement-bulk.ts` · UI on `/ops/rights/ingest`.

---

## STOP

No auto-confirm bulk. No OCR-from-CSV. No live commerce.
