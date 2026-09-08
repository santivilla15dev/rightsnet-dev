# Existing Deal bulk confirm v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: structured Existing Deal confirm **PASS** · bulk CSV **PASS**.

---

## Product

A human (admin or org **owner**) selects explicit `agreement_ids` that are
`draft` / `pending_confirm` and confirms them in one request.

Each successful confirm projects a **RightsGrant** (`EXISTING_AGREEMENT`) via the
same path as single `POST .../:id/confirm`.

**Never** auto-confirm after CSV. **No** “confirm all pending” without an ID list.

---

## API

`POST /v1/admin/external-agreements/bulk-confirm`

Body:

```json
{
  "organization_id": "<uuid>",
  "agreement_ids": ["<uuid>", "..."]
}
```

Auth: `assertOpsWriteAccess` (admin or org **owner**).

- Max **100** IDs per request.
- Every agreement must belong to `organization_id`.
- Reuses `confirmExternalAgreement` per id (idempotent if already `confirmed`).
- Partial success: `{ confirmed[], errors[], total }`.

Code: `apps/api/src/modules/external-agreement-bulk-confirm.ts` · UI on
`/ops/rights/ingest` (lista + checkboxes).

---

## STOP

No MFA. No live commerce. No auto-grant without explicit IDs.
