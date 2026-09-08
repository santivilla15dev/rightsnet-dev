# Existing Deal files / OCR v0.1 — SPECIFY

**Status:** SPECIFY **PASS** · IMPLEMENT **not started**  
**Date:** September 2026  

Depends on: Existing Deal **structured ingest** **PASS**
(`docs/RIGHTS_GRANT_V0_1.md` §5 — `external_agreements` → human confirm →
`EXISTING_AGREEMENT` RightsGrant).

**Documentation only.** Do not add upload routes, OCR providers, migrations, or Ops UI
until an explicit IMPLEMENT decision.

---

## 1. Product question

```text
Structured ingest (shipped)
  → Ops enters proposed_rights as JSON → human confirm → Grant

Files / OCR (this SPECIFY)
  → Ops uploads contract file → extract suggests proposed_rights
  → Human reviews / edits → same confirm → same Grant
```

Extract **never** decides legal clearance and **never** creates a RightsGrant alone.
Human confirm remains mandatory. Creator public `RightsPolicy` is **not** mutated.

Convergence after Grant is identical to marketplace and structured Existing Deal
(Connect `authorize_generation`, Ops overview/campaign, RN-GEN, etc.).

---

## 2. Pipeline

```text
file_upload → extract (sandbox | later live) → proposed_rights draft
  → human confirm → grant_active (EXISTING_AGREEMENT)
```

| Step | Owner | Notes |
|------|--------|--------|
| Create agreement shell | Admin | May start as `draft` / `pending_confirm` with placeholder or partial `proposed_rights` |
| Upload file | Admin | One file per agreement in v0.1 |
| Extract | System | Fills / suggests `proposed_rights`; status `pending` → `ready` \| `failed` |
| Review | Human | Edit JSON if needed |
| Confirm | Human | Existing `POST .../confirm` → upsert Grant |

---

## 3. Scope slices (implement one at a time)

| Slice | What | Prefer first? |
|-------|------|----------------|
| **L1** | Table `external_agreement_files` + admin upload + sandbox extract + reuse confirm | Yes |
| **L2** | Minimal Ops/admin UI (upload + review draft + confirm) | After L1 API works |
| **L3** | Real OCR / document-AI provider (env keys; CI stays sandbox) | After sandbox extract is trusted |

Do **not** ship L2+L3 in the same breath as L1.  
**Bulk CSV import** is **out of this milestone** (separate decision later).

---

## 4. Storage (proposed)

Do **not** reuse `asset_files` (creator portrait / asset media).

New table (name locked for IMPLEMENT): **`external_agreement_files`**

| Column (conceptual) | Role |
|---------------------|------|
| `id` | uuid PK |
| `agreement_id` | FK → `external_agreements` |
| `storage_key` | Path under local upload root (mirror `.local/uploads` pattern) |
| `sha256` | Content hash |
| `mime_type` | Allowed MIME only |
| `size_bytes` | Enforce max |
| `scan_status` | `pending` \| `clean` \| `rejected` (same vocabulary as `asset_files`) |
| `created_at` | timestamptz |

**v0.1 cardinality:** at most **one** active file per agreement (replace or reject second upload until superseded agreement).

### MIME and size

| MIME | Allowed |
|------|---------|
| `application/pdf` | yes |
| `image/jpeg` | yes |
| `image/png` | yes |

Max size: **10 MiB** per file (contracts). Reject other types with a clear domain error.

---

## 5. Extract job (proposed)

| Field | Meaning |
|-------|---------|
| `extract_status` | `none` \| `pending` \| `ready` \| `failed` (on agreement or side table) |
| `extract_mode` | `sandbox` (default) \| `live` (L3 only) |
| `extract_error` | Short message when `failed` |
| Output | Suggested `proposed_rights` shape (same Zod as structured ingest) |

**Sandbox extract (L1):** deterministic stub — no network OCR. May copy a fixture template
or lightly map filename/metadata into a **draft** `proposed_rights` that a human must edit
before confirm. Must not invent a Grant.

**Live OCR (L3):** provider behind env flags/keys; never commit secrets; CI must not call
live OCR.

---

## 6. Admin APIs (proposed for IMPLEMENT L1)

Prefix: `/v1/admin/` (same gate as existing external-agreements).

| Method | Path | Role |
|--------|------|------|
| `POST` | `external-agreements/:id/files` | Attach PDF/image (base64 or multipart — follow asset upload style unless IMPLEMENT picks otherwise) |
| `GET` | `external-agreements/:id/files` | List / get attached file metadata |
| `POST` | `external-agreements/:id/extract` | Run extract (`sandbox` unless live flag + keys) |
| Existing | `POST external-agreements/:id/confirm` | Unchanged semantics → Grant |

On DENY of scan (`rejected`) or extract `failed`: no confirm shortcut; ops fixes or re-uploads.

Create + structured JSON without file remains valid (structured path stays PASS).

---

## 7. Invariants

1. Extract / OCR **never** auto-confirms or auto-creates `rights_grants`.  
2. Confirm **must not** mutate creator `RightsPolicy` (existing sha guard stays).  
3. Snapshots on Grant remain frozen after confirm.  
4. No bulk CSV in this milestone.  
5. No org-member Ops RBAC in this milestone (admin-only).  
6. No HF Nest L2 / webhooks in the same breath.  
7. CI: sandbox extract only; no live OCR network in default `pnpm test`.  
8. AT/DE pilot ≠ legal clearance of uploaded contracts.

---

## 8. Non-goals

- Public self-serve contract upload for brands  
- Multi-file / multi-page OCR pipelines  
- Changing Connect `check` vs `authorize_generation`  
- Stripe Connect / Connect routes  
- Replacing structured JSON ingest  

---

## 9. Acceptance criteria (SPECIFY)

1. This document exists and states L1/L2/L3 + STOP.  
2. AGENTS + RightsGrant + Rights Operations point here; File/OCR = SPECIFY PASS, IMPLEMENT not started.  
3. Explicit reuse of human confirm; dedicated file table; MIME/size locked.  
4. Bulk CSV and live OCR called out as later.  
5. **Zero** upload/OCR implementation code in this milestone.

---

## 10. Acceptance criteria (future IMPLEMENT L1)

1. Admin can attach one allowed file to an agreement.  
2. Sandbox extract moves draft `proposed_rights` to a reviewable state without network OCR.  
3. Confirm still required and still projects `EXISTING_AGREEMENT` Grant.  
4. Denied/failed extract never yields a Grant.  
5. Tests cover upload + sandbox extract + confirm; CI has no live OCR.  
6. **STOP** before L2 UI, L3 live OCR, bulk CSV, org-member.

---

## 11. STOP

**SPECIFY PASS** = this document + AGENTS / Grant / Ops pointers.  
**IMPLEMENT** = only after explicit decision. Suggested next: **L1 admin upload + sandbox extract** only.

Related: `docs/RIGHTS_GRANT_V0_1.md` §5 · `docs/RIGHTS_OPERATIONS_V0_1.md` ·
structured APIs in `apps/api/src/modules/external-agreements.ts`.

---

## Related docs

- `docs/RIGHTS_GRANT_V0_1.md`  
- `docs/RIGHTS_OPERATIONS_V0_1.md`  
- `docs/RIGHTS_OPERATIONS_UI_V0_1.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RIGHTSNET_MVP_CONSTITUTION.md`  
