# Rights Operations org-member access — L1–L3

**Status:** SPECIFY **PASS** · IMPLEMENT **L1+L2+L3 PASS**  
**Date:** September 2026  

---

## Shipped

| Slice | Status |
|-------|--------|
| **L1** Read API (`assertOpsReadAccess`) | **PASS** |
| **L2** UI overview/campaign for owner/employee | **PASS** |
| **L3** Writes: owner (or admin) create/upload/extract/confirm Existing Deal | **PASS** |

Employee remains **read-only** on ingest/confirm (`assertOpsWriteAccess` → 403).  
UI: `/ops/rights/ingest` for admin + org owner.

---

## STOP

Do not open public self-serve contract upload or agency hierarchy without a new decision.
