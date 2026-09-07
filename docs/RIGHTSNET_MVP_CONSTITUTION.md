# RIGHTSNET — MVP CONSTITUTION v0.1

**Version:** 0.1  
**Status:** Binding MVP Scope  
**Project:** RightsNet  
**Initial Product:** AI Likeness Licensing Infrastructure  
**Date:** September 2026

---

# 1. PURPOSE OF THIS DOCUMENT

This document defines the boundaries of the first production version of RightsNet.

Its purpose is to prevent scope creep.

Any engineer, AI coding agent, contractor, designer, founder, or collaborator working on RightsNet must treat this document as the governing product constraint for the MVP.

The MVP is not intended to implement the full RightsNet vision.

The MVP exists to validate one economic hypothesis:

> Will brands or agencies pay real money to obtain clear, verifiable permission to use a real creator's likeness in AI-generated advertising?

Everything built in V1 must help answer that question.

Anything that does not materially help answer that question belongs outside the MVP.

---

# 2. COMPANY VISION

RightsNet aims to become infrastructure through which humans, companies, software systems, and AI agents can discover, request, purchase, verify, and account for rights.

The long-term system may eventually support:

- human likeness;
- voice;
- music;
- characters;
- trademarks;
- performances;
- photographs;
- video;
- training rights;
- generation rights;
- derivative works;
- interactive AI rights;
- commercial rights;
- royalties;
- autonomous agent licensing.

That is the future.

It is not the MVP.

---

# 3. MVP DEFINITION

RightsNet V1 is:

> A platform where verified creators can define and sell permission for brands and agencies to use their likeness in AI-generated commercial advertising.

The system must support the complete economic loop:

```text
CREATOR
    ↓
Account
    ↓
Identity verification
    ↓
Register likeness
    ↓
Define permissions
    ↓
Define restrictions
    ↓
Set price
    ↓
Publish
            ↘
             RIGHTSNET
            ↗
BRAND / AGENCY
    ↓
Search
    ↓
Select creator
    ↓
Configure intended usage
    ↓
Permission check
    ↓
Approval if required
    ↓
Payment
    ↓
Contract acceptance
    ↓
License issued
    ↓
AI content generated externally
    ↓
Output linked to license
    ↓
License verification
```

If this loop works reliably with real buyers and sellers, the MVP succeeds.

---

# 4. INITIAL MARKET

## Sellers

Only:

**Individual creators whose own likeness is being licensed.**

Examples:

- UGC creators;
- micro-influencers;
- models;
- content creators;
- actors;
- professional creators.

The seller must be the person represented by the likeness unless a verified legal representative relationship exists.

---

## Buyers

Only:

- brands;
- marketing agencies;
- creative agencies;
- authorized company representatives.

Consumer-to-consumer licensing is outside the MVP.

---

## Asset Type

Only:

**Human visual likeness.**

Examples:

- facial likeness;
- body appearance;
- recognizable visual identity;
- approved digital representation.

---

## Permitted Product Use

Only:

**AI-generated commercial advertising.**

Examples:

- social media advertisements;
- branded AI video;
- branded AI imagery;
- paid social campaigns;
- organic brand social content where commercial rights are required.

---

# 5. INITIAL GEOGRAPHIC SCOPE

The initial pilot market should be restricted.

Proposed operational launch scope:

**Austria + Germany**

The system architecture may represent multiple territories from the beginning, but the commercial MVP must not claim global legal coverage.

Before commercial launch, the applicable contracts, consent mechanisms, personality-rights implications, privacy requirements, and marketplace structure must be reviewed by qualified legal counsel in the launch jurisdictions.

RightsNet must never imply that technical verification equals universal legal validity.

---

# 6. CORE MVP PRINCIPLE

RightsNet follows this architectural doctrine:

> **AI interprets. Deterministic software decides.**

Large language models may:

- interpret natural-language requests;
- classify campaigns;
- extract intent;
- recommend structured parameters;
- explain license terms;
- identify possible policy conflicts.

