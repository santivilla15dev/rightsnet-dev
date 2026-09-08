# Higgsfield adapter — L1–L3

**Status:** SPECIFY **PASS** · IMPLEMENT **L1+L2+L3 PASS**  
**Date:** September 2026  

---

## Shipped

| Slice | Status |
|-------|--------|
| **L1** Live client + sync poll | **PASS** |
| **L2** `POST /v1/platform/adapters/higgsfield/run` | **PASS** |
| **L3** Async + webhook → `report_output` | **PASS** |

### L3

- `POST /v1/platform/adapters/higgsfield/run-async` — authorize + submit, store pending  
- `POST /v1/webhooks/higgsfield` — HF envelope → report_output (idempotent)  
- Table: `higgsfield_pending_jobs`  
- Env: `HIGGSFIELD_WEBHOOK_SECRET` (Bearer / `X-RightsNet-Webhook-Secret`),  
  `HIGGSFIELD_WEBHOOK_PUBLIC_URL` (passed as `hf_webhook` on live submit)

CI: sandbox async + synthetic webhook (no network HF).

---

## STOP

No further HF slices in this breath. Bulk CSV / studio UI remain separate decisions.
