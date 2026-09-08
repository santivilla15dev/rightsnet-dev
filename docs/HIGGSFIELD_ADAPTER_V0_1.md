# Higgsfield provider adapter v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT sandbox (Option A) **PASS**  
**Date:** September 2026  

Depends on Connect generation trunk **PASS**.  
**Live Higgsfield API / Nest route (Option B): not started.**

---

## Shipped (sandbox)

| Piece | Path |
|-------|------|
| Orchestrator | `apps/api/src/modules/adapters/higgsfield.ts` |
| CLI demo | `scripts/adapters/higgsfield-demo.ts` |
| Flag | `HIGGSFIELD_ADAPTER_ENABLED` (default false) |
| Mode | `HIGGSFIELD_MODE=sandbox` (default); `live` → 501 |

Flow: `authorize-generation` → stub job (`hf_sandbox_*`) → `report-output` → public verify `RN-GEN`.

```bash
HIGGSFIELD_ADAPTER_ENABLED=true pnpm exec tsx scripts/adapters/higgsfield-demo.ts \
  --organization-id <uuid> --asset-id <uuid>
```

Requires a **cleared** ACTIVE RightsGrant (empty `approval`) for AUTHORIZED.

---

## STOP

Do **not** implement live HF keys, MCP, Nest `/adapters/higgsfield/run`, or other providers
without an explicit next-milestone decision.