Large language models must not be the ultimate authority for:

- permission decisions;
- payment calculations;
- contract validity;
- license status;
- access control;
- ownership status;
- expiration;
- revocation;
- jurisdictional rules.

Critical decisions must be deterministic and auditable.

---

# 7. MVP PRODUCTS

The MVP contains four core product components.

## 7.1 Creator Rights Dashboard

Creators can:

- create an account;
- verify identity;
- create a creator profile;
- register their likeness;
- configure usage permissions;
- configure prohibited categories;
- select territories;
- configure license duration options;
- set pricing;
- choose automatic or manual approval;
- review requests;
- review active licenses;
- view earnings;
- view linked generated outputs.

---

## 7.2 Buyer Marketplace

Brands and agencies can:

- create company accounts;
- search creators;
- filter creators;
- view creator profiles;
- configure intended usage;
- see whether usage is allowed;
- obtain a price;
- request approval when necessary;
- pay;
- accept the license agreement;
- receive a license;
- view purchased licenses;
- register generated outputs.

---

## 7.3 Rights Engine

RightsNet evaluates whether a requested use is compatible with the creator's policy.

The possible outputs are:

```text
ALLOW
DENY
REQUIRES_APPROVAL
INCOMPLETE
```

No other ambiguous result should be used for the MVP.

---

## 7.4 License Verification

Every issued license receives a unique identifier.

Example:

```text
RN-LIC-2026-000001
```

RightsNet must provide a verification page capable of showing an appropriate public verification result.

Possible states include:

```text
ACTIVE
EXPIRED
REVOKED
SUSPENDED
INVALID
```

Sensitive commercial or personal information must not automatically become publicly visible.

---

# 8. RIGHTS PASSPORT V0.1

Each creator likeness receives a Rights Passport.

The Rights Passport is a structured representation of:

- asset identity;
- verified owner;
- allowed uses;
- prohibited uses;
- conditional uses;
- territories;
- channels;
- industries;
- durations;
- pricing;
- approval rules;
- policy version;
- verification status.

The Rights Passport must be machine-readable.

The database representation is the authoritative operational record in V1.

External standards may inform the model, but standards compliance must not delay the MVP.

---

# 9. POLICY STATES

Permissions must never be represented using ambiguous booleans such as:

```text
politics: false
```

Every governed category must use explicit states.

Allowed values:

```text
ALLOW
DENY
REQUIRES_APPROVAL
NOT_SPECIFIED
```

Example:

```json
{
  "beauty": "ALLOW",
  "fashion": "ALLOW",
  "alcohol": "REQUIRES_APPROVAL",
  "gambling": "DENY",
  "political_advertising": "DENY"
}
```

---

# 10. MANDATORY RESTRICTIONS

Regardless of individual creator preferences, RightsNet must prohibit licensing intended for:

- fraudulent impersonation;
- financial fraud;
- scams;
- non-consensual sexual content;
- illegal sexual content;
- deceptive identity misuse;
- illegal activity;
- unauthorized political impersonation;
- content designed to mislead people into believing the creator made statements they did not authorize when such representation is prohibited;
- any use prohibited by applicable law or RightsNet platform policy.

Creators may impose stricter restrictions.

They may not weaken RightsNet platform-level prohibitions.

---

# 11. CREATOR VERIFICATION

The MVP should use an external identity/KYC provider.

RightsNet should avoid building its own document-recognition or biometric-verification infrastructure.

Minimum marketplace requirement:

```text
IDENTITY VERIFIED
```

A creator cannot publish a licensable likeness before completing the required verification level.

The verification system must distinguish between:

```text
UNVERIFIED
IDENTITY_VERIFIED
ASSET_RELATIONSHIP_VERIFIED
REPRESENTATIVE_VERIFIED
```

Only the levels necessary for the MVP need to be implemented initially.

---

# 12. OWNERSHIP PRINCIPLE

Identity verification and ownership verification are different concepts.

RightsNet must not assume:

