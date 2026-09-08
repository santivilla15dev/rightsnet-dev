# report_output v0.1 — GenerationRecord (SPECIFY)

**Status:** SPECIFY **PASS** · IMPLEMENT **not started**  
**Date:** September 2026  

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md` (entities GenerationRecord /
OutputAsset; Journey 10 = output associated and later verifiable).  
Depends on: `docs/RN_AUTH_V0_1.md` (IMPLEMENT **PASS**), `docs/RIGHTS_GRANT_V0_1.md`,
`docs/RIGHTSNET_CONNECT_V0_1.md`.

**This milestone is documentation only.** Do not add routes, tables, or consume RN-AUTH
until an explicit IMPLEMENT decision.

---

## 1. Product question

```text
authorize_generation + RN-AUTH (shipped)
  → Partner holds a short-lived signed auth for this org + asset + use

report_output (this SPECIFY)
  → Partner reports: “under this auth_id we produced this output”
  → RightsNet stores a permanent GenerationRecord (and optional OutputAsset metadata)
  → Later humans/partners can verify the association (Journey 10)
```

| Artifact | Question | Lifetime |
|----------|----------|----------|
| **RightsGrant** | What may this org do? | Grant window |
| **RN-AUTH** | May they generate *right now*? | ~1 hour |
| **GenerationRecord** | Did a specific output use that authority? | Permanent |
| **RN-LIC** | Human-readable marketplace license id | License window |

**Do not** collapse Grant into GenerationRecord.  
**Do not** treat RN-AUTH alone as proof that generation happened.  
**Do not** mutate public `RightsPolicy` when reporting (Nike ≠ Adidas).

---

## 2. Who calls it

Partner-gated Connect surface (same gate as today):

- `PLATFORM_API_ENABLED=true`
- Authenticated **admin** Bearer (until API keys milestone)

Proposed route:

`POST /v1/platform/report-output`

Idempotency: client may send `idempotency_key` (uuid or opaque ≤64 chars). Same key +
same org → return the existing record (no double consume).

---

## 3. Request body (illustrative — freeze at IMPLEMENT)

```json
{
  "auth_id": "<uuid from RN-AUTH payload>",
  "organization_id": "<uuid>",
  "provider": "higgsfield",
  "idempotency_key": "<optional>",
  "output": {
    "content_type": "synthetic_video",
    "external_job_id": "hf_job_123",
    "uri": "https://partner.example/outputs/abc",
    "sha256": "<optional hex>",
    "mime_type": "video/mp4",
    "width": 1080,
    "height": 1920,
    "duration_ms": 15000,
    "created_at": "2026-06-15T12:10:00.000Z"
  },
  "notes": "optional free text ≤500"
}
```

Minimal required at IMPLEMENT: `auth_id`, `organization_id`, `provider`,
`output.content_type`, and at least one of `output.uri` | `output.external_job_id` |
`output.sha256`.

---

## 4. Acceptance rules (product)

1. Resolve `generation_auths` by `auth_id`.  
2. Row must be `ISSUED` (not `REVOKED` / already `CONSUMED` unless idempotent replay).  
3. `organization_id` on request **must equal** ledger + token org (Adidas cannot report under Nike auth).  
4. `provider` must match the minted auth.  
5. Auth must not be expired at report time (or allow short grace ≤5 min — decide at IMPLEMENT; default **no grace**).  
6. Cryptographic verify of stored payload/signature still passes (tamper → reject).  
7. `output.content_type` should match auth `use.content_type` (mismatch → `DENIED` / `OUTPUT_MISMATCH`).  
8. On success:  
   - Insert **GenerationRecord** (immutable snapshot: auth_id, grant_id, org, asset, use, provider, output metadata, reported_at).  
   - Optionally insert **OutputAsset** row (uri/hash/mime) linked 1:1 or 1:N — v0.1 may embed output in the record JSON and defer a separate table.  
   - Set `generation_auths.status = 'CONSUMED'` (one successful report per auth_id, unless idempotent replay returns the same record).

Nike vs Adidas: wrong `organization_id` → deny even if `auth_id` leaked.

---

## 5. Response (illustrative)

Success:

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

`verify_hint` may later point to a public verify URL; **v0.1 SPECIFY does not require**
extending `/verify/RN-LIC-…` to GenerationRecords. Journey 10 today remains license
verify; generation verify can be admin/partner read or a later public surface.

Errors (examples): `AUTH_NOT_FOUND`, `AUTH_EXPIRED`, `AUTH_REVOKED`, `AUTH_CONSUMED`,
`ORG_MISMATCH`, `PROVIDER_MISMATCH`, `OUTPUT_MISMATCH`, `BAD_SIGNATURE`.

---

## 6. Persistence sketch (IMPLEMENT)

| Table | Role |
|-------|------|
| `generation_auths` (exists) | Flip `ISSUED` → `CONSUMED` |
| `generation_records` (new) | Immutable report + output snapshot |
| `output_assets` (optional v0.1) | Defer if snapshot JSON is enough |

Proposed schema id: `rightsnet.generation-record/0.1`

Preserve snapshots: never rewrite historical grant/license/auth payloads when recording.

---

## 7. Relation to Connect trunk

```text
check                    → policy preview
authorize-generation     → grant decision + RN-AUTH mint
report-output            → GenerationRecord + consume auth   ← this SPECIFY
(verify generation)      → later (public or partner read)
```

Do **not** make `check` grant-aware. Do **not** auto-report from RightsNet (partner
pushes the report).

---

## 8. Explicit non-goals

- Implementing the route, migration, or UI  
- Hosting/storing binary media in RightsNet (URI/hash only)  
- C2PA embedding, watermarks, or provider webhooks  
- Extending public `/verify` to generation ids (separate decision)  
- API keys / public developer platform  
- MFA, voice, music, agents, live commerce  

---

## 9. Acceptance criteria (future IMPLEMENT)

1. Happy path: valid RN-AUTH → `RECORDED` + auth `CONSUMED` + row persisted.  
2. Second report same `auth_id` without idempotency → reject `AUTH_CONSUMED`.  
3. Idempotent replay → same `generation_id`.  
4. Org mismatch / expired / tampered → reject; auth not consumed.  
5. Tests + AGENTS/Connect docs; **STOP** before public generation verify UI/API unless decided.

---

## 10. STOP

**SPECIFY PASS** = this document + AGENTS/Connect pointers.  
**IMPLEMENT** = only after explicit next-milestone decision.  
Do **not** bundle partner adapters or public verify in the same breath.

### Suggested sequence after this SPECIFY

1. **report_output IMPLEMENT** (route + `generation_records` + consume)  
2. Partner read / admin list of generations  
3. Optional public verify for generation ids  
4. Provider adapters (Higgsfield, …)

---

## Related docs

- `docs/RN_AUTH_V0_1.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RIGHTS_GRANT_V0_1.md`  
- `docs/RIGHTS_OPERATIONS_V0_1.md`  
- `docs/RIGHTSNET_MVP_CONSTITUTION.md`  
