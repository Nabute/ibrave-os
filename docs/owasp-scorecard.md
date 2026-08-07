# OWASP Top 10 Scorecard

Framework: OWASP Top 10:2025.

| Category | Grade | Evidence | Remaining Work |
| --- | --- | --- | --- |
| A01 Broken Access Control | B+ | RLS, role-scoped routes, owner/admin boundary tests, RPC revocations. | Add object-level negative tests for every entity detail screen and mutation. |
| A02 Security Misconfiguration | A- | Security headers, noindex, static config validation, exact Supabase CSP origin, non-wildcard app CORS, and COEP. | Verify deployed headers after each production deployment and Supabase Auth/rate-limit/storage settings. |
| A03 Software Supply Chain Failures | B- | `npm audit`, SBOM script, CI security workflow. | Add Dependabot/Renovate and signed/provenance-aware releases. |
| A04 Cryptographic Failures | B- | Secrets kept out of frontend; provider TLS expected. | Document provider encryption, backup encryption, key rotation, and data residency. |
| A05 Injection | B | Supabase query builder, sanitized email HTML, no broad `dangerouslySetInnerHTML`. | Review every PL/pgSQL RPC and Edge Function payload path. |
| A06 Insecure Design | B- | Threat model, abuse-case table, privacy workflow. | Add recurring secure design reviews and data-flow diagrams. |
| A07 Authentication Failures | B | Supabase Auth and API-enforced MFA. | Verify production password, recovery, session, and rate-limit settings. |
| A08 Software/Data Integrity Failures | C+ | Lockfile, build/typecheck, CI gate. | Add protected deployment approvals, artifact provenance, and release integrity checks. |
| A09 Logging & Alerting Failures | B- | Append-only audit log, security events, admin review surface. | Add outbound alerting/on-call routing and anomaly thresholds. |
| A10 Mishandling Exceptional Conditions | C+ | Some guarded RPC/Edge failure paths and validation scripts. | Expand malformed input and fail-closed tests across workflows. |

## Current Overall Grade

**A- engineering baseline, B+ production assurance.**

The app has real security architecture and automated evidence. The remaining
gap is mostly assurance: production configuration review outside repo-controlled
headers, alert routing, broader authenticated DAST, and independent testing.
