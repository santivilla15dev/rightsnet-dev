# Higgsfield provider adapter v0.1 — SPECIFY

**Status:** SPECIFY **PASS** · IMPLEMENT **not started**  
**Date:** September 2026  

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md` (no public developer platform /
agents milestone without explicit decision).  
Depends on Connect write/read trunk **PASS**:
`docs/RIGHTSNET_CONNECT_V0_1.md`, `docs/RN_AUTH_V0_1.md`, `docs/REPORT_OUTPUT_V0_1.md`,
`docs/GENERATION_READ_V0_1.md`, `docs/GENERATION_VERIFY_V0_1.md`.

**Documentation only.** Do not wire live Higgsfield calls, MCP, webhooks, or product UI
until an explicit IMPLEMENT decision.

---

## 1. Product question

```text
RightsNet already answers:
  authorize-generation → RN-AUTH
  report-output        → GenerationRecord + RN-GEN

Higgsfield adapter (this SPECIFY)
  → Glue: “pedir permiso → generar en Higgsfield → reportar output”
  → Same org-scoped Grants (Nike ≠ Adidas)
```

The adapter is a **client of RightsNet Connect**, not a second rights engine.  
Higgsfield never decides ALLOW/DENY; RightsNet does.

| Layer | Owner |
|-------|--------|
| Policy / Grant / Auth / Record | RightsNet |
| Pixels / video job | Higgsfield |
| Glue orchestration | This adapter (optional module) |

---

## 2. Naming

| Term | Meaning |
|------|---------|
| **provider string** | Already used in RN-AUTH / report: `"higgsfield"` |
| **Adapter** | Optional RightsNet-side (or reference script) orchestrator |
| **Not** | Public Higgsfield marketplace app, MCP server for all tenants, or “agents” product |

Constitution still forbids opening a general **public** API platform / agents track without
a separate decision. This SPECIFY stays **partner-gated** (same `PLATFORM_API_ENABLED` +
admin, or later partner API keys).

---

## 3. Happy path (orchestration)

```text
1. Input: organization_id, asset_id, use {content_type, purpose, territory, industry?},
          generation brief (prompt / refs — Higgsfield-specific)
2. POST /v1/platform/authorize-generation  (provider: "higgsfield")
3. If REQUIRES_APPROVAL / DENIED → stop; surface reason_codes; no HF job
4. If AUTHORIZED → hold auth_token (payload.auth_id, expires_at)
5. Start Higgsfield generation job (model/preset TBD at IMPLEMENT)
   Attach metadata: auth_id, grant_id, organization_id, RN-AUTH key_id (not private key)
6. Wait / poll until output URI or job id + optional sha256
7. Before auth expires: POST /v1/platform/report-output
   { auth_id, organization_id, provider: "higgsfield",
     output: { content_type, external_job_id, uri?, sha256? },
     idempotency_key: higgsfield_job_id }
8. Return generation_id, public_token (RN-GEN-…), verify_hint
```

**TTL rule:** If HF job outlives RN-AUTH (~1h), adapter must **re-authorize** or fail
closed (do not report under an expired auth). Prefer short jobs or refresh authorize
before report.

---

## 4. Proposed packaging (choose at IMPLEMENT)

| Option | Description | Prefer when |
|--------|-------------|-------------|
| **A. Reference script** `scripts/adapters/higgsfield-demo.ts` | CLI / founder demo; calls Connect + HF | First IMPLEMENT (smallest) |
| **B. Nest module** `apps/api/.../adapters/higgsfield.ts` | Internal route e.g. `POST /v1/platform/adapters/higgsfield/run` | Partner wants one RightsNet call |
| **C. Out-of-repo glue** | Partner owns HF; only uses public Connect HTTP | No RightsNet HF credentials |

**Recommendation:** **A** first (sandbox stub for HF), then optional **B** behind
`HIGGSFIELD_ADAPTER_ENABLED` (default false). Never enable in production without keys +
decision.

### Env (illustrative — IMPLEMENT)

```text
HIGGSFIELD_ADAPTER_ENABLED=false
HIGGSFIELD_API_KEY=          # or MCP session — never commit
HIGGSFIELD_MODE=sandbox|live # sandbox = fake job id + placeholder uri
```

Sandbox mode must still exercise real RightsNet authorize + report against local DB.

---

## 5. What Higgsfield receives / must not receive

**May attach to job metadata:** `auth_id`, `grant_id`, `organization_id`, `asset_id`,
`provider`, `expires_at`, `content_type` / territory snapshot.

**Must not send:** RightsNet private signing keys, license private PEM, Supabase service
role, Stripe secrets, full grant commercial terms beyond what Connect already returns.

**Must not:** Mutate creator `RightsPolicy` based on a generation.

---

## 6. Failure modes

| Case | Behavior |
|------|----------|
| Authorize DENIED / APPROVAL | No HF call |
| HF job fails | No report_output; auth may expire unused (OK) |
| HF succeeds, report fails | Retry report with same `idempotency_key`; do not double-spend new auth if first report landed |
| Org mismatch | Impossible if adapter always passes same org used at authorize |

Nike vs Adidas unchanged: adapter always threads one `organization_id`.

---

## 7. Non-goals (this SPECIFY / first IMPLEMENT)

- Runway / Kling / other providers (copy pattern later)  
- In-app RightsNet “studio” UI for generation  
- Auto-report webhooks from Higgsfield (pull/poll first)  
- C2PA embedding  
- Public MCP server or Cursor-agent product surface  
- Live commerce / public API keys  
- Changing `check` to be grant-aware  

---

## 8. Acceptance criteria (future IMPLEMENT)

1. Sandbox adapter: authorize → fake HF job → report → `RN-GEN` verify 200.  
2. DENIED path never calls HF.  
3. `provider` always `"higgsfield"` on auth and report.  
4. Feature flag off → adapter routes/scripts no-op or 404.  
5. Tests with HF stub (no network required in CI).  
6. Docs/AGENTS STOP before live HF keys in default founder demo unless decided.

---

## 9. STOP

**SPECIFY PASS** = this document + AGENTS/Connect pointers.  
**IMPLEMENT** = only after explicit next-milestone decision.  
Suggested first slice: **sandbox reference script (Option A)** only.

### Sequence after IMPLEMENT of A

1. Optional Nest route (Option B) + flag  
2. Live HF credentials in a controlled env  
3. Other provider adapters (Runway, …) — separate SPECIFY each  

---

## Related docs

- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RN_AUTH_V0_1.md`  
- `docs/REPORT_OUTPUT_V0_1.md`  
- `docs/GENERATION_VERIFY_V0_1.md`  
- `docs/RIGHTSNET_MVP_CONSTITUTION.md`  
