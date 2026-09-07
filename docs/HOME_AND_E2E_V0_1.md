# Home pública + E2E v0.1

Status: **PASS** (2026-09-07).  
Governing: Constitution §28 (10 journeys), §33 (no vanity metrics).

## Goal

1. Public landing at `/` (value prop + demo hub).
2. Marketplace only at `/discover`.
3. Playwright E2E stable with `AUTH_PROVIDER=sandbox` + `PAYMENTS_PROVIDER=sandbox`
   forced for the test stack (local `.env` may use Supabase).
4. Explicit coverage of Constitution §28 journeys 1–10 (Journey 10 = `/verify` link, no AI generator).

## Routes

| Path | Surface |
|------|---------|
| `/` | Home (bare shell) |
| `/discover` | Marketplace |
| `/login` | Sandbox personas or Supabase email (by config) |
| `/verify/:token` | Public license certificate |

## Journey matrix (§28)

| # | Journey | Spec evidence |
|---|---------|---------------|
| 1 | Creator registers + identity | `journeys.spec.ts` onboarding |
| 2 | Registers likeness | evidence upload in onboarding |
| 3 | Configures permissions | creator policy + consent |
| 4 | Publishes asset | onboarding publish |
| 5 | Brand discovers creator | marketplace + buyer login |
| 6 | Configures AI advertising use | buyer campaign form |
| 7 | ALLOW / DENY / REQUIRES_APPROVAL | DENY politics + approval path + buyer ALLOW |
| 8 | Payment + contract | buyer sandbox checkout |
| 9 | Verifiable license | certificate JSON |
| 10 | Output ↔ license verify | anonymous `/verify` (no generator) |

## How to run E2E

```bash
pnpm test:e2e
```

Spins API on `:4010` + web standalone on `:3010` with sandbox auth/payments
(`scripts/e2e-server.mjs`), so a local `pnpm dev` with Supabase on `:3000` can stay up.

## STOP

No MFA, no live commerce, no voice/agents/public API, no ES→AT remap.
