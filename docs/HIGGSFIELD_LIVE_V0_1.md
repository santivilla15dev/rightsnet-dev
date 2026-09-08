# Higgsfield live adapter v0.1 — SPECIFY

**Status:** SPECIFY **PASS** · IMPLEMENT **not started**  
**Date:** September 2026  

Depends on: `docs/HIGGSFIELD_ADAPTER_V0_1.md` (sandbox Option A **PASS**).  
Connect trunk: authorize → RN-AUTH → report → RN-GEN (**PASS**).

**Documentation only.** Do not call live Higgsfield APIs, store API keys in repo, or add
Nest routes until an explicit IMPLEMENT decision.

---

## 1. Product question

```text
Sandbox (shipped)
  → Fake hf_sandbox_* job; real RightsNet authorize + report

Live (this SPECIFY)
  → Real Higgsfield generation job
  → Same RightsNet glue; still not a second rights engine
```

Higgsfield still **never** decides ALLOW/DENY.

---

## 2. Scope slices (implement one at a time)

| Slice | What | Prefer first? |
|-------|------|----------------|
| **L1** | Replace stub with live HF client inside `runHiggsfield*` when `HIGGSFIELD_MODE=live` | Yes |
| **L2** | Nest route `POST /v1/platform/adapters/higgsfield/run` (flag-gated) | After L1 works in CLI |
| **L3** | Webhooks / async job completion → auto `report_output` | Later |

Do **not** ship L2+L3 in the same breath as L1.

---

## 3. Live client requirements (L1)

1. `HIGGSFIELD_ADAPTER_ENABLED=true`  
2. `HIGGSFIELD_MODE=live`  
3. `HIGGSFIELD_API_KEY` (or documented MCP/session secret) — **env only**, never commit  
4. Authorize via existing `platformAuthorizeGeneration` (`provider: "higgsfield"`)  
5. On AUTHORIZED only: create HF job; attach metadata (`auth_id`, `grant_id`, org, asset)  
6. Poll/wait until output URI and/or sha256 + `external_job_id`  
7. If job duration risks RN-AUTH expiry (~1h): **re-authorize** or fail closed before report  
8. `platformReportOutput` with `idempotency_key = hf_job_id`  
9. Return `public_token` / `verify_hint`  

On DENIED / REQUIRES_APPROVAL: **no** HF call (`hf_called: false`).

### Model / preset

Freeze at IMPLEMENT against current Higgsfield catalog (image vs video). Adapter input may
add optional `model` / `preset` fields; defaults must be documented.

---

## 4. Nest route (L2 — optional)

`POST /v1/platform/adapters/higgsfield/run`  

- Same body as sandbox orchestrator  
- Gate: `PLATFORM_API_ENABLED` + admin + `HIGGSFIELD_ADAPTER_ENABLED`  
- 404 if flag off  
- Does not open public API keys  

---

## 5. Non-goals

- RightsNet in-app “studio” UI  
- Other providers (Runway, …) — separate SPECIFY  
- C2PA / watermark  
- Mutating creator `RightsPolicy`  
- Committing secrets or enabling live by default  

---

## 6. Acceptance criteria (future IMPLEMENT L1)

1. Live mode with test key creates a real job **or** clearly errors from HF (not silent stub).  
2. CI remains sandbox-only (no network HF in default `pnpm test`).  
3. DENIED never hits HF.  
4. Successful path yields verifiable `RN-GEN`.  
5. Docs warn: live keys only in controlled envs.  
6. **STOP** before L2/L3 unless decided.

---

## 7. STOP

**SPECIFY PASS** = this document + AGENTS pointers.  
**IMPLEMENT** = only after explicit decision. Suggested: **L1 CLI live** only.

Related sandbox: `docs/HIGGSFIELD_ADAPTER_V0_1.md`.  
Agency UI alternative next: `docs/RIGHTS_OPERATIONS_UI_V0_1.md`.

---

## Related docs

- `docs/HIGGSFIELD_ADAPTER_V0_1.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RN_AUTH_V0_1.md`  
- `docs/REPORT_OUTPUT_V0_1.md`  
