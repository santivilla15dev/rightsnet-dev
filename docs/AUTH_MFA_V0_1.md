# Auth MFA v0.1 (Supabase TOTP)

**Status:** SPECIFY **PASS** · IMPLEMENT **PASS**  
**Date:** September 2026  

Depends on: Auth Supabase v0.2 **PASS**.  
Roadmap: Identity live **PASS** → **MFA (this)** → Live commerce (later).

---

## Product

Optional second factor (authenticator app / TOTP) for Supabase accounts.

- Flag **`MFA_ENABLED=true`** (default **false**; CI/E2E off).
- Requires `AUTH_PROVIDER=supabase`.
- Does **not** enable live commerce.

---

## Flow

```text
password login
  → if MFA enrolled and AAL1→AAL2 needed:
      status: mfa_required (no session cookies yet)
  → POST /v1/auth/supabase/mfa/verify { code }
      → session cookies (AAL2)
```

Enroll (logged-in user):

```text
POST /v1/auth/supabase/mfa/enroll → QR + factor_id
POST /v1/auth/supabase/mfa/enroll/confirm { factor_id, code }
```

---

## API

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/v1/auth/supabase/login` | May return `status: mfa_required` + `factor_id` + pending tokens (not `token`) |
| `POST` | `/v1/auth/supabase/mfa/verify` | Completes login; returns `token` → BFF cookies |
| `POST` | `/v1/auth/supabase/mfa/enroll` | Bearer required |
| `POST` | `/v1/auth/supabase/mfa/enroll/confirm` | Activates factor |

`GET /v1/config` → `mfa_enabled`.

Code: [`apps/api/src/integrations/supabase-auth.ts`](../apps/api/src/integrations/supabase-auth.ts) · UI login MFA step + `/account/security`.

---

## STOP

No phone MFA. No mandatory MFA for all users. No live commerce.
