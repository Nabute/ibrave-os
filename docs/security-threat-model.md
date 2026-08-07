# Security Threat Model

## Scope

ibrave OS is an authenticated internal operations app backed by Supabase and
Edge Functions. It handles workforce, candidate, client, sales, financial,
calendar, notification, and email data.

## Primary Assets

- Authenticated user sessions and MFA state.
- Profiles, roles, and authorization decisions.
- Timesheets, approvals, invoices, payments, and payouts.
- Candidate records, scorecards, rates, and staffing data.
- Client, lead, prospect, and communication records.
- Email sender identities and message logs.
- Audit logs, security events, and privacy requests.

## Trust Boundaries

- Browser to Supabase Auth/PostgREST.
- Browser to Supabase Edge Functions.
- Edge Functions to Supabase service role.
- Edge Functions to Resend.
- Database SECURITY DEFINER functions crossing RLS boundaries.
- Hosting/CDN configuration to browser security policy.

## Abuse Cases

| Abuse Case | Control |
| --- | --- |
| Employee opens privileged route by URL | Frontend route guard plus RLS/RPC authorization. |
| User changes role/client/project IDs in requests | Server-side RLS and RPC authorization checks. |
| Admin without owner accesses owner command center | `has_role()` owner/admin boundary and negative validation. |
| User sends invoice email as another identity | Edge Function identity validation and security event logging. |
| User sends email against unauthorized entity | Edge Function object access checks and security event logging. |
| User injects script into email body | HTML sanitization before provider submission/logging. |
| MFA-mandated user calls API at AAL1 | PostgREST pre-request MFA enforcement. |
| Internal helper RPC is called directly | Execute grants revoked for internal functions. |
| Privacy request is self-closed by requester | RLS permits owner read only; admin/owner update only. |
| Security event trail is tampered with | No app-user write/update/delete policies on the table. |

## Remaining High-Value Tests

- Run DAST against a deployed preview.
- Add object-level negative tests for every detail route and mutation.
- Add Edge Function tests for malformed payloads and provider failures.
- Verify production CORS, auth rate limits, and storage bucket policies.
- Connect audit/security events to alert routing.

## Production Assumptions To Verify

- Supabase project is in the intended region.
- Backups, PITR, and encryption-at-rest posture are documented.
- Vercel/hosting deployment serves the headers in `vercel.json`.
- Edge Function secrets are set only in Supabase function secrets.
- `ALLOWED_ORIGINS` or equivalent CORS restriction is configured before public
  production use.
