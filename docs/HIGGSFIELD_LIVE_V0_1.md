# Higgsfield live adapter v0.1 — L1 + Nest L2

**Status:** SPECIFY **PASS** · IMPLEMENT **L1 PASS** · **L2 Nest PASS** · L3 webhooks **not started**  
**Date:** September 2026  

---

## Shipped

| Slice | Status |
|-------|--------|
| **L1** Live client when `HIGGSFIELD_MODE=live` | **PASS** |
| **L2** `POST /v1/platform/adapters/higgsfield/run` | **PASS** |
| **L3** Webhooks / async report | not started |

### Nest L2

Gate: `PLATFORM_API_ENABLED` + admin Bearer + `HIGGSFIELD_ADAPTER_ENABLED`.  
404/disabled if either flag off. Body = same as CLI adapter input.

```bash
# PLATFORM_API_ENABLED=true HIGGSFIELD_ADAPTER_ENABLED=true
curl -X POST "$API/v1/platform/adapters/higgsfield/run" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organization_id":"…","asset_id":"…","use":{"content_type":"synthetic_video","purpose":"commercial_advertising","territory":"DE","industry":"beauty"},"brief":"…"}'
```

CI: sandbox / mocked live only (no network HF).

---

## STOP

Do **not** open L3 webhooks without an explicit decision.