```text
Identity verified
=
All uploaded assets legally controlled
```

For the MVP, individual creators may primarily register their own likeness.

More complex ownership structures belong to later versions.

Examples outside normal V1 scope:

- celebrity estates;
- agencies controlling talent rights;
- movie studios;
- sports organizations;
- fictional characters;
- music catalogs;
- record labels.

---

# 13. LICENSE REQUEST OBJECT

Every licensing transaction must describe structured intended usage.

At minimum:

```text
Buyer
Creator
Asset
Purpose
Industry
Generation type
Territory
Channels
Start date
Duration
Commercial use
Exclusivity
Price
Approval status
```

The exact schema will be defined separately.

---

# 14. LICENSE ENGINE V0.1

The License Engine must answer:

> Is Buyer X allowed to use Asset Y in Manner Z under the currently active Rights Policy?

The engine evaluates structured rules.

Example:

```text
Buyer verified?
YES

Asset active?
YES

Commercial AI advertising allowed?
YES

Industry allowed?
YES

Territory allowed?
YES

Requested duration allowed?
YES

Channel allowed?
YES

Platform-level safety restriction?
NO VIOLATION

Manual approval required?
NO
```

Result:

```text
ALLOW
```

The engine must provide machine-readable reasons for every decision.

Example:

```json
{
  "decision": "DENY",
  "reason_codes": [
    "INDUSTRY_PROHIBITED"
  ]
}
```

---

# 15. PRICING V0.1

V1 pricing must remain simple.

Creators define prices.

Possible price dimensions may include:

- base license price;
- duration;
- territory;
- channel bundle.

Dynamic market pricing is not required.

AI-negotiated pricing is not required.

Automated auction systems are not required.

---

# 16. APPROVAL V0.1

Creators may configure:

```text
AUTOMATIC
MANUAL
```

Certain policies may always force manual approval.

Example:

```text
Beauty advertising:
AUTOMATIC

Alcohol:
REQUIRES_APPROVAL

Politics:
DENY
```

A manual approval action must be logged.

---

# 17. PAYMENTS

MVP payments should use Stripe Connect or an equivalent marketplace payment infrastructure approved by the project.

Required capabilities:

- buyer payment;
- platform fee;
- seller amount;
- payment status;
- refunds;
- seller payouts;
- transaction references;
- webhook processing.

RightsNet must maintain its own internal transaction ledger.

Stripe is a payment processor.

Stripe is not the RightsNet accounting database.

---

# 18. FINANCIAL LEDGER

Every financial movement must be represented internally.

Example:

```text
Transaction:
TXN-92183

License:
RN-LIC-2026-000001

Gross:
€1,000

Platform fee:
€150

Seller amount:
€850

Buyer:
ORG-100

Seller:
CREATOR-200
```

Financial records must be auditable.

---

# 19. CONTRACTS

The MVP must not generate arbitrary AI-written contracts.

RightsNet must use versioned legal templates.

Example:

```text
Digital Likeness AI Advertising License
Version 1.0
Germany
```

Structured variables may populate approved templates.

AI may explain the contract.

AI may not independently invent binding contractual provisions.

Commercial launch requires professional legal review of relevant templates.

---

# 20. CONSENT

RightsNet must never reduce consent to:

```text
consent = true
```

Consent must generate evidence.

Minimum conceptual record:

```text
Creator
Action
Policy version
License terms version
Timestamp
Territory
Asset
Acceptance method
Relevant evidence
Document hash
```

Consent events must be auditable.

---

# 21. LICENSE CREATION

A license may only become ACTIVE when required conditions are satisfied.

Possible requirements:

```text
buyer verified
seller verified
asset active
rights engine approved
manual approval completed if required
contract accepted
payment successful
```

Only then:

```text
LICENSE = ACTIVE
```

---

# 22. LICENSE ↔ OUTPUT LINK

The MVP should support linking generated AI content to the license that authorized it.

Minimum implementation:

```text
LICENSE
   ↓
GENERATION RECORD
   ↓
OUTPUT
   ↓
HASH / FILE REFERENCE
```

