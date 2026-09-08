# Rights Operations org-member access v0.1 — L1 IMPLEMENT

**Status:** SPECIFY **PASS** · IMPLEMENT **L1 PASS** · L2 UI / L3 member writes **not started**  
**Date:** September 2026  

Depends on: Rights Operations API + UI **PASS**
(`docs/RIGHTS_OPERATIONS_V0_1.md`, `docs/RIGHTS_OPERATIONS_UI_V0_1.md`).

---

## 1. Product

```text
Admin → overview / campaign for any organization_id
Org owner | employee → same read APIs for **their** org only
Other / viewer / buyer membership → 404
```

Read-model only. Existing Deal confirm / OCR upload stay **admin**.

---

## 2. Scope slices

| Slice | What | Status |
|-------|------|--------|
| **L1** | `assertOpsReadAccess` on overview + campaign-query; `employee` role in DB | **PASS** |
| **L2** | Web Ops UI for non-admin (default own org) | not started |
| **L3** | Member write paths (confirm / OCR) | not started |

---

## 3. Shipped (L1)

| Piece | Path |
|-------|------|
| Auth helper | `assertOpsReadAccess` in `apps/api/src/common/auth.ts` |
| Controllers | `GET/POST .../rights-operations/*` use assert instead of `admin()` |
| Migration | `024_org_member_employee_role.sql` (`owner\|employee\|buyer\|viewer`) |
| Tests | `tests/rights-operations-org-member.test.ts` |

Non-members and `viewer`/`buyer` membership → **404** (no org enumeration).

---

## 4. Acceptance (L1)

1. Owner/employee can overview/campaign own org.  
2. Same user gets 404 for another org.  
3. Admin still works for any org.  
4. Tests cover member vs admin vs outsider vs viewer.  
5. **STOP** before L2 UI / L3 writes.

---

## 5. STOP

**IMPLEMENT L1 PASS** = authz + migration + tests + AGENTS.  
Do **not** open Ops UI org-member polish or member writes without an explicit decision.
