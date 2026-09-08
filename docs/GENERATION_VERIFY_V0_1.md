# Generation public verify v0.1 — SPECIFY

**Status:** SPECIFY **PASS** · IMPLEMENT **not started**  
**Date:** September 2026  

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md` (Journey 10 — output associated and
later verifiable).  
Depends on: `docs/REPORT_OUTPUT_V0_1.md` (IMPLEMENT **PASS**).  
Related (separate milestone): `docs/GENERATION_READ_V0_1.md` (partner list/GET).

**Documentation only.** Do not add public routes or web pages until an explicit IMPLEMENT
decision. Prefer shipping partner **read** (`GENERATION_READ_V0_1.md`) first.

---

## 1. Product question

```text
Anyone holding a generation public id (or uuid) can ask:
  → “¿RightsNet tiene constancia de que este output se reportó bajo una autorización?”
```

Parallel to license verify:

| Artifact | Public id today | Verify surface |
|----------|-----------------|----------------|
| License | `RN-LIC-YYYY-######` | `GET /v1/public/licenses/:token/verify` + `/verify/:token` |
| Generation | *(proposed below)* | Public API + optional web page |

**Do not** collapse generation verify into license verify.  
**Do not** expose partner-only URIs that are secrets if marked private (v0.1: only show
fields safe for public: content_type, provider, reported_at, asset/creator display hints,
sha256 if present — **omit** raw partner `uri` if it is a signed/private URL; prefer
`sha256` / `external_job_id` / redacted host).

---

## 2. Public identifier (choose at IMPLEMENT)

| Option | Example | Pros |
|--------|---------|------|
| **A. Use `generation_id` uuid** | `/verify/generation/<uuid>` | No new column |
| **B. Mint `public_token`** | `RN-GEN-YYYY-######` | Parallel to RN-LIC; nicer UX |

**Recommendation:** **B** at IMPLEMENT — add nullable `public_token` on
`generation_records` (backfill on read or at report_output time). Until then SPECIFY
allows A as interim.

Do **not** reuse the `RN-LIC-` namespace.

---

## 3. Proposed API

`GET /v1/public/generations/:token/verify`  
No auth. Rate-limit later (out of scope for SPECIFY detail).

### Success (illustrative)

```json
{
  "surface": "public",
  "status": "RECORDED",
  "public_token": "RN-GEN-2026-000001",
  "generation_id": "<uuid>",
  "reported_at": "2026-06-15T12:10:00.000Z",
  "provider": "higgsfield",
  "content_type": "synthetic_video",
  "sha256": "<or null>",
  "asset_id": "<uuid>",
  "organization_id": "<uuid>",
  "grant_id": "<uuid>",
  "auth_consumed": true
}
```

### Not found

404 `NOT_FOUND` — same shape spirit as license verify (no leak of other ids).

### Explicitly omitted from public payload

- RN-AUTH signature / key material  
- Full grant payload / commercial terms  
- Partner private media URLs (unless product decides they are already public)  
- Internal idempotency keys  

---

## 4. Web UI (optional same IMPLEMENT or follow-up)

`/verify/generation/:token` or `/verify/:token` with prefix detection (`RN-GEN-` vs `RN-LIC-`).

v0.1 SPECIFY: **API first**; thin web page may ship in the same IMPLEMENT if cheap,
else separate micro-milestone. Do not block API on polished UI.

`report_output` today returns `verify_hint: null` — after public verify IMPLEMENT, may
return `${webUrl}/verify/generation/${public_token}`.

---

## 5. Non-goals

- Partner list/GET (other doc)  
- Hosting video files  
- C2PA / watermark verification  
- Changing Journey 10 license-only e2e until generation path is chosen  
- Opening public API keys / Connect without admin  

---

## 6. Acceptance criteria (future IMPLEMENT)

1. Known public token → 200 with safe fields.  
2. Unknown token → 404.  
3. No RN-AUTH secrets in response.  
4. Nike generation token does not reveal Adidas-only secrets.  
5. Tests + docs; update `verify_hint` if web path ships.  
6. **STOP** before provider adapters / Operations UI unless decided.

---

## 7. STOP

**SPECIFY PASS** = this document + pointers.  
**IMPLEMENT** = only after explicit decision. Suggested order:

1. `GENERATION_READ_V0_1` IMPLEMENT (partner list/GET)  
2. **This** IMPLEMENT (public verify + optional `RN-GEN` token)  
3. Provider adapters  

---

## Related docs

- `docs/REPORT_OUTPUT_V0_1.md`  
- `docs/GENERATION_READ_V0_1.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RIGHTSNET_OFFICIAL_FLOW.md`  
- `docs/RIGHTSNET_MVP_CONSTITUTION.md` (§28 Journey 10)  
