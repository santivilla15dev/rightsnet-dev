# Rights Operations UI v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: `docs/RIGHTS_OPERATIONS_V0_1.md` (read-model API **PASS**).

---

## Shipped

| Path | UI |
|------|-----|
| `/ops/rights` | Overview + org picker (demo sandbox orgs) |
| `/ops/rights/campaign` | Campaign form + four buckets + asset ids |

Entry link from `/ops` (“Rights Operations”). Admin Bearer only.

Code: `apps/web/src/components/rights-operations.tsx`,
`apps/web/src/lib/rights-operations-ui.ts`.

---

## STOP

Do **not** open org-member L2 UI / L3 writes, OCR L2 upload UI, or Higgsfield inside Ops
without a new decision. Org-member **API L1** is shipped
(`docs/RIGHTS_OPERATIONS_ORG_MEMBER_V0_1.md`).
