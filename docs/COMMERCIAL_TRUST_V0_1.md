# Commercial trust v0.1

Date: 2026-09-11. SPECIFY PASS. IMPLEMENT PASS; MIGRATE N/A; TEST/RUN/VERIFY focal PASS. Global checks blocked as detailed below.

## Objective

Prepare a credible B2B pilot of real adult likeness licensing for AI advertising,
proposed AT/DE scope. Revenue hypothesis: repeat licensing by agencies, with a
clearly disclosed platform fee under an approved contractual model. No new pricing,
subscription, escrow, guarantee or live activation in this milestone.

## Acceptance

- Public /trust explains policy compatibility versus acquired rights, generation
  authorization and output evidence; missing information never means permission.
- Explicit scope and limits of verification, output review and AI disclosure.
- Home and footer link to trust. Human likeness messaging is unambiguous.
- No fictional testimonials in customer voice; scenarios labelled as examples.
- Counsel/operator handoff lists concrete missing facts and required evidence.
- Browser checks for navigation, public access and mobile layout; typecheck/lint.

## Preserve

Rights Core, RightsGrant, RN-AUTH, GenerationRecord and H1–H6 contracts and historical
snapshots. Existing uncommitted public-polish/blog work. No production flags,
no data migrations, no new tracking, no invented operator/contact/legal terms.

## Sequence

SPECIFY → IMPLEMENT → MIGRATE (none) → TEST → RUN → VERIFY → DOCUMENT → STOP.

## Verification and STOP

- Web typecheck PASS; ESLint of changed TS/TSX files PASS.
- Playwright home/trust: 5/5 PASS against local sandbox stack, including navigation,
  legal provisional pages, public access and 390px no-overflow check.
- Screenshot reviewed: docs/screenshots/trust-mobile.png; home-desktop.png refreshed.
- Fixed footer link wrapping after mobile test exposed overflow.
- Global typecheck FAIL in unchanged backend/test files: Buffer/BodyInit in
  object-store/storage-scan; declarations and implicit any in staging tests;
  spread type in stripe-money. Global lint FAIL: prefer-const in storage-scan.test.ts:148.
  No global PASS or production readiness claimed. Separate technical cleanup needed.
- No migrations, no deployment, no live flags, no legal templates activated.
- Founder confirmed no registered operator exists yet. See COMMERCIAL_LAUNCH_HANDOFF.md.

Files for this milestone: trust.tsx (new), catch-all route, home.tsx, shell.tsx,
globals.css (footer wrap), trust.spec.ts (new), home.spec.ts (headline), this spec,
COMMERCIAL_LAUNCH_HANDOFF.md (new), launch-gates.md, VERIFICATION.md and the two
screenshots. Prior public-polish/blog modifications preserved.

STOP: implementation milestone complete; commercial and legal readiness remain OPEN.
