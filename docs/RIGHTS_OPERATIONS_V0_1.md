# RightsNet Rights Operations v0.1 (SPECIFY)

**Status:** SPECIFY **PASS** — documentation only  
**Date:** September 2026  
**IMPLEMENT:** not started  

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md`.  
Depends on: `docs/RIGHTS_GRANT_V0_1.md` (Policy vs Agreement vs Grant; Existing Deal path).  
Connect: `docs/RIGHTSNET_CONNECT_V0_1.md` (`check` preview vs future `authorize_generation`).

---

## Product thesis

RightsNet can sell to an **agency that never uses the marketplace once**.

Value = turn the agency’s **own** talent agreements into **machine-readable RightsGrants**, then:

1. **Overview** — portfolio health of AI / likeness rights  
2. **Campaign query** — who is cleared for a specific AI use  
3. **Later** — same executable trunk as marketplace deals (`authorize_generation` → partner)

```text
Agency imports talents / contracts / brands / countries
        ↓
Existing Deal → extract → human review → RightsGrant
        ↓
Rights Operations (overview + query)
        ↓
authorize_generation (future) → RN-AUTH → generation partner
```

Marketplace remains the **other** path into the same Grant object. Operations does **not**
rewrite public creator `RightsPolicy` for bilateral deals.

---

## Who it is for

| Actor | Need |
|-------|------|
| Agency rights / talent ops | Inventory of agreements, expiry, AI enablement, exclusivity conflicts |
| Marketing / producers | “Who can I use for AI beauty in DE this October?” |
| Brand legal (later) | Same Grant evidence Connect will use at generation time |

Not required: listing talent on RightsNet Discover or purchasing via marketplace checkout.

---

## Import (conceptual — Existing Deal)

Illustrative scale (product story, not seeded data):

- 482 talents  
- 1,930 contracts  
- 27 brands  
- 16 countries  

Pipeline (Existing Deal):

```text
draft / pending_confirm → human confirm → grant_active (EXISTING_AGREEMENT)
```

**Structured ingest v0.1 is implemented** (admin APIs; no OCR/PDF). See
`docs/RIGHTS_GRANT_V0_1.md` §5 and `POST /v1/admin/external-agreements`.

Human confirm is mandatory before `grant_active`. Bulk CSV / file storage remain later.

Each confirmed agreement projects one or more **RightsGrant** rows with
`source.type = EXISTING_AGREEMENT` and `grantee_organization_id` = the agency (or brand org).

---

## Rights Overview (product metrics — no UI yet)

Surface name: **Rights Overview**. Counts are **derived from structured grants / agreement
state for that organization**, not from mutating marketplace policies.

| Metric | Meaning (product) |
|--------|-------------------|
| Active talent agreements | Grants/agreements currently in force for the org |
| Expiring in 30 days | `valid_until` within 30 days |
| AI rights enabled | Grants that ALLOW relevant synthetic / commercial AI uses |
| AI use prohibited | Explicit DENY (or equivalent) for AI generation uses |
| Approval required | Grant ACTIVE but `approval.*` / REQUIRES_APPROVAL constraints remain |
| Conflicting exclusivity | Overlapping exclusivity constraints across grants for same asset/window |
| Missing structured rights | Agreements uploaded/extracted but not yet human-confirmed into a Grant |

Example portfolio snapshot (illustrative):

```text
RIGHTS OVERVIEW

Active talent agreements       1,387
Expiring in 30 days              126
AI rights enabled                648
AI use prohibited                309
Approval required                430
Conflicting exclusivity           18
Missing structured rights        201
```

---

## Campaign query (product — no UI yet)

Example ask:

> Necesito talento disponible para una campaña AI de cosmética en Alemania durante octubre.

Inputs (conceptual):

- `organization_id` (agency)  
- industry / category (e.g. beauty / cosmetics)  
- territory (e.g. DE)  
- time window (e.g. October)  
- AI use (e.g. synthetic_video + commercial_advertising)

RightsNet evaluates **that org’s** talent relationships against **their** ACTIVE (and
candidate) grants — **not** `POST /v1/platform/check` against a creator’s public marketplace
policy.

Illustrative output:

```text
212 talent relationships

Fully cleared             81
Approval required         37
Not permitted             76
Agreement unclear         18
```

| Bucket | Meaning |
|--------|---------|
| Fully cleared | ACTIVE grant covers use + window; no outstanding approval gates |
| Approval required | Grant exists but creative/other approval still required |
| Not permitted | Grant DENY / no grant / outside territories or industries |
| Agreement unclear | Missing structured rights / unconfirmed extract / conflict |

Nike vs Adidas rule still holds: results are **scoped to the querying organization**.

---

## Relation to Connect

| Surface | Audience | Question |
|---------|----------|----------|
| **Rights Operations** | Agency internal | Portfolio + “who is cleared for this campaign?” |
| **`platform/check`** | Partner / preview | “Would this use be compatible with public policy?” |
| **`authorize_generation`** (future) | Generation partner | “Does this org have executable authority **now**?” |

Operations and `authorize_generation` share **ACTIVE RightsGrant** as source of truth for
bilateral authority. `check` stays policy preview and must not be confused with Operations
cleared counts.

---

## Non-goals (this SPECIFY)

- Building the Overview or query UI  
- Contract upload / OCR / extract jobs  
- Changing Connect v0.1 routes  
- Implementing `authorize_generation` or RN-AUTH  
- Live commerce  

---

## STOP

**SPECIFY PASS** when this file exists, AGENTS points here, and RightsGrant doc links Operations.

**Do not start in the same breath:** dashboard, import pipeline, grant-aware `check`, or
generation APIs.

### Next milestones (one at a time, explicit decision)

1. Operations read-model (overview + campaign query APIs/UI)  
2. Existing Deal files / OCR / bulk import  
3. `authorize_generation` IMPLEMENT  

---

## Related docs

- `docs/RIGHTS_GRANT_V0_1.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RIGHTSNET_MVP_CONSTITUTION.md`  
- `docs/RIGHTSNET_OFFICIAL_FLOW.md`  
