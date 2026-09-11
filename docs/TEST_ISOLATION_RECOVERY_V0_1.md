# Test isolation recovery v0.1

2026-09-11. SPECIFY PASS; IMPLEMENT PASS; VERIFY PASS.

Five failures: two lifecycle expectations contradict official flow/dual-role accounts;
two list tests reuse demo orgs with historical records exceeding pagination bounds;
Connect missing-profile test reuses a user that other tests legitimately turn into a creator.

Use unique test organizations/grants and a unique user without creator profile.
Preserve list bounds, authorization code, demo history and production contracts.
Verify list ordering/cursors explicitly and cross-organization non-disclosure.
Acceptance: focused checks, full suite twice on same test database, typecheck/lint.
MIGRATE: none. RUN: local PostgreSQL *_test only. STOP after verification.

## Implementation

- `tests/creator-lifecycle.test.ts`: APPROVED ≠ dashboard (home `/application`);
  PUBLISHED can access dashboard; creators with org may purchase; admins stay
  `not_buyer`; creators without org → `no_organization`.
- `tests/rn-auth-list.test.ts` + `tests/generation-read-verify.test.ts`: unique
  orgs/grants per run; cursor pages `limit: 1`; cross-org non-disclosure; no
  raised list limits.
- `tests/stripe-connect.test.ts`: insert unique buyer without creator profile for
  `CREATOR_REQUIRED` (no shared `demoIds.other`).

## Verification — 2026-09-11

| Check | Result |
| --- | --- |
| Focused 4 files | 18/18 PASS |
| Full suite run 1 | **312/312 PASS** |
| Full suite run 2 (same DB) | **312/312 PASS** |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |

No production auth changes, no pagination limit increases, no live flags, no migrations.

**STOP.** Global suite green under shared `*_test`. WIP blog/trust UI remains out of this milestone.
