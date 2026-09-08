# Rights Operations UI v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS** (+ org-member L2)  
**Date:** September 2026  

Depends on: `docs/RIGHTS_OPERATIONS_V0_1.md` (read-model API **PASS**).

---

## Shipped

| Path | UI |
|------|-----|
| `/ops/rights` | Overview — admin (any org) or owner/employee (own orgs) |
| `/ops/rights/campaign` | Campaign form + buckets |
| `/ops/rights/ingest` | Existing Deal OCR L2 (admin only) |

Entry: `/ops` (admin) · buyer nav **Derechos** · ingest from Ops / overview.

Code: `apps/web/src/components/rights-operations.tsx`,
`apps/web/src/components/existing-deal-ocr.tsx`,
`apps/web/src/lib/rights-operations-ui.ts`.

---

## STOP

Do **not** open org-member L3 writes, OCR L3 live provider, or Higgsfield inside Ops
without a new decision.
