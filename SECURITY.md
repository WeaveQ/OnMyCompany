# Security Policy

## Supported versions

Report security issues against the version of OnMyCompany you are running. Prefer the latest
internal build when possible.

## Reporting a vulnerability

Please report vulnerabilities **privately** to the maintainers of this repository (internal security
channel or private advisory). Do **not** open a public issue for unfixed security problems.

Include:

- Affected version / commit
- Description and impact
- Reproduction steps or proof-of-concept if available
- Whether credentials or customer data may be involved

## Scope

In scope: credential storage, auth, policy enforcement, SSRF guards, runtime token handling, and
related server surfaces in this repository.

Out of scope (unless they are regressions in this repo):

- Issues only in third-party provider SaaS products themselves
- Social engineering / physical access
- Denial of service via resource exhaustion without a clear product bug

## Operator guidance

- Set `OMC_ENCRYPTION_KEY` for at-rest credential encryption  
- Set `OMC_ADMIN_TOKEN` for admin API / console  
- Prefer `OMC_ALLOWED_ACTIONS` / `OMC_BLOCKED_ACTIONS` (and proxy lists) to reduce surface  
- Keep Node.js on a supported release  
- Do not expose the admin console or unauthenticated runtime to the public internet  

Thank you for helping keep OnMyCompany and its operators secure.
