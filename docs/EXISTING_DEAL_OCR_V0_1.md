# Existing Deal files / OCR v0.1 — L1–L3

**Status:** SPECIFY **PASS** · IMPLEMENT **L1+L2+L3 PASS** (live OCR via HTTP provider)  
**Date:** September 2026  

---

## Shipped

| Slice | Status |
|-------|--------|
| **L1** files + sandbox extract + confirm | **PASS** |
| **L2** Admin UI `/ops/rights/ingest` | **PASS** |
| **L3** Live OCR HTTP provider | **PASS** |

### Live OCR (L3)

Env (never commit secrets):

```bash
OCR_LIVE_ENABLED=true
OCR_API_BASE=https://your-ocr-provider.example
OCR_API_KEY=…
```

`POST {OCR_API_BASE}/v1/extract` with Bearer key; body includes `content_base64`,
`mime_type`, `sha256`. Response must include `proposed_rights` matching
`ExternalProposedRightsSchema`. Stamps `approval.ocr_extract=live_v0.1`.

CI: sandbox extract + mocked liveOcrFn (no network OCR).

Code: `apps/api/src/modules/adapters/ocr-live-client.ts`.

---

## STOP

Do **not** open bulk CSV or org-member writes without an explicit decision.
