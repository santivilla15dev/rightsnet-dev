# RightsPolicy, Rights Passport and License Engine v0.1

Status: pure engine implementation and acceptance suite **PASS** (2026-09-07); purchase-path integration **pending**. Do not treat the live sandbox purchase flow as conforming to this schema yet.
Governing scope: [MVP Constitution](RIGHTSNET_MVP_CONSTITUTION.md).
This document specifies the Rights Core engine. Runtime module: `packages/domain/src/rights-core/`. Acceptance: `tests/rights-core-acceptance.test.ts`. Legacy `rightsnet.policy/0.1` / `evaluateLicense` remain the purchase path until an explicit migration milestone.

## Boundaries and compatibility

One individual creator licenses their own visual likeness to one verified buyer organization
for AI-generated commercial advertising. No sublicensing, exclusivity, training or voice.
The proposed new-policy territory vocabulary is AT and DE. Existing ES sandbox records
remain readable with their original policy, consent, contract and license hashes.
The new schema identifier is `rightsnet.rights-policy/0.1`; the existing
`rightsnet.policy/0.1` is a distinct legacy schema and must not change meaning.

This milestone specifies schemas, decision rules and acceptance cases. It adds no screens,
generation service, public API platform, payment feature or legal template. The 24-hour
lead time and 30/90-day durations below retain existing sandbox product constraints;
they are product decisions, not jurisdictional requirements.

## Typed records

All records use strict schemas: unknown fields and unsupported schema versions are rejected.
Identifiers are UUIDs, hashes are lowercase SHA-256 hexadecimal, money is integer EUR cents,
timestamps are explicit UTC ISO-8601 instants. Reject NaN, Infinity, duplicate set entries,
empty required sets, invalid dates, negative prices and decimal money.

```typescript
type RuleState = 'ALLOW' | 'DENY' | 'REQUIRES_APPROVAL' | 'NOT_SPECIFIED';
type Industry = 'beauty' | 'lifestyle' | 'fashion' | 'alcohol'
  | 'gambling' | 'tobacco' | 'political_advertising' | 'adult';
type Operation = 'synthetic_image' | 'synthetic_video';
type Channel = 'instagram' | 'tiktok' | 'youtube';
type Territory = 'AT' | 'DE';
type DurationDays = 30 | 90;
type Rules<K extends string> = Record<K, RuleState>;

interface RightsPolicy {
  schema_version: 'rightsnet.rights-policy/0.1';
  policy_id: string;
  asset_id: string;
  creator_id: string;
  revision: number; // positive, monotonic per asset
  supersedes_policy_id: string | null;
  created_at: string;
  purpose: Rules<'commercial_advertising'>;
  operations: Rules<Operation>;
  industries: Rules<Industry>;
  territories: Rules<Territory>;
  channels: Rules<Channel>;
  durations: Rules<'30' | '90'>;
  exclusivity: Rules<'exclusive'>; // DENY in V1
  additional_rights: Rules<'sublicensing' | 'training' | 'voice_clone'>; // DENY
  approval_mode: 'AUTOMATIC' | 'MANUAL';
  pricing: {
    revision: number;
    currency: 'EUR';
    duration_prices_minor: { '30': number | null; '90': number | null };
  };
  platform_policy_version: string;
  license_terms_version: string;
}
```

Every key in each rule map is required, including denied and unspecified categories.
No missing key implies permission. `NOT_SPECIFIED` records absence of a grant;
it does not route automatically to manual approval. `null` prices mean no defined
price, never zero or a request to negotiate. Allowed or conditional duration options
require a price before publishing. Unspecified unrelated industries may remain in
a published policy; a request targeting one is INCOMPLETE.

The publication validator rejects attempts to enable out-of-scope rights. Platform
prohibitions still apply at evaluation time even if invalid policy data reaches the engine.
Platform policy is an immutable, separately versioned record containing the prohibited
intent codes and any platform-wide industry prohibitions. The initial operational
baseline retains existing bans on gambling, tobacco, political advertising and adult
advertising. Alcohol becomes representable as conditional; this alone does not authorize
commercial launch or establish legal suitability. Changes to this baseline require an
explicit platform-policy revision, never a creator override.

