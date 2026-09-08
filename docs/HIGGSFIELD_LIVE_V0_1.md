# Higgsfield live adapter v0.1 — L1 IMPLEMENT

**Status:** SPECIFY **PASS** · IMPLEMENT **L1 PASS** · L2/L3 **not started**  
**Date:** September 2026  

Depends on: `docs/HIGGSFIELD_ADAPTER_V0_1.md` (sandbox Option A **PASS**).  
Connect trunk: authorize → RN-AUTH → report → RN-GEN (**PASS**).

---

## 1. Product question

```text
Sandbox (shipped)
  → Fake hf_sandbox_* job; real RightsNet authorize + report

Live L1 (this IMPLEMENT)
  → Real Higgsfield Cloud job when HIGGSFIELD_MODE=live
  → Same RightsNet glue; still not a second rights engine
```

Higgsfield still **never** decides ALLOW/DENY.

---

## 2. Scope slices

| Slice | What | Status |
|-------|------|--------|
| **L1** | Live HF client inside `runHiggsfieldAdapter` when `HIGGSFIELD_MODE=live` | **PASS** |
| **L2** | Nest route `POST /v1/platform/adapters/higgsfield/run` | not started |
| **L3** | Webhooks / async → auto `report_output` | not started |

Do **not** ship L2+L3 in the same breath.

---

## 3. Live L1 how-to

1. `HIGGSFIELD_ADAPTER_ENABLED=true`  
2. `HIGGSFIELD_MODE=live`  
3. Credentials (**env only**, never commit):
   - `HIGGSFIELD_API_KEY_ID` + `HIGGSFIELD_API_KEY_SECRET`, or  
   - `HIGGSFIELD_API_KEY=keyId:keySecret`  
4. Optional: `HIGGSFIELD_API_BASE` (default `https://api.higgsfield.ai`)  
5. Optional: `HIGGSFIELD_MODEL_PATH` (default `higgsfield-ai/soul/v2/standard` — text→image)  
6. Optional: `HIGGSFIELD_POLL_TIMEOUT_MS` (default `300000`)  

```bash
HIGGSFIELD_ADAPTER_ENABLED=true HIGGSFIELD_MODE=live \
  HIGGSFIELD_API_KEY_ID=… HIGGSFIELD_API_KEY_SECRET=… \
  pnpm exec tsx scripts/adapters/higgsfield-demo.ts \
  --organization-id <uuid> --asset-id <uuid> --brief "Editorial portrait"
```

Flow: `authorize_generation` → POST model path → poll `/requests/{id}/status` →
`report_output` (`idempotency_key` = HF `request_id`) → public verify `RN-GEN`.

On DENIED / REQUIRES_APPROVAL: **no** HF call (`hf_called: false`).

If RN-AUTH is expired (or &lt;30s left) after the HF job: fail closed
(`HIGGSFIELD_AUTH_EXPIRED`) — re-authorize; do not report.

### Default model

Frozen for L1: **Soul v2 standard** (`higgsfield-ai/soul/v2/standard`) — prompt only,
no input media. Override via env or adapter `model` field. Video/I2V models need a
separate decision (media upload).

`sha256` in L1 is a fingerprint of `request_id:uri` (no byte download).

---

## 4. Code

| Piece | Path |
|-------|------|
| Orchestrator | `apps/api/src/modules/adapters/higgsfield.ts` |
| Live HTTP client | `apps/api/src/modules/adapters/higgsfield-live-client.ts` |
| CLI | `scripts/adapters/higgsfield-demo.ts` |
| Tests | `tests/higgsfield-adapter.test.ts` (mocked fetch; **no** network HF in CI) |

---

## 5. Nest route (L2 — not this milestone)

`POST /v1/platform/adapters/higgsfield/run` — deferred.

---

## 6. Non-goals (still)

- RightsNet in-app studio UI  
- Other providers  
- C2PA / watermark  
- Mutating creator `RightsPolicy`  
- Enabling live by default / committing secrets  
- L2 Nest route / L3 webhooks  

---

## 7. Acceptance (L1)

1. Live mode with keys creates a real job **or** clearly errors from HF (not silent stub).  
2. CI remains sandbox + mocked live (no network HF in default `pnpm test`).  
3. DENIED never hits HF.  
4. Successful path yields verifiable `RN-GEN`.  
5. Docs warn: live keys only in controlled envs.  
6. **STOP** before L2/L3, OCR, org-member Ops.

---

## 8. STOP

**IMPLEMENT L1 PASS** = this document + client + orchestrator + tests + AGENTS.  
Next backlog (one at a time, explicit decision): Existing Deal OCR/files · org-member Ops ·
or L2 Nest route.

Related sandbox: `docs/HIGGSFIELD_ADAPTER_V0_1.md`.
