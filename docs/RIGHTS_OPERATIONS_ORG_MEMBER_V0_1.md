# Rights Operations org-member access v0.1 — SPECIFY

**Status:** SPECIFY **PASS** · IMPLEMENT **not started**  
**Date:** September 2026  

Depends on: Rights Operations API + UI **PASS**
(`docs/RIGHTS_OPERATIONS_V0_1.md`, `docs/RIGHTS_OPERATIONS_UI_V0_1.md`) — today **admin-only**.

**Documentation only.** Do not change auth gates on overview/campaign until IMPLEMENT.

---

## 1. Product question

```text
Today
  → Only platform admin can call Ops overview / campaign-query (any org)

Org-member (this SPECIFY)
  → owner / employee of an organization can read Ops for **their** org only
  → Admin retains global access
```

Agency buyers should see portfolio clearance without becoming RightsNet admins.
This is **not** public API platform access and **not** Stripe Connect.

---

## 2. Who can access what

| Actor | `GET .../overview` | `POST .../campaign-query` | Other orgs |
|-------|--------------------|---------------------------|------------|
| `users.role = admin` | any `organization_id` | any | yes |
| Org `owner` | own org only | own org only | **403/404** |
| Org `employee` | own org only | own org only | **403/404** |
| Org `buyer` / `viewer` (legacy DB roles) | **deny** in v0.1 | deny | — |
| Non-member | deny | deny | — |

**v0.1 roles in product UI:** `owner` | `employee` (and `agency` as org_kind, not member role).  
Membership table today: `organization_members(organization_id, user_id, role)` —
IMPLEMENT must align allowed member roles with what seed/UI actually insert
(`owner` works; if `employee` is used, migrate CHECK constraint if still
`owner|buyer|viewer` only).

---

## 3. Scope slices (implement one at a time)

| Slice | What | Prefer first? |
|-------|------|----------------|
| **L1** | API authz: member of org OR admin; scope `organization_id` to membership | Yes |
| **L2** | Web Ops UI: non-admin session can open `/ops/rights` for own org (no org picker abuse) | After L1 |
| **L3** | Write paths (confirm agreements, OCR upload) for org owner — **out** of v0.1 | Later decision |

v0.1 = **read-model only** (overview + campaign-query). Ingest/OCR/confirm stay admin
until a later milestone.

---

## 4. API behaviour (proposed IMPLEMENT L1)

Keep paths under `/v1/admin/rights-operations/*` **or** add parallel
`/v1/org/rights-operations/*` — **locked for IMPLEMENT:** keep existing admin paths,
replace `admin()` with `assertOpsReadAccess(user, organizationId)`:

1. If `user.role === 'admin'` → allow.  
2. Else load `organization_members` for `(organization_id, user.id)`.  
3. If role ∈ `{owner, employee}` → allow.  
4. Else → `403 FORBIDDEN` (or `404` to avoid org enumeration — prefer **404** for non-members).

`campaign-query` body must include `organization_id`; same gate.
Never return grants for another org.

---

## 5. UI (L2 — not this SPECIFY’s IMPLEMENT)

- Logged-in org owner/employee: default `organization_id` = their primary membership.  
- Hide “any org” admin picker unless admin.  
- Spanish copy unchanged in spirit.

---

## 6. Invariants

1. Org-member **cannot** see another org’s grants.  
2. Admin path unchanged for support.  
3. No MFA / public developer keys.  
4. Does not open OCR write or Existing Deal confirm to members in v0.1.  
5. `check` vs `authorize_generation` semantics unchanged.  
6. AT/DE pilot ≠ legal clearance.

---

## 7. Non-goals

- Fine-grained permission matrix per metric  
- Inviting members from Ops UI  
- Agency-of-agencies hierarchy  
- Replacing admin external-agreement APIs  

---

## 8. Acceptance (SPECIFY)

1. This document exists with L1/L2/L3 + STOP.  
2. AGENTS + Ops docs point here; IMPLEMENT not started.  
3. Read-only scope and role allow-list locked.  
4. **Zero** authz code changes in this milestone.

---

## 9. Acceptance (future IMPLEMENT L1)

1. Owner/employee can overview/campaign **own** org.  
2. Same user gets 404/403 for another org.  
3. Admin still works for any org.  
4. Tests cover member vs admin vs outsider.  
5. **STOP** before L2 UI polish / L3 member writes.

---

## 10. STOP

**SPECIFY PASS** = this document + AGENTS / Ops pointers.  
**IMPLEMENT** = only after explicit decision. Suggested: **L1 API authz only**.

Related: `docs/RIGHTS_OPERATIONS_V0_1.md` · `docs/RIGHTS_OPERATIONS_UI_V0_1.md` ·
`organization_members` in `packages/db/migrations/001_core.sql`.
