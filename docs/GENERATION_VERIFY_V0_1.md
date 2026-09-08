# Generation public verify v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: `docs/REPORT_OUTPUT_V0_1.md`.  
Related: `docs/GENERATION_READ_V0_1.md`.

---

## Shipped

- `public_token` `RN-GEN-YYYY-######` minted on `report_output` (`022_generation_public_token.sql`)
- `GET /v1/public/generations/:token/verify` — no auth; omits partner `uri`
- Web: `/verify/generation/:token` and `/verify/RN-GEN-…`
- `report_output` returns `verify_hint` + `public_token`

Code: `apps/api/src/modules/generation-verify.ts`, `apps/web/src/components/generation-verify.tsx`

---

## STOP

**IMPLEMENT PASS.** Do **not** open provider adapters or C2PA without a new decision.
