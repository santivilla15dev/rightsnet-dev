# RN-AUTH v0.1 — signed generation authority

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md`.  
Depends on: `docs/RIGHTS_GRANT_V0_1.md`, `docs/RIGHTSNET_CONNECT_V0_1.md`
(`authorize_generation` decision **PASS**; AUTHORIZED now mints `auth_token`).

**`report_output` / GenerationRecord:** SPECIFY **PASS** · IMPLEMENT **PASS** (`docs/REPORT_OUTPUT_V0_1.md`).

---

## 1. Product question

```text
authorize_generation (shipped)
  → ¿Puede esta org generar *ahora*?  → AUTHORIZED | REQUIRES_APPROVAL | DENIED

RN-AUTH (IMPLEMENT PASS)
  → Si AUTHORIZED: entregar una prueba firmada y de corta vida
    que un partner de generación pueda adjuntar a la corrida.
```

RN-AUTH **no** responde “¿sería compatible con la política pública?” (`check`).  
RN-AUTH **no** es la licencia humana verificable (`RN-LIC-…` en `/verify`).  
RN-AUTH **no** es el registro de que ya se generó un output (`GenerationRecord` / `report_output`).

| Artifact | Audience | Lifetime | Proof of |
|----------|----------|----------|----------|
| **RN-LIC** | Humans / verify page | License window | Marketplace (or future) license issued |
| **RightsGrant** | RightsNet + Connect | Grant window | Bilateral machine authority |
| **RN-AUTH** | Generation partner | Minutes–hours (short) | *This* AUTHORIZED call for *this* use |
| **GenerationRecord** | Audit / verify output | Permanent | Output was reported under an auth (`docs/REPORT_OUTPUT_V0_1.md` IMPLEMENT PASS) |

---

## 2. When a token may exist

Mint **only** if `platformAuthorizeGeneration` returns `decision: "AUTHORIZED"`.

| Decision | `auth_token` |
|----------|--------------|
| `AUTHORIZED` | Signed RN-AUTH envelope + `generation_auths` row |
| `REQUIRES_APPROVAL` | `null` |
| `DENIED` | `null` |

Do **not** mint on approval-required or deny. Do **not** mint from `check` (preview).

Nike vs Adidas unchanged: token embeds `organization_id` + `grant_id`; Adidas
cannot present Nike’s token as its own authority.

---

## 3. Envelope (frozen v0.1)

Schema id: `rightsnet.rn-auth/0.1`

Wire format in Connect response `auth_token`:

```json
{
  "payload": {
    "schema_version": "rightsnet.rn-auth/0.1",
    "auth_id": "<uuid>",
    "grant_id": "<uuid>",
    "organization_id": "<uuid>",
    "asset_id": "<uuid>",
    "provider": "higgsfield",
    "use": {
      "content_type": "synthetic_video",
      "purpose": "commercial_advertising",
      "territory": "DE",
      "industry": "beauty"
    },
    "issued_at": "2026-06-15T12:00:00.000Z",
    "expires_at": "2026-06-15T13:00:00.000Z",
    "key_id": "<16-hex kid>"
  },
  "signature": "<base64url ed25519 over canonical(payload)>",
  "key_id": "<same kid>"
}
```

### Signing

Dedicated Ed25519 key: `.local/keys/rn-auth-private.pem` (see `rnAuthSigningKeys` /
`signRnAuthPayload` in `apps/api/src/integrations/signing.ts`). Same canonical +
base64url pattern as licenses; kid = hash(public PEM).slice(0, 16).

### TTL

- Default: **1 hour** from `issued_at`.  
- Hard max: ≤ grant `valid_until` and ≤ 24h.  
- Expired token = not authority (partner must call `authorize-generation` again).

### Persistence (Option B)

Table `generation_auths` (`020_generation_auths.sql`): status `ISSUED` | `REVOKED` | `CONSUMED`.  
`CONSUMED` reserved for future `report_output`. Helper: `verifyRnAuthToken` (crypto + ledger).

Code: `apps/api/src/modules/generation-auth.ts`, Zod in
`packages/domain/src/rights-core/rn-auth.ts`.

---

## 4. Connect behavior

`POST /v1/platform/authorize-generation` on AUTHORIZED:

```json
{
  "decision": "AUTHORIZED",
  "auth_token": { "payload": { }, "signature": "…", "key_id": "…" },
  "preview": false,
  "grant_id": "…"
}
```

No separate mint route. Partner `POST /v1/platform/verify-auth` = **PASS**
(`docs/RN_AUTH_VERIFY_V0_1.md`; read-only, no consume).

---

## 5. Explicit non-goals (still STOP)

- `report_output` / `GenerationRecord` / OutputAsset  
- Higgsfield / Runway SDKs or webhooks  
- API keys / public developer platform  
- Changing `check` to be grant-aware  
- Public verify page for RN-AUTH (RN-LIC stays human verify)  

---

## 6. STOP

**IMPLEMENT PASS** = mint on AUTHORIZED + ledger + verify helper + tests + docs.  
**Do not** start public generation verify in the same breath as further RN-AUTH work.

### Next milestones (one at a time)

1. IMPLEMENT Existing Deal OCR L1 / org-member Ops / HF Nest L2  
   (OCR SPECIFY PASS — `docs/EXISTING_DEAL_OCR_V0_1.md`)

---

## Related docs

- `docs/RN_AUTH_VERIFY_V0_1.md`  
- `docs/REPORT_OUTPUT_V0_1.md`  
- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RIGHTS_GRANT_V0_1.md`  
- `docs/RIGHTS_OPERATIONS_V0_1.md`  
- `docs/RIGHTSNET_MVP_CONSTITUTION.md`  
