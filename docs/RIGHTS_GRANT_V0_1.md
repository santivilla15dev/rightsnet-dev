# RightsGrant v0.1 — domain + marketplace projection

**Status:** SPECIFY **PASS** · IMPLEMENT marketplace projection **PASS** · Existing Deal structured ingest **PASS**  
**Date:** September 2026  
**Existing Deal file/OCR upload:** not started  
**Post-Grant generation trunk:** write + partner read + public verify IMPLEMENT **PASS**
(`docs/GENERATION_READ_V0_1.md`, `docs/GENERATION_VERIFY_V0_1.md`); provider adapters **not started**


Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md`.  
Connect surface: `docs/RIGHTSNET_CONNECT_V0_1.md` (`check` policy preview; `authorize-generation` grant decision).

---

## Convergence (critical)

Marketplace and Existing Deal are **different paths to legal evidence**. After a **RightsGrant** exists, the rest of RightsNet is **identical**.

```text
Marketplace:
Creator Policy
    ↓
Brand request
    ↓
Rights Check
    ↓
Contract
    ↓
Payment
    ↓
RightsNet License
    ↓
RIGHTS GRANT

Existing Deal:
Existing Contract
    ↓
Rights extraction
    ↓
Human confirmation
    ↓
Existing Agreement
    ↓
RIGHTS GRANT

From this point the rest of RightsNet is identical:

RIGHTS GRANT
      ↓
authorize_generation()     ← decision PASS
      ↓
RN-AUTH token              ← IMPLEMENT PASS
      ↓
Higgsfield / Runway / …    ← future
      ↓
output
      ↓