```typescript
interface LicenseRequest {
  schema_version: 'rightsnet.license-request/0.1';
  request_id: string;
  buyer_organization_id: string;
  creator_id: string;
  asset_id: string;
  policy_id: string;
  campaign_name: string;
  purpose: 'commercial_advertising';
  industry: Industry;
  generation_type: Operation;
  territories: Territory[];
  channels: Channel[];
  starts_at: string;
  duration_days: DurationDays;
  commercial_use: true;
  exclusivity: 'none';
  requested_additional_rights: []; // no additional rights in V1
}
```

Draft requests may omit fields. Unknown enum values, malformed values and extra fields
are transport/schema errors (422), not new decision states. Missing draft fields yield
INCOMPLETE. A submitted request must be structurally complete. Price and approval status
are server-derived associated records, never trusted client inputs in this request.

Trusted evaluation context is loaded by the backend: authenticated buyer membership and
purchase role; buyer verification; creator identity/adulthood/expiry; separately established
asset relationship; current asset state; current policy ID; consent matching policy and terms;
platform policy; approvals; evaluation time; and a persisted safety assessment bound to the
request hash. The caller cannot send `buyer_verified: true` or its own clearance.
Unsupported representative relationships remain blocked until their separate verification
workflow exists. No identity check is treated as blanket copyright ownership verification.

The safety assessment stores assessor/source, version, time, request hash and one of
`CLEARED`, `REVIEW_REQUIRED`, `PROHIBITED`, `UNKNOWN`, with reason codes. The platform
prohibition vocabulary covers fraud, scams, fraudulent impersonation, non-consensual or
illegal sexual content, deceptive identity misuse, illegal activity, unauthorized political
impersonation and prohibited misleading statements. A deterministic engine cannot infer
the truth of campaign intent from a buyer checkbox. Unknown assessments cannot authorize
payment; AI classifications can trigger review but cannot issue authoritative clearance.

## Rights Passport projection

`rightsnet.rights-passport/0.1` is a machine-readable projection of authoritative DB records,
not a second independently editable policy. It contains passport ID and revision, asset ID
and asset version, creator ID, policy ID/revision/hash and the complete rule/pricing maps,
platform-policy and terms versions, identity and relationship verification levels, and
generation timestamp. Verification references are separate from public display fields.

The private projection may reference evidence and consent receipts. The public projection
uses an allowlist: public asset/creator identifiers, approved profile metadata, policy scope,
advertised prices and coarse verification levels. It excludes identity documents, legal
names unless deliberately public, contact details, DOB, evidence storage URLs, buyer
information, contracts and transaction references. Public access does not expose private
projection fields by serializing and deleting a few known secrets.

## Decision contract and precedence

```typescript
interface LicenseDecision {
  schema_version: 'rightsnet.license-decision/0.1';
  decision: 'ALLOW' | 'DENY' | 'REQUIRES_APPROVAL' | 'INCOMPLETE';
  reason_codes: string[];
  missing_fields: string[];
  request_hash: string; // canonical validated draft, or complete request
  policy_hash: string;
  platform_policy_version: string;
  engine_version: string;
  evaluated_at: string;
}
```

Authorization errors (401/403/404), malformed transport (422) and dependency failures (503)
are separate from business decisions; never convert a DB outage into an ALLOW or a fabricated
decision. Schema validation precedes evaluation. Within validated inputs, accumulate all
applicable reasons without dereferencing missing fields, then use this precedence:

1. **DENY** if any known prohibition, failed eligibility or explicit denial exists.
2. **INCOMPLETE** if required request facts, policy grants, consent or trusted assessments
   are unknown/missing. A known prohibition remains DENY even in an incomplete draft.
3. **REQUIRES_APPROVAL** if an applicable rule, global manual mode or safety review requires
   an approval that has not been validly provided by the appropriate actor.
4. **ALLOW** only if all applicable rules and prerequisites pass.

Each requested territory and channel must pass; one matching member never grants the set.
Rules for purpose, operation, industry and duration are evaluated independently. DENY
dominates all; NOT_SPECIFIED produces INCOMPLETE; REQUIRES_APPROVAL must be satisfied;
ALLOW does not override another dimension. Missing unrelated grants do not block a request.

