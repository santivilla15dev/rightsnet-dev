# Rights Operations UI v0.1.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: `docs/RIGHTS_OPERATIONS_V0_1.md` (read-model API **PASS**).

---

## Shipped

| Path | UI |
|------|-----|
| `/ops/rights` | Overview — admin (any org) or owner/employee (own orgs) |
| `/ops/rights/campaign` | Campaign form + buckets |
| `/ops/rights/ingest` | Existing Deal OCR + bulk CSV/confirm (admin/owner) |

**v0.1.1:** Overview CTA when `missing_structured_rights > 0` → ingest with
`?organization_id=` (`docs/OPS_OVERVIEW_PENDING_CTA_V0_1.md`).

Entry: `/ops` (admin) · buyer nav **Derechos** · ingest from Ops / overview.

Code: `apps/web/src/components/rights-operations.tsx`,
`apps/web/src/components/existing-deal-ocr.tsx`,
`apps/web/src/lib/rights-operations-ui.ts`.

---

## STOP

No MFA. No live commerce. No Identity live. No auto-confirm from overview.
