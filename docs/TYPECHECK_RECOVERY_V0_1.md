# Typecheck recovery v0.1

2026-09-11 — SPECIFY PASS; implementation/verification pending.

Objective: restore global TypeScript and lint gates without weakening strict mode,
changing rights/payment contracts or enabling live. Fix fetch body typing while
preserving exact signed bytes, type declarations for JSDoc script helpers, and
invalid test fixture typing. Existing public UI changes preserved.

Acceptance: pnpm typecheck, pnpm lint, focused storage/staging/product-ready/money
checks; complete test suite attempted and failures recorded. Build verification.
No migrations or new product semantics. STOP after documented verification.

## Implementation

- object-store.ts: materialize exact Buffer view as owned Uint8Array for fetch;
  supports ArrayBuffer-backed BodyInit without unsafe casts or extra pooled bytes.
- storage-scan.test.ts: typed Response body, const fixture, nonzero-offset multipart
  payload; assert each transmitted part equals the source slice and its signed hash.
- staging-health.mjs: JSON body explicitly unknown. Three adjacent .d.mts files
  generated from JSDoc, preserving strict TS and existing runtime scripts.
- stripe-money.test.ts: event fixture typed Stripe.Event instead of never before spread.

Declaration regeneration:
`pnpm exec tsc --allowJs --declaration --emitDeclarationOnly --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck --outDir /tmp/rn-script-types scripts/lib/staging-health.mjs scripts/lib/staging-security-checks.mjs scripts/lib/product-ready-checks.mjs`
Copy generated .d.mts into scripts/lib when helper signatures change.

## Verification — 2026-09-11

IMPLEMENT PASS; MIGRATE N/A; TYPECHECK/LINT PASS; BUILD PASS.
26/26 focused tests PASS; strengthened multipart test rerun 7/7 PASS.
Full suite: 307 PASS / 5 FAIL across 53 test files (49 passing files).

Remaining failures, outside these changes:
- creator-lifecycle: approved dashboard expectation; creator purchase reason not_buyer
  versus no_organization. Review current dual-account contract before correcting tests.
- rn-auth-list and generation-read-verify: expected fixtures absent from bounded lists
  in reused test DB; isolate fixtures and verify ordering/pagination, do not raise limits
  just to satisfy tests.
- stripe-connect: shared demo other user now has a creator profile; investigate fixture
  ownership before classifying as access-control bug or changing production code.

No browser/manual product test required for these non-UI changes; build verifies web
compilation. No deployment, migration, live activation, contract changes or legal clearance.
Global suite is NOT PASS. STOP this bounded recovery milestone.