RightsNet does not need to build its own generation model.

At least one external AI-generation workflow may eventually be integrated to validate the complete licensing-to-output loop.

The integration should remain replaceable.

---

# 23. PUBLIC VERIFICATION

An authorized party should be able to verify a license.

Conceptually:

```text
GET /verify/RN-LIC-2026-000001
```

Possible response:

```text
VALID
```

with controlled metadata.

Verification must not expose confidential contractual information by default.

---

# 24. AUDITABILITY

RightsNet must be capable of reconstructing:

```text
who
did what
to which asset
for which buyer
under which policy
using which contract version
at what time
for what amount
with what approval
```

Important mutations must create audit events.

---

# 25. VERSIONING

The following objects must be designed with versioning in mind:

```text
Rights Policies
Rights Passports
Contract Templates
Platform Policies
License Terms
Pricing Policies
Consent Receipts
```

A license must reference the versions that were effective when it was issued.

Changing a creator policy tomorrow must not silently rewrite yesterday's contract.

---

# 26. SECURITY BASELINE

The MVP must include from the beginning:

```text
HTTPS
secure authentication
MFA capability
RBAC
organization isolation
API secret protection
environment secret management
signed webhooks
rate limiting
idempotency
audit logging
secure object storage
signed file URLs
database backups
production/staging separation
session management
basic fraud controls
```

Security cannot be treated as a final sprint.

---

# 27. MVP CORE ENTITIES

The initial data model should revolve around approximately these entities:

```text
User
Organization
OrganizationMember

CreatorProfile
BuyerProfile

IdentityVerification

Asset
AssetFile
AssetVersion

RightsPassport
RightsPolicy
RightsPolicyVersion

LicenseRequest
LicenseDecision
Approval

Quote

ContractTemplate
Contract
ContractAcceptance

License

GenerationRecord
OutputAsset

Payment
Transaction
Payout
Refund

ConsentReceipt

AuditEvent
Notification
```

Additional entities require justification.

---

# 28. REQUIRED USER JOURNEYS

The MVP must eventually pass at least these end-to-end journeys.

### Journey 1

Creator registers and verifies identity.

### Journey 2

Creator registers their likeness.

### Journey 3

Creator configures permissions and restrictions.

### Journey 4

Creator publishes the asset.

### Journey 5

Brand registers and discovers a creator.

### Journey 6

Brand configures intended AI advertising use.

### Journey 7

Rights Engine returns ALLOW, DENY, or REQUIRES_APPROVAL.

### Journey 8

Buyer completes payment and contractual acceptance.

### Journey 9

RightsNet issues a verifiable license.

### Journey 10

Generated output is associated with the license and can later be verified.

---

# 29. EXPLICITLY OUT OF SCOPE

The following features are forbidden during the initial MVP unless this Constitution is formally amended.

```text
Voice licensing
Voice cloning
Music
Music publishing
Sound recordings
Movie clips
Sports rights
Celebrity estates
Fictional characters
Trademark licensing
Logo licensing
Training-data licensing
Model-training rights
Fine-tuning rights
Dataset marketplace
Blockchain
Cryptocurrency
Tokens
NFTs
Mobile applications
Complex auctions
Real-time bidding
Autonomous negotiation
AI seller agents
AI buyer agents
Public MCP server
Full public API platform
Enterprise SDKs
Dynamic pricing
Usage-based royalties
Revenue-share royalties
Royalties per generation
Royalty collection societies
30+ languages
Global legal coverage
RightsNet-owned AI generation model
RightsNet-owned KYC technology
RightsNet-owned e-signature infrastructure
Microservice architecture
Kubernetes
Multi-region deployment
Complex recommendation engines
Custom search infrastructure
Elasticsearch/OpenSearch unless demonstrated necessary
```

If an AI coding agent begins implementing one of these without explicit authorization:

**STOP.**

---

# 30. TECHNOLOGY PRINCIPLE

The MVP should favor boring, proven technology.

