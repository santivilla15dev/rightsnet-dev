# Rights Operations org-member access v0.1 — L1 API + L2 UI

**Status:** SPECIFY **PASS** · IMPLEMENT **L1 PASS** · **L2 UI PASS** · L3 member writes **not started**  
**Date:** September 2026  

---

## Shipped

| Slice | Status |
|-------|--------|
| **L1** API `assertOpsReadAccess` | **PASS** |
| **L2** UI `/ops/rights` + campaign for owner/employee (own orgs only) | **PASS** |
| **L3** Member writes (confirm / OCR) | not started |

UI: admin keeps demo/UUID picker; members only see their `owner`/`employee` orgs.
Nav buyer: link **Derechos** → `/ops/rights`.

Code: `apps/web/src/components/rights-operations.tsx`,
`apps/web/src/lib/rights-operations-ui.ts` (`canAccessOpsRightsUi`, `opsReadableOrganizations`).

---

## STOP

Do **not** open L3 member writes, OCR L3 live provider, or HF Nest L2 without a decision.
