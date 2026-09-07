# Auth Supabase v0.2 (email + Google/Apple)

Status: **PASS target** for this milestone.  
Governing: MVP Constitution §26. MFA = **out**.

## Goal

Product auth screens with:

- Email + password (signup / login / forgot password)
- OAuth Google + Apple (browser Supabase → `/auth/callback` → RightsNet cookies)
- Role choice marca/creador on signup (also applied to OAuth via sessionStorage)

`AUTH_PROVIDER=sandbox` remains agents/E2E default.

## Locked decisions

- Cookies httpOnly via BFF (`rightsnet_session` / `rightsnet_refresh`).
- Signup creates an account only (no permanent buyer/creator lock). Post-signup `/welcome` chooses first space.
- Capacities: `has_creator` + organization memberships. `users.role` stays legacy (`buyer` for new accounts; `admin` special).
- Brand path: `/welcome` → `/company/setup` (`POST /v1/organizations/setup`) → `/company/ready` → `/discover`.
- Org domicile countries: `AT` | `DE` | `ES`. Country is company domicile, not campaign license territory.
- `POST /v1/organizations/bootstrap` remains for minimal/legacy bootstrap.
- `POST /v1/auth/supabase/session` provisions after OAuth tokens.
- Browser needs `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- No GitHub/Facebook/Microsoft. No MFA.

## Acceptance

1. Unit tests: login, signup, session provision, forgot-password mock.
2. E2E sandbox: login sin personas; OAuth no requerido en sandbox.
3. Runbook documents Google/Apple + redirect URLs.
4. STOP — MFA / live commerce later.