Preferred architecture:

```text
Web
Next.js
React
TypeScript

Backend
NestJS
TypeScript

Database
PostgreSQL

Managed infrastructure
Supabase where appropriate

Storage
S3-compatible object storage / Cloudflare R2

Payments
Stripe Connect

Identity
External KYC provider

AI
External models through isolated AI service interfaces
```

The system should start as a modular monolith.

Do not prematurely create microservices.

---

# 31. AI PRINCIPLE

AI is an accelerator.

AI is not the source of truth.

AI must not be placed in critical paths where deterministic rules are sufficient.

Example:

Wrong:

```text
Ask LLM:
"Should this license be allowed?"
```

Correct:

```text
Natural language
       ↓
AI parser
       ↓
Structured request
       ↓
Deterministic License Engine
       ↓
Decision
```

---

# 32. DEVELOPMENT PRINCIPLE

RightsNet must never be built in one pass.

Every milestone follows:

```text
SPECIFY
↓
IMPLEMENT
↓
MIGRATE
↓
TEST
↓
RUN
↓
VERIFY
↓
DOCUMENT
↓
STOP
```

The coding agent must stop after each milestone.

The next milestone begins only after the previous milestone works.

---

# 33. DEFINITION OF MVP SUCCESS

Technical success is not enough.

The MVP must demonstrate economic behavior.

Target validation milestone:

```text
100 verified creators
10 real agencies / brands
50 real license transactions
real money processed
real creator payouts
real generated outputs linked to licenses
```

The exact target may evolve based on market feedback.

However, vanity metrics such as registrations, page views, or AI demos do not constitute product-market validation.

The strongest signal is:

> A company repeatedly pays RightsNet to legally use real human likeness in AI advertising.

---

# 34. PRIMARY COMPANY METRIC

The most important early metric should not be total users.

It should be something close to:

```text
Verified Licensing Volume
```

Supported by:

```text
licenses issued
GMV
repeat buyers
time-to-license
creator acceptance rate
license conversion rate
dispute rate
buyer retention
seller earnings
```

---

# 35. MVP NON-GOALS

The MVP does not need to prove that RightsNet can manage every type of intellectual property.

It does not need to become an industry standard.

It does not need autonomous agents.

It does not need massive scale.

It does not need celebrity inventory.

It does not need millions of users.

It needs to prove one thing:

> RightsNet can turn creator consent and commercial rights into a reliable, machine-readable, purchasable, verifiable license for AI advertising.

---

# 36. THE LONG-TERM MOAT

The marketplace itself is not expected to be the ultimate moat.

Potential long-term defensibility comes from:

```text
Rights Graph
+
Rights Passport
+
Rights Policy Engine
+
License Engine
+
Verification Network
+
License ↔ Output provenance
+
Developer integrations
+
Distribution
+
Transaction history
```

The MVP exists to begin accumulating these assets.

---

# 37. DECISION RULE FOR NEW FEATURES

Every proposed MVP feature must answer:

### Question 1

Does it directly help a creator make a licensable likeness available?

### Question 2

Does it directly help a buyer discover, authorize, purchase, or verify that license?

### Question 3

Is it necessary for trust, payments, security, compliance, or auditability?

If the answer to all three is NO:

**Do not build it.**

---

# 38. FOUNDING PRODUCT DOCTRINE

RightsNet should eventually make the following interaction possible:

```text
AI SYSTEM:
Can I use this person's likeness for this purpose?

RIGHTSNET:
Yes.
Here are the conditions.
Here is the price.
Here is the license.

AI SYSTEM:
Purchase.

RIGHTSNET:
Authorized.
```

The MVP is the smallest credible system from which that future can emerge.

---

# 39. FINAL MVP RULE

Until meaningful licensing activity exists:

> **Infrastructure sophistication must never outrun market validation.**

We are not building RightsNet to demonstrate engineering capability.

We are building RightsNet to make rights transact.

END OF RIGHTSNET MVP CONSTITUTION v0.1
