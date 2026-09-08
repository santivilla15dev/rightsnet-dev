# Rights Operations UI v0.1 — SPECIFY

**Status:** SPECIFY **PASS** · IMPLEMENT **not started**  
**Date:** September 2026  

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md`.  
Depends on: `docs/RIGHTS_OPERATIONS_V0_1.md` (read-model API **PASS**:
`GET .../overview`, `POST .../campaign-query`).

**Documentation only.** Do not build pages until an explicit IMPLEMENT decision.

---

## 1. Product question

```text
API already answers (admin):
  overview       → portfolio health counts
  campaign-query → who is cleared for this AI use

Operations UI (this SPECIFY)
  → Same answers in Spanish UI for agency / founder admin
  → Not Discover, not marketplace checkout, not Connect partner keys
```

Audience: **admin** (same gate as API today). Org-member self-serve = later milestone.

---

## 2. Routes (proposed)

| Path | Purpose |
|------|---------|
| `/ops/rights` | Rights Overview for a selected organization |
| `/ops/rights/campaign` | Campaign “who is cleared?” form + buckets |

Reuse existing `/ops` admin shell (`apps/web/src/components/admin.tsx`) as entry —
link “Rights Operations” without inventing a parallel design system.

Optional query: `?organization_id=<uuid>` (required to load data).

---

## 3. Screens

### 3a. Overview

- Org picker (uuid or seeded demo org list for sandbox)  
- Metrics from `GET /v1/admin/rights-operations/overview`  
- One job per section: headline + short Spanish copy + metric list  
- No cards-as-decoration; metrics as a clear list/table  
- CTA: “Consultar campaña” → campaign screen  

Do **not** invent metrics the API does not return.

### 3b. Campaign query

Form fields mapped 1:1 to API:

- organization_id  
- industry  
- territory  
- window_start / window_end  
- content_type / purpose (defaults: synthetic_video / commercial_advertising)

Submit → `POST /v1/admin/rights-operations/campaign-query`  
Show buckets: fully_cleared / approval_required / not_permitted / agreement_unclear  
(+ relationship counts). List item ids only if API already returns them; do not fake talent names.

---

## 4. Auth / env

- Same session as `/ops` (admin)  
- API calls with admin Bearer  
- No new public routes  

---

## 5. Non-goals

- Org-member (non-admin) RBAC  
- OCR / file upload UI  
- Embedding Higgsfield generation in this UI  
- Rewriting Connect or public policy  
- Live commerce  

---

## 6. Acceptance criteria (future IMPLEMENT)

1. Overview loads for demo org with seed metrics ≥0.  
2. Campaign form returns four buckets without console errors.  
3. Wrong org / forbidden → clear Spanish error.  
4. Docs/AGENTS updated; **STOP** before org-self-serve or OCR UI.

---

## 7. STOP

**SPECIFY PASS** = this document + pointers.  
**IMPLEMENT** = only after explicit decision. Prefer this UI **before** live Higgsfield
if the founder’s next buyer is an agency; prefer live HF if the next buyer is a generation partner.

---

## Related docs

- `docs/RIGHTS_OPERATIONS_V0_1.md`  
- `docs/RIGHTS_GRANT_V0_1.md`  
- `docs/HIGGSFIELD_LIVE_V0_1.md`  
