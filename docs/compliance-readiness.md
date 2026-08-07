# Compliance Readiness

This document records the current engineering controls for European/GDPR and
OWASP Top 10 readiness. It is not legal advice and does not replace a DPO,
lawyer, DPA review, or external penetration test.

## Current Technical Controls

- Authentication is handled by Supabase Auth.
- MFA can be required per user and per role, and is enforced before PostgREST
  API access for users under the MFA policy.
- Authorization is enforced in the database with RLS and SECURITY DEFINER RPCs.
- Frontend routes are role-gated to prevent direct URL access to privileged
  workspaces.
- Internal helper RPCs are not executable by normal API roles.
- User-initiated email sends are authorized server-side and logged.
- Email body HTML is sanitized before provider submission and logging.
- Audit logs are append-only for app users.
- Security events record route denials and denied Edge Function actions for
  admin review.
- Vercel security headers include HSTS, exact-origin CSP, frame denial,
  no-sniff, referrer policy, COOP/COEP/CORP, non-wildcard app CORS, and a
  restrictive permissions policy.
- A Privacy Center lets signed-in users export their own data and submit
  privacy rights requests.
- Admins have a privacy request queue and non-destructive retention review
  counts.

## OWASP Top 10:2025 Mapping

| Category | Status | Notes |
| --- | --- | --- |
| A01 Broken Access Control | Partial | Route guards, RLS, role fixes, and RPC revocations are present. Keep expanding negative tests for object-level access. |
| A02 Security Misconfiguration | Partial | Security headers added. Production Supabase/Vercel settings still need environment review. |
| A03 Software Supply Chain Failures | Partial | `npm audit`, SBOM generation, and CI security workflow are present. |
| A04 Cryptographic Failures | Partial | Provider TLS is expected. Document encryption at rest, backup encryption, key rotation, and secrets handling. |
| A05 Injection | Partial | Supabase query builder and RPCs reduce risk. Continue reviewing PL/pgSQL and Edge Function input handling. |
| A06 Insecure Design | Partial | Privacy workflow exists. Add formal threat modeling and abuse-case reviews. |
| A07 Authentication Failures | Partial | MFA support exists. Remove shared test credentials before production and verify password/session policies. |
| A08 Software or Data Integrity Failures | Gap | Add protected CI/CD, deployment provenance, and production change approvals. |
| A09 Security Logging & Alerting Failures | Partial | Audit data and security events exist. Add alert routing and incident response runbooks. |
| A10 Mishandling Exceptional Conditions | Gap | Add systematic error-path testing for RPCs, Edge Functions, imports, and payment flows. |

## GDPR Readiness Gaps

- Confirm controller/processor roles for ibrave, Supabase, hosting, and email
  providers.
- Execute DPAs and maintain a subprocessor register.
- Confirm data residency and international transfer safeguards for all vendors.
- Map each processing purpose to a lawful basis.
- Complete a DPIA for employee, candidate, financial, and communication data.
- Finalize retention periods with legal/accounting advice per jurisdiction.
- Define breach notification ownership and timelines.
- Rotate or remove shared test accounts before processing real personal data.
- Run an external security assessment before EU production launch.

## Release Gate

Before real EU personal data is processed, the release owner should have:

1. Passing validation scripts and production build.
2. Applied migrations and deployed Edge Functions.
3. Confirmed production security headers.
4. Removed or rotated shared test/demo credentials.
5. Completed vendor/DPA/transfer review.
6. Completed DPIA and retention approval.
7. Completed external penetration test or equivalent independent security review.
