# Identity KYC live v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: Identity KYC v0.1.1 **PASS** (`docs/IDENTITY_KYC_V0_1.md`).

---

## Product

Allow Stripe Identity **livemode** Verification Sessions when explicitly gated.
Does **not** enable live commerce, MFA, or Stripe Connect payouts.

---

## Flag

`IDENTITY_LIVE_ENABLED=true` (default **false**).

| Condition | Behavior |
|-----------|----------|
| Flag off + livemode session/event | `LIVE_IDENTITY_BLOCKED` (503) |
| Flag on + `IDENTITY_PROVIDER=stripe` | Allow create + webhook with `livemode: true` |
| CI / E2E | Flag off; `IDENTITY_PROVIDER=sandbox` |

Live Stripe secret keys (`sk_live_` / `rk_live_`) are accepted by
`assertConfiguration` **only** when this flag is true. `LIVE_COMMERCE_ENABLED`
and `APP_ENV=production` remain blocked.

Code: `assertIdentityLivemodeAllowed` in
`apps/api/src/integrations/identity-kyc.ts` · used by create session and
`ingestIdentityEvent`.

`GET /v1/config` exposes `identity_live_enabled`.

---

## Roadmap (after STOP — do not open here)

1. ~~Identity live~~ (this milestone)  
2. **MFA** — explicit next decision  
3. **Live commerce** — explicit decision after MFA STOP  

No voice / music / agents / public API in this sequence.

---

## STOP

No MFA. No `LIVE_COMMERCE_ENABLED`. No biometric blobs in RightsNet DB.
Age/ops policy confirmation remains a launch gate.
