# Live commerce L1 (technical gate) v0.1

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: Identity live **PASS**, MFA **PASS**.  
Roadmap: Identity live → MFA → **live commerce (this)**.

---

## Product

Technical unlock for Stripe **livemode** payments / Connect / refunds / money webhooks
when explicitly gated. Does **not** claim legal clearance, AT–DE pilot readiness, or
`APP_ENV=production`.

---

## Flag

`LIVE_COMMERCE_ENABLED=true` (default **false**; CI off).

Requires `PAYMENTS_PROVIDER=stripe`.

| Condition | Behavior |
|-----------|----------|
| Flag off + livemode object/event | `LIVE_EVENT_BLOCKED` |
| Flag on | Livemode checkout/Connect/webhooks allowed |
| `APP_ENV=production` | Still **blocked** by `assertConfiguration` |

Live secret keys (`sk_live_` / `rk_live_`) allowed when this flag **or**
`IDENTITY_LIVE_ENABLED` is true (Identity-only live keys still need Identity flag).

Code: `assertLiveCommerceAllowed` in `apps/api/src/integrations/stripe.ts`.

`GET /v1/config` → `live_commerce`.

Legal / fiscal / template gates remain in `docs/launch-gates.md` (founder / counsel).

---

## STOP

No production APP_ENV. No voice/agents/public API. No “piloto legal ready” claim.
