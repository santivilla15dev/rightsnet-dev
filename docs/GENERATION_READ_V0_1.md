# Generation read (list / GET) v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: `docs/REPORT_OUTPUT_V0_1.md`.  
Related: `docs/GENERATION_VERIFY_V0_1.md` (public verify — IMPLEMENT PASS).

---

## Routes (shipped)

| Method | Path | Gate |
|--------|------|------|
| `GET` | `/v1/platform/generations` | `PLATFORM_API_ENABLED` + admin |
| `GET` | `/v1/platform/generations/:id` | same |

List requires `organization_id`. Optional: `asset_id`, `provider`, `limit`, `cursor`.  
GET optional `organization_id` → mismatch = 404.

Code: `apps/api/src/modules/generations.ts`

---

## STOP

**IMPLEMENT PASS.** Next: provider adapters / Operations UI — explicit decision only.
