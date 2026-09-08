# RN-AUTH v0.1 — signed generation authority (SPECIFY)

**Status:** SPECIFY **PASS** · IMPLEMENT **not started**  
**Date:** September 2026  

Governing scope: `docs/RIGHTSNET_MVP_CONSTITUTION.md`.  
Depends on: `docs/RIGHTS_GRANT_V0_1.md`, `docs/RIGHTSNET_CONNECT_V0_1.md`
(`authorize_generation` decision already **PASS**; today `auth_token: null`).

**This milestone is documentation only.** Do not mint tokens, change routes, or add
`report_output` until an explicit IMPLEMENT decision.

---

## 1. Product question

```text
authorize_generation (shipped)
  → ¿Puede esta org generar *ahora*?  → AUTHORIZED | REQUIRES_APPROVAL | DENIED

RN-AUTH (this SPECIFY)
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
| **GenerationRecord** (later) | Audit / verify output | Permanent | Output was reported under an auth |

---

## 2. When a token may exist

Mint **only** if `platformAuthorizeGeneration` would return `decision: "AUTHORIZED"`.

| Decision | `auth_token` |
|----------|--------------|
| `AUTHORIZED` | Signed RN-AUTH envelope (IMPLEMENT) |
| `REQUIRES_APPROVAL` | `null` (same as today) |
| `DENIED` | `null` |

Do **not** mint on approval-required or deny. Do **not** mint from `check` (preview).

Nike vs Adidas unchanged: token embeds `grantee_organization_id` + `grant_id`; Adidas
cannot present Nike’s token as its own authority.

---

## 3. Proposed envelope (illustrative — freeze at IMPLEMENT)

Schema id (proposed): `rightsnet.rn-auth/0.1`

```json
{
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
}
```

Wire format (proposed): compact object returned in `auth_token`:

```json
{
  "payload": { "...envelope..." },
  "signature": "<base64url ed25519 over canonical(payload)>",
  "key_id": "<same kid>"
}
```

Or a single opaque string `RN-AUTH.<base64url(json)>.<sig>` — choose one at IMPLEMENT;
do not ship both.

### Signing reuse

Reuse the same Ed25519 pattern as licenses (`apps/api/src/integrations/signing.ts`:
`canonical` + `signPayload` / `verifyPayload`). Prefer a dedicated key file
(e.g. `.local/keys/rn-auth-private.pem`) so license and auth key rotation can diverge;
kid still = hash(public PEM).slice(0, 16).

### TTL (default proposal)

- Default: **1 hour** from `issued_at`.  
- Hard max: ≤ grant `valid_until` and ≤ 24h.  
- Expired token = not authority (partner must call `authorize-generation` again).

### Public id (optional display)

Human-readable id is **not** required for v0.1. If needed later, prefer
`RN-AUTH-YYYY-######` parallel to `RN-LIC`, without collapsing the two namespaces.

---

## 4. Connect response change (IMPLEMENT only)

Today:

```json
{ "decision": "AUTHORIZED", "auth_token": null, "preview": false, "grant_id": "…" }
```

After RN-AUTH IMPLEMENT (AUTHORIZED only):

```json
{
  "decision": "AUTHORIZED",
  "auth_token": { "payload": { }, "signature": "…", "key_id": "…" },
  "preview": false,
  "grant_id": "…"
}
```

`REQUIRES_APPROVAL` / `DENIED` stay `auth_token: null`.  
No new route required for minting — extend existing
`POST /v1/platform/authorize-generation`.

Optional later (not this SPECIFY): `POST /v1/platform/verify-auth` for partners who
only hold the token blob.

---

## 5. What partners must do with the token

1. Call `authorize-generation` with org + asset + use.  
2. If `AUTHORIZED`, attach `auth_token` to the generation job metadata.  
3. Before/after generation, RightsNet will later accept `report_output` citing
   `auth_id` / grant (separate milestone).  
4. Do **not** treat RN-AUTH as transferable between orgs or as a substitute for payment.

---

## 6. Persistence (IMPLEMENT choices — pick one)

| Option | Pros | Cons |
|--------|------|------|
| **A. Stateless** (sign only; no DB row) | Simple; no store | Harder revoke/audit; replay until expiry |
| **B. Issued row** (`generation_auths` or similar) | Audit + revoke | Migration + cleanup job |

**Recommendation for first IMPLEMENT:** **B** — insert row on mint (`id`, `grant_id`,
`organization_id`, `asset_id`, `provider`, `use` snapshot, `expires_at`, `key_id`,
`signature` or hash), status `ISSUED` | `REVOKED` | `CONSUMED` (consumed when
`report_output` lands — that column/status can wait until report milestone).

Do **not** rewrite historical grant or license snapshots when minting.

---

## 7. Explicit non-goals (this SPECIFY)

- Implementing mint/verify code or migrations  
- `report_output` / `GenerationRecord` / OutputAsset wiring  
- Higgsfield / Runway SDKs or webhooks  
- API keys / public developer platform  
- Changing `check` to be grant-aware  
- MFA, voice, music, agents, live commerce  
- Making RN-AUTH replace RN-LIC on the public verify page  

---

## 8. Acceptance criteria (for a future IMPLEMENT)

1. `AUTHORIZED` returns non-null `auth_token` with verifiable Ed25519 signature.  
2. `REQUIRES_APPROVAL` / `DENIED` still return `auth_token: null`.  
3. Token fails verify if expired, wrong kid, tampered payload, or (if Option B)
   revoked.  
4. Adidas org cannot obtain Nike’s grant authority via token alone.  
5. Tests cover mint + verify + expiry; docs/AGENTS updated; **STOP** before
   `report_output` unless that is a separate explicit decision.

---

## 9. STOP

**SPECIFY PASS** = this document + AGENTS/Connect pointers.  
**IMPLEMENT** = only after founder/agent explicit next-milestone decision.  
**Do not** start `report_output` in the same breath as RN-AUTH mint unless decided.

### Suggested sequence after this SPECIFY

1. **RN-AUTH IMPLEMENT** (mint on AUTHORIZED + verify helper + tests)  
2. **`report_output` SPECIFY → IMPLEMENT** (GenerationRecord bound to `auth_id`)  
3. Partner adapter (Higgsfield, etc.) — separate decision  

---

## Related docs

- `docs/RIGHTSNET_CONNECT_V0_1.md`  
- `docs/RIGHTS_GRANT_V0_1.md`  
- `docs/RIGHTS_OPERATIONS_V0_1.md`  
- `docs/RIGHTSNET_MVP_CONSTITUTION.md` (§ GenerationRecord / Journey 10)  
