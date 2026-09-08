# Existing Deal files / OCR v0.1 — L1 IMPLEMENT

**Status:** SPECIFY **PASS** · IMPLEMENT **L1 PASS** · L2 UI / L3 live OCR **not started**  
**Date:** September 2026  

Depends on: Existing Deal **structured ingest** **PASS**
(`docs/RIGHTS_GRANT_V0_1.md` §5).

---

## 1. Product

```text
file_upload → sandbox extract → proposed_rights draft
  → human confirm → grant_active (EXISTING_AGREEMENT)
```

Extract **never** creates a RightsGrant. Confirm humano obligatorio.
Creator `RightsPolicy` is **not** mutated.

---

## 2. Scope slices

| Slice | What | Status |
|-------|------|--------|
| **L1** | `external_agreement_files` + admin upload + sandbox extract + reuse confirm | **PASS** |
| **L2** | Minimal Ops/admin UI | not started |
| **L3** | Real OCR provider | not started |

Bulk CSV **out**. Org-member Ops = separate SPECIFY.

---

## 3. Shipped (L1)

| Piece | Path |
|-------|------|
| Migration | `packages/db/migrations/023_external_agreement_files.sql` |
| Module | `apps/api/src/modules/external-agreement-ocr.ts` |
| Routes (admin) | `POST/GET .../external-agreements/:id/files`, `POST .../:id/extract` |
| Confirm | existing `POST .../:id/confirm` |
| Tests | `tests/external-agreement-ocr.test.ts` |

### MIME / size

`application/pdf`, `image/jpeg`, `image/png` · max **10 MiB** · one file per agreement.

### Extract sandbox

Stamps `approval.ocr_extract=sandbox_v0.1` on `proposed_rights`. No network.
`mode=live` → `501 OCR_LIVE_NOT_IMPLEMENTED`.

Storage: `.local/uploads/agreements/<fileId>`.

---

## 4. Acceptance (L1)

1. Admin attaches one allowed file.  
2. Sandbox extract → `extract_status=ready` without network OCR.  
3. Confirm still required → `EXISTING_AGREEMENT` Grant.  
4. Extract alone → `grant_created: false`.  
5. CI has no live OCR.  
6. **STOP** before L2 UI, L3, bulk CSV (org-member may proceed as separate SPECIFY).

---

## 5. STOP

**IMPLEMENT L1 PASS** = migration + APIs + tests + this doc + AGENTS.  
Do **not** open L2 UI or L3 live OCR without an explicit decision.

Related structured path: `apps/api/src/modules/external-agreements.ts`.