report_output()            ← IMPLEMENT PASS (GenerationRecord)
```

This convergence is why Grant must not be collapsed into Policy, and why Existing Deal must not mutate the creator’s public policy.

---

## 1. Three concepts

| Concept | Question it answers | Today in code | Role |
|---------|---------------------|---------------|------|
| **RightsPolicy** | What is the creator willing to allow *in general*? | `policies` + `RightsPolicy` | Pre-transaction / Discover / Rights Check |
| **Agreement / License** | What legal evidence did two parties agree? | Marketplace: `orders` + `contract_*` + `licenses`. External agreements: **not built** | Immutable legal evidence |
| **RightsGrant** | What is *this* party currently authorized to do, machine-readable? | Table `rights_grants` + Zod `rightsnet.rights-grant/0.1` | Bilateral authority for Connect/AI (generation trunk later) |

### Anti-examples (do not do this)

- **Wrong:** Nike signs with Cristiano → set `Sportswear = ALLOW` on Cristiano’s public policy.  
  Adidas would then look allowed under the same general policy.
- **Wrong:** Treat a signed License payload as the only Connect input without a grantee-scoped grant.  
  Public policy check answers “could someone buy this use?”, not “is Nike already authorized?”
- **Wrong:** Collapse Grant into GenerationRecord.  
  Grant = authority; GenerationRecord (future) = that a specific output used that authority.

### Golden rule (Nike vs Adidas)

```text
Nike → Cristiano     ✓ RightsGrant ACTIVE exists for that grantee+asset
Adidas → Cristiano   ✕ no RightsGrant for Adidas → not authorized by that path
```

Conceptual acceptance test: any design that would make Adidas inherit Nike’s sportswear
allowance by mutating policy **fails**.

---

## 2. Two paths to the same RightsGrant

| Path | Source of truth before Grant | Grant `source.type` |
|------|------------------------------|---------------------|
| New agreement (marketplace) | Policy → check → purchase → issued `License` | `MARKETPLACE_LICENSE` (**implemented**) |
| Existing agreement | Structured intake → **human confirm** → agreement | `EXISTING_AGREEMENT` (**structured ingest implemented**; file/OCR not) |

---

## 3. Canonical shape (`rightsnet.rights-grant/0.1`)

Runtime rows use UUIDs. Product language (`RG_*`, `ORG_NIKE`) remains illustrative.

Marketplace projection payload (built at license issuance):

```json
{
  "schema_version": "rightsnet.rights-grant/0.1",
  "grant_id": "<uuid>",
  "grantor_user_id": "<assets.user_id>",
  "grantee_organization_id": "<orders.organization_id>",
  "asset_id": "<orders.asset_id>",
  "source": {
    "type": "MARKETPLACE_LICENSE",
    "id": "<licenses.id>"
  },
  "rights": { "synthetic_video": "ALLOW" },
  "industry": ["beauty"],
  "territories": ["DE"],
  "approval": {},
  "valid_from": "<license.starts_at>",
  "valid_until": "<license.ends_at>",
  "status": "ACTIVE",
  "scope_snapshot": { }
}
```

`scope_snapshot` is the frozen order `scope` at issuance — never the live creator policy.

---

## 4. Marketplace projection (implemented)

Chain:

1. `requests` → `quotes` → `orders` → `licenses`  
2. On issue ([`apps/api/src/modules/payments.ts`](../apps/api/src/modules/payments.ts) `issueLicenses`):  
   `upsertRightsGrantFromLicense` ([`apps/api/src/modules/rights-grants.ts`](../apps/api/src/modules/rights-grants.ts))  
3. Schema: [`packages/db/migrations/018_rights_grants.sql`](../packages/db/migrations/018_rights_grants.sql)  
4. Backfill: `backfillMarketplaceRightsGrants` (idempotent; run from seed)

**Projection rule (does):**

> When a marketplace License is issued, RightsNet upserts a RightsGrant with
> `source.type = MARKETPLACE_LICENSE`, grantee = `orders.organization_id`, asset =
> `orders.asset_id`, validity from license dates, **without** rewriting `policies.payload`.

License admin status changes sync grant status (`issued`→`ACTIVE`, `suspended`→`SUSPENDED`,
`revoked`→`REVOKED`).

Admin read:

- `GET /v1/admin/rights-grants?organization_id=&asset_id=`
- `GET /v1/admin/rights-grants/:id`

---

## 5. Existing-agreement path (structured ingest v0.1 — implemented)

```text
draft / pending_confirm  →  human confirm  →  grant_active (EXISTING_AGREEMENT)
```

**Structured-first:** ops enters proposed rights as JSON (no OCR/PDF in v0.1).  
Human confirm is mandatory before Grant. Does **not** mutate creator `RightsPolicy`.

| Piece | Location |
|-------|----------|
| Table | `external_agreements` (`019_external_agreements.sql`) |
| APIs (admin) | `POST/GET /v1/admin/external-agreements`, `POST .../:id/confirm` |
| Projection | `upsertRightsGrantFromExternalAgreement` |

File upload / OCR / bulk CSV = later milestone.  
See also `docs/RIGHTS_OPERATIONS_V0_1.md` for B2B overview/query (SPECIFY only).

---

## 6. Connect: `check` vs `authorize_generation`

**Shipped (Connect):**  
`POST /v1/platform/check` → policy **preview** (“would this use be compatible?”).  
Not binding. Not a RightsGrant. See `docs/RIGHTSNET_CONNECT_V0_1.md`.

**Shipped (Connect decision + RN-AUTH):**  
`POST /v1/platform/authorize-generation` → **executable** authority decision  
(“does this org currently have an ACTIVE RightsGrant covering this generation?”).  
Returns `AUTHORIZED` (+ signed `auth_token`) / `REQUIRES_APPROVAL` / `DENIED` (`auth_token: null`).

```text
Active RightsGrant? → use within grant? → approval satisfied? → AUTHORIZED + RN-AUTH
(+ report_output in a later milestone)
```

Marketplace and Existing Deal both feed the same Grant table; Connect’s generation path
is identical after that. Do **not** answer authorize via mutating `RightsPolicy`.

**RightsGrant projection milestones do not change** `check` semantics (still policy preview).

---

## 6b. B2B Rights Operations (agency, no marketplace required)

Agencies can operate on **imported Existing Deal grants** without using Discover/checkout:
portfolio **Rights Overview** + campaign “who is cleared?” queries. Same Grant object;
same `authorize_generation` trunk (decision shipped; RN-AUTH later).

See `docs/RIGHTS_OPERATIONS_V0_1.md` (SPECIFY PASS; UI/import **not started**).


---

## 7. Invariants

1. Snapshots stay frozen (policy/license/grant source).  
2. Grant does not replace Agreement/License.  
3. Grant is not GenerationRecord.  
4. No silent territory/schema rewrites on historical rows.  
5. AT/DE pilot ≠ legal clearance.  
6. Live commerce gated.  
7. No public API platform / keys / MFA / voice / music / agents without an explicit decision.

---

## 8. STOP

**IMPLEMENT marketplace PASS** when:

- `rights_grants` + Zod + License→Grant on issue + backfill + admin GET + tests.  
- Docs/AGENTS state convergence and forbid generation trunk / Existing Deal ingest without a decision.  
- Connect `check` unchanged (policy preview).  
- Zero RN-AUTH / `report_output` / contract-upload code in this Grant projection milestone.

**Next decision (one at a time):** Operations UI · Existing Deal files/OCR ·
provider adapters.
Keep `check` as policy preview. Connect generation read/write/verify trunk is shipped.

---

## Related docs

- `docs/RIGHTSNET_MVP_CONSTITUTION.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RN_AUTH_V0_1.md`  
- `docs/REPORT_OUTPUT_V0_1.md`  
- `docs/GENERATION_READ_V0_1.md`  
- `docs/GENERATION_VERIFY_V0_1.md`  
- `docs/RIGHTS_OPERATIONS_V0_1.md`  
- `docs/RIGHTSNET_OFFICIAL_FLOW.md`  
- `docs/CREATOR_PUBLISH_RIGHTS_CORE_V0_1.md`  
