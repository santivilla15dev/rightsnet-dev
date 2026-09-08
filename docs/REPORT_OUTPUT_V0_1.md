# report_output v0.1 — GenerationRecord

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md` (entities GenerationRecord /
OutputAsset; Journey 10 = output associated and later verifiable).  
Depends on: `docs/RN_AUTH_V0_1.md` (IMPLEMENT **PASS**), `docs/RIGHTS_GRANT_V0_1.md`,
`docs/RIGHTSNET_CONNECT_V0_1.md`.

**Public generation verify / partner list:** IMPLEMENT PASS —
`docs/GENERATION_READ_V0_1.md`, `docs/GENERATION_VERIFY_V0_1.md`.

---

## 1. Product question

```text
authorize_generation + RN-AUTH (shipped)
  → Partner holds a short-lived signed auth for this org + asset + use

report_output (IMPLEMENT PASS)
  → Partner reports: “under this auth_id we produced this output”
  → RightsNet stores a permanent GenerationRecord
  → Auth status → CONSUMED
```

| Artifact | Question | Lifetime |
|----------|----------|----------|
| **RightsGrant** | What may this org do? | Grant window |
| **RN-AUTH** | May they generate *right now*? | ~1 hour |
| **GenerationRecord** | Did a specific output use that authority? | Permanent |
| **RN-LIC** | Human-readable marketplace license id | License window |

---

## 2. Route (shipped)

`POST /v1/platform/report-output`  
Gate: `PLATFORM_API_ENABLED` + admin Bearer.

Idempotency: optional `idempotency_key` (≤64). Same key + org → same `generation_id`.

Code: `apps/api/src/modules/report-output.ts`  
Table: `generation_records` (`021_generation_records.sql`)  
Schema: `rightsnet.generation-record/0.1` (output embedded; no separate `output_assets` yet)

---

## 3. Request body

```json
{
  "auth_id": "<uuid>",
  "organization_id": "<uuid>",
  "provider": "higgsfield",
  "idempotency_key": "<optional>",
  "output": {
    "content_type": "synthetic_video",
    "external_job_id": "hf_job_123",
    "uri": "https://partner.example/outputs/abc",
    "sha256": "<optional 64-hex>"
  },
  "notes": "optional ≤500"
}
```

Required: `auth_id`, `organization_id`, `provider`, `output.content_type`, and at least one of
`uri` | `external_job_id` | `sha256`.

---

## 4. Acceptance rules (shipped)

1. Resolve `generation_auths` by `auth_id`.  
2. Must be `ISSUED` (else `AUTH_REVOKED` / `AUTH_CONSUMED` / …).  
3. Request org = ledger org (`ORG_MISMATCH`).  
4. Provider match.  
5. Not expired (**no grace**).  
6. Stored payload signature verifies (`BAD_SIGNATURE`).  
7. `output.content_type` = auth `use.content_type` (`OUTPUT_MISMATCH`).  
8. Insert immutable record + set auth `CONSUMED`.

---

## 5. Success response

```json
{
  "surface": "platform",
  "status": "RECORDED",
  "generation_id": "<uuid>",
  "auth_id": "<uuid>",
  "grant_id": "<uuid>",
  "asset_id": "<uuid>",
  "organization_id": "<uuid>",
  "consumed": true,
  "verify_hint": null
}
```

---

## 6. STOP

**IMPLEMENT PASS** = route + table + consume + tests + docs.  
Do **not** start public `/verify` for generation ids, partner list UI, or provider adapters
without a new milestone decision.

### Next milestones (one at a time)

1. Live Higgsfield / Nest route (optional)  
2. Operations UI  

---

## Related docs

- `docs/RN_AUTH_V0_1.md`  
- `docs/GENERATION_READ_V0_1.md`  
- `docs/GENERATION_VERIFY_V0_1.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RIGHTS_GRANT_V0_1.md`  
- `docs/RIGHTS_OPERATIONS_V0_1.md`  
- `docs/RIGHTSNET_MVP_CONSTITUTION.md`  
