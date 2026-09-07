# Creator publish — Rights Core editor v0.1

Status: **PASS** (2026-09-07).

## Goal

Allow creators to configure and version `rightsnet.rights-policy/0.1` from `/dashboard`
(AT/DE industries, channels, durations, prices, approval), without rewriting legacy ES
policies.

## Locked decisions

- When `RIGHTS_CORE_PURCHASES=true`, new profiles get a Rights Core default policy and the
  AT/DE editor.
- Existing Rights Core assets (e.g. Greta) load their own policy into the editor.
- Legacy ES/DE list policies keep the previous checkbox editor.
- Publish pipeline unchanged: consent → evidence → review → identity → Connect → publish.
- No ES→AT remapping of historical grants.

## STOP

No live commerce. No MFA. No generative content features.
