# Ops overview pending CTA v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: Rights Overview metric `missing_structured_rights` **PASS** · ingest UI **PASS**.

---

## Product

When the overview shows pending Existing Deal drafts (`draft` /
`pending_confirm`), the UI must make the next human step obvious: go to ingest
to review / bulk-confirm — not invent new metrics.

---

## Behavior

1. Overview: if `metrics.missing_structured_rights > 0`, show a short callout +
   link to `/ops/rights/ingest?organization_id=…` (owners/admins only for write).
2. Employees still see the metric; CTA explains they need an owner to confirm.
3. Ingest page honors `?organization_id=` when the user may write that org.

No API change (metric already exists).

---

## STOP

No MFA. No live commerce. No Identity live. No auto-confirm from overview.