Stable reason codes include `PLATFORM_USE_PROHIBITED`, `BUYER_NOT_VERIFIED`,
`CREATOR_NOT_VERIFIED`, `CREATOR_NOT_ADULT`, `VERIFICATION_EXPIRED`,
`ASSET_RELATIONSHIP_NOT_VERIFIED`, `ASSET_UNAVAILABLE`, `POLICY_STALE`,
`CONSENT_MISSING`, `INDUSTRY_PROHIBITED`, `TERRITORY_NOT_ALLOWED`,
`CHANNEL_NOT_ALLOWED`, `OPERATION_NOT_ALLOWED`, `DURATION_NOT_ALLOWED`,
`RIGHT_OUT_OF_SCOPE`, `START_TOO_SOON`, `REQUEST_FIELDS_MISSING`,
`POLICY_GRANT_NOT_SPECIFIED`, `PRICE_NOT_DEFINED`, `SAFETY_ASSESSMENT_MISSING`,
`CREATOR_APPROVAL_REQUIRED`, `PLATFORM_REVIEW_REQUIRED`, `CREATOR_DECLINED`.
Sort and deduplicate codes lexically; sort missing JSON paths lexically. ALLOW has empty
reason_codes and missing_fields. Every other business decision has at least one reason.

Evaluation uses an injected UTC clock, no network/LLM/randomness. Start is inclusive and
expiry exclusive. New purchase starts must be at least 24 hours after evaluation time.
Duration is elapsed 24-hour days, not local calendar days (document this in the approved
template). The future fulfillment recheck must preserve accepted purchase start conditions
while checking current blockers; it must not demand another 24-hour delay after payment.

## Approvals, prices and issuance

An approval is a server-recorded action with actor ID and role, request ID, buyer ID,
asset ID, request hash, policy hash, platform-policy version, decision, timestamp and expiry.
Only the creator (or separately verified representative) can grant creator approval;
only authorized platform reviewers can clear platform review. A creator cannot clear a
platform prohibition or replace missing policy terms with an approval.
Expiry at the evaluation instant is expired. Any request/policy/platform revision change
invalidates approval. A current rejection yields DENY. Conflicting or superseding actions
use a monotonic server revision and an auditable transition, not arbitrary timestamp ties.

Quote only after ALLOW. Server calculates the selected duration price; no additive charge
per territory/channel in this version. Persist gross, currency, fee schedule version,
platform fee, seller amount, pricing revision and quote expiry. The existing provisional
15% fee uses floor(gross_minor × 1500 / 10000), remainder to seller. This is sandbox
configuration, not a legally reviewed fee/tax commitment. Taxes cannot silently be assumed
zero in commercial mode. Consent, quote and legal-template versions bind the contract.

ALLOW is permission eligibility, not a license. Issue only after authoritative payment
success, exact contract acceptance and revalidation of required eligibility. Preserve the
current acceptance-before-checkout ordering; the Constitution's illustrative payment/
acceptance sequence does not authorize an unaccepted contract. Both are mandatory.
Persist the decision and exact immutable policy/request/contract/consent references.
A blocked paid order enters auditable review/refund handling and never silently activates.

Public license status uses ACTIVE, EXPIRED, REVOKED, SUSPENDED, INVALID. Future-start
licenses remain internally scheduled and return an explicitly documented not-yet-valid
verification result (INVALID with `NOT_YET_ACTIVE`); never claim active before start.
Tamper/unknown ID → INVALID; otherwise revoked precedes suspended, then time bounds.
Do not rename historical signed payloads from VALID to ACTIVE; translate only in a
versioned public response. Minimal public metadata must not expose private terms.

## Sentence to structured rules

“Pueden usar mi imagen en anuncios de belleza en Alemania durante 30 días, pero nunca
para apuestas” establishes beauty=ALLOW, DE=ALLOW, duration 30=ALLOW and gambling=DENY.
It does **not** specify generation type, channels, price, AT, 90 days or approval mode.
Those draft grants remain NOT_SPECIFIED and the missing publication fields remain missing.
No AI parser may fill them with ALLOW or publish on the creator's behalf.

After the creator explicitly selects synthetic_image=ALLOW, Instagram=ALLOW, automatic
approval and EUR 500 for 30 days, a verified buyer's complete DE/beauty/Instagram/image
request can return ALLOW, subject to consent, safety, identity and time prerequisites.
The same request for gambling returns DENY; DE+AT returns INCOMPLETE if AT is unspecified,
or DENY if AT is explicitly denied. An alcohol request requires approval only after
the creator explicitly assigns that industry REQUIRES_APPROVAL and other checks pass.

## Acceptance matrix for implementation

All cases use a fixed clock and valid trusted context unless stated otherwise. These are
required tests, **not claims of passing tests**. Each must assert exact reasons and hashes
where relevant, not just a decision string.

