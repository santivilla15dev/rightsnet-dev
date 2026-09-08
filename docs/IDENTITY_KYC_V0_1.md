# Identity KYC v0.1.1

Status: **PASS** (implementation).  
Governing: MVP Constitution §11 (external KYC; no in-house biometrics).

## Goal

Replace “Simular verificación” as the only path with a real **provider port**:

- `IDENTITY_PROVIDER=sandbox` (default): keep simulated verify for local/E2E.
- `IDENTITY_PROVIDER=stripe`: Stripe Identity Verification Sessions (test by default).
- Live Identity: `IDENTITY_LIVE_ENABLED=true` — `docs/IDENTITY_KYC_LIVE_V0_1.md` (**PASS**).

Identity ≠ Stripe Connect (payouts). Publish still needs Connect separately.

## Locked decisions

- External provider only (Stripe Identity). No document OCR / face models owned by RightsNet.
- Persist `identity_checks` with `provider_ref` — **no raw ID images or selfies** in RightsNet DB.
- Creator fields remain: `identity_status`, `identity_expires_at`, `adult_verified`.
- On Stripe `identity.verification_session.verified` → `verified`, expiry +1 year, `adult_verified=true` (MVP; launch gate still requires ops confirmation of age rules).
- Webhook idempotent via unique `provider_ref` + status transitions.
- `POST /v1/assets/:id/identity-sandbox` only when `IDENTITY_PROVIDER=sandbox` **and** `APP_ENV=sandbox`.
- `POST /v1/creators/me/identity-session` starts a check (sandbox instant or Stripe redirect URL).
- **v0.1.1:** Stripe sessions use `options.document.require_matching_selfie=true` (documento + selfie en UI alojada de Stripe).
- **No MFA**, no live commerce, no ES→AT remap.

## Acceptance

1. Migration `013_identity_checks.sql` applies cleanly.
2. Tests with mocked Stripe Identity port: session create, verified webhook, reject path — PASS.
3. `stripeIdentityCreateParams` includes `require_matching_selfie: true` — PASS.
4. Sandbox simulate still works for E2E when provider=sandbox.
5. `GET /v1/config` exposes `identity`.
6. Docs STOP — production KYC ops / age policy confirmation remain launch gates.

## STOP

No MFA. No `LIVE_COMMERCE_ENABLED`. No storing identity document or selfie binaries. No in-app facial recognition models.

Live Identity gated separately: `docs/IDENTITY_KYC_LIVE_V0_1.md`.
