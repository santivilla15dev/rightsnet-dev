# Existing Deal files / OCR v0.1 — L1 API + L2 UI

**Status:** SPECIFY **PASS** · IMPLEMENT **L1 PASS** · **L2 UI PASS** · L3 live OCR **not started**  
**Date:** September 2026  

---

## Shipped

| Slice | Status |
|-------|--------|
| **L1** files + sandbox extract + confirm | **PASS** |
| **L2** Admin UI `/ops/rights/ingest` + `POST .../proposed-rights` | **PASS** |
| **L3** Live OCR provider | not started |

UI flow: create → upload → extract sandbox → edit JSON → confirm Grant.
Admin only. Members do not get ingest in v0.1.

Code: `apps/web/src/components/existing-deal-ocr.tsx`.

---

## STOP

Do **not** open L3 live OCR or bulk CSV without an explicit decision.
