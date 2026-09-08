# Higgsfield provider adapter v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT sandbox **PASS** · live L1 + Nest L2 + webhook L3 **PASS**  
**Date:** September 2026  

Depends on Connect generation trunk **PASS**.  
Live/Nest detail: `docs/HIGGSFIELD_LIVE_V0_1.md`.

---

## Shipped

| Piece | Path |
|-------|------|
| Orchestrator | `apps/api/src/modules/adapters/higgsfield.ts` |
| Live HTTP client (L1) | `apps/api/src/modules/adapters/higgsfield-live-client.ts` |
| Nest sync run (L2) | `POST /v1/platform/adapters/higgsfield/run` |
| Nest async + webhook (L3) | `run-async` + `POST /v1/webhooks/higgsfield` |
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

L1–L3 HF adapter **PASS** (`docs/HIGGSFIELD_LIVE_V0_1.md`).  
Do **not** open MFA, voice, live commerce, or other providers without an explicit decision.
CI must remain sandbox / mocked live (no network HF in CI).
