# Higgsfield provider adapter v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT sandbox (Option A) **PASS** · live L1 **PASS**  
**Date:** September 2026  

Depends on Connect generation trunk **PASS**.  
**Nest route (L2) / webhooks (L3): not started.**

---

## Shipped

| Piece | Path |
|-------|------|
| Orchestrator | `apps/api/src/modules/adapters/higgsfield.ts` |
| Live HTTP client (L1) | `apps/api/src/modules/adapters/higgsfield-live-client.ts` |
| CLI demo | `scripts/adapters/higgsfield-demo.ts` |
| Flag | `HIGGSFIELD_ADAPTER_ENABLED` (default false) |
| Mode | `HIGGSFIELD_MODE=sandbox` (default) or `live` |

Flow: `authorize-generation` → sandbox stub **or** live HF job → `report-output` →
public verify `RN-GEN`.

```bash
# Sandbox (CI / default)
HIGGSFIELD_ADAPTER_ENABLED=true pnpm exec tsx scripts/adapters/higgsfield-demo.ts \
  --organization-id <uuid> --asset-id <uuid>

# Live L1 (local keys only — never commit)
HIGGSFIELD_ADAPTER_ENABLED=true HIGGSFIELD_MODE=live \
  HIGGSFIELD_API_KEY_ID=… HIGGSFIELD_API_KEY_SECRET=… \
  pnpm exec tsx scripts/adapters/higgsfield-demo.ts \
  --organization-id <uuid> --asset-id <uuid>
```

Requires a **cleared** ACTIVE RightsGrant (empty `approval`) for AUTHORIZED.

Live details: `docs/HIGGSFIELD_LIVE_V0_1.md`.

---

## STOP

Do **not** open Nest `/adapters/higgsfield/run` (L2), webhooks (L3), OCR, or org-member
Ops without an explicit next-milestone decision. CI must remain sandbox / mocked live.