| Case | Expected |
|---|---|
| Complete DE beauty/30-day grant, price and consent | ALLOW |
| Same input repeated, same clock | Byte-identical decision |
| Creator denies requested industry | DENY / INDUSTRY_PROHIBITED |
| Platform prohibition with creator ALLOW and valid approval | DENY / PLATFORM_USE_PROHIBITED |
| Known prohibited intent plus missing channel | DENY, with missing channel recorded |
| Missing channel only | INCOMPLETE / REQUEST_FIELDS_MISSING |
| Applicable industry NOT_SPECIFIED | INCOMPLETE / POLICY_GRANT_NOT_SPECIFIED |
| Unrelated industry NOT_SPECIFIED | ALLOW |
| Requested DE+AT, AT denied | DENY / TERRITORY_NOT_ALLOWED |
| Requested DE+AT, AT unspecified | INCOMPLETE |
| One of two requested channels denied | DENY / CHANNEL_NOT_ALLOWED |
| 90 days denied, 30 allowed | DENY / DURATION_NOT_ALLOWED for 90 |
| Missing price for requested duration | INCOMPLETE / PRICE_NOT_DEFINED |
| Alcohol conditional, no approval | REQUIRES_APPROVAL / CREATOR_APPROVAL_REQUIRED |
| All grants ALLOW, global MANUAL | REQUIRES_APPROVAL |
| Valid creator approval for exact context | ALLOW |
| Approval hash, buyer, asset or policy mismatch | REQUIRES_APPROVAL |
| Approval expires exactly now | REQUIRES_APPROVAL |
| Current explicit creator rejection | DENY / CREATOR_DECLINED |
| Platform review pending, creator approval valid | REQUIRES_APPROVAL / PLATFORM_REVIEW_REQUIRED |
| Safety assessment missing or for another request | INCOMPLETE / SAFETY_ASSESSMENT_MISSING |
| Buyer unverified | DENY / BUYER_NOT_VERIFIED |
| Identity valid but relationship unverified | DENY / ASSET_RELATIONSHIP_NOT_VERIFIED |
| Identity expires exactly now; minor creator | DENY with relevant eligibility reasons |
| Asset suspended or policy superseded | DENY / ASSET_UNAVAILABLE or POLICY_STALE |
| Consent absent or references different policy/terms | INCOMPLETE / CONSENT_MISSING |
| Start exactly now+24h; one millisecond earlier | ALLOW; DENY / START_TOO_SOON |
| Unknown schema, enum, injected override or invalid date | Schema rejection, never ALLOW |
| Cross-organization request or unauthorized approval | Access rejection, no mutation |
| Reordered map keys and unordered set members | Same normalized semantic hash |
| Changed channel/industry/buyer/policy version | Different bound hash; approval invalidated |
| Payment success without contract acceptance | No issuance |
| Paid request blocked at fulfillment | No issuance; review record |
| Policy changes after license issuance | Original signed evidence unchanged |
| Private passport projection queried publicly | Only allowlisted public fields |

Canonicalization: schema-validate first, trim defined text fields, normalize UTC instants,
sort set-valued arrays by their literal value, recursively sort object keys, serialize UTF-8
JSON, then SHA-256. Reject duplicate members rather than silently dropping them. Ordered
evidence sequences retain order. Never recanonicalize legacy signed documents using the
new normalization algorithm. Hash the schema version along with content.

## Migration and stop condition

Existing `packages/domain/src/index.ts` has list-based grants, ES/DE, three evaluator
results and combined verification booleans. `createRequest` validates full requests before
evaluation; `approveRequest` directly assigns ALLOW on creator approval. Neither constitutes
the new engine. Existing signed snapshots and hashes must remain untouched.

Next milestone (after engine acceptance PASS): an explicit **integration migration** that
routes purchases through these schemas — covering policy consent renewal, passport
projection, draft evaluation, approval re-evaluation instead of direct ALLOW,
DB decision constraints, OpenAPI, fixtures and historical-read compatibility.
Legacy policies may be shown as migration candidates; ES→AT is never an automatic map.
No automatic policy activation or inferred fresh consent is permitted.

Engine acceptance suite status (2026-09-07): **PASS** via `tests/rights-core-acceptance.test.ts`.
Purchase APIs dual-path by `schema_version` (2026-09-07): see
[`RIGHTS_CORE_INTEGRATION_V0_1.md`](RIGHTS_CORE_INTEGRATION_V0_1.md). Legacy ES assets keep
`evaluateLicense`; rights-policy assets use `evaluateRightsDecision`.
