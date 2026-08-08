# Access model

ibrave OS has two access classes:

1. **Workspace users**: employees, contractors, PMs, finance, sales,
   resourcing, recruiters, account owners, owners and admins. They sign in to
   the main app and are authorized by workspace membership and roles.
2. **Client portal contacts**: external client-side people registered against
   a client account. They are tracked separately from internal workspace users
   and must not receive internal roles.

## Workspace users

Workspace users open `https://os.ibrave.co` and sign in with an account created
by an admin. The app has no public self-signup.

Admins create users from **Admin -> People**. The admin receives a one-time
temporary password and hands it over through a secure channel. The user then
changes the password in **Preferences**. If MFA is required for the user or
role, the user is forced through authenticator-app enrollment after login.

The sidebar only shows what the user can access. The database also enforces the
same rules with RLS and RPC checks, so direct URL entry is not enough to bypass
permissions.

| User type | Access path | Primary areas |
|---|---|---|
| Employee / contractor | Main app login | My Day, Timesheet, own payouts, own profile, calendar |
| Project manager | Main app login | Approvals, projects, staffing if assigned role, delivery reports |
| Finance | Main app login | Clients billing data, rates, invoices, payments, payouts, reports |
| Sales | Main app login | Prospecting, leads, quotes, contracts, win handoff |
| Account owner | Main app login | Client Account 360, activities, opportunities, escalations, client portal administration |
| Resourcing | Main app login | Bench, capacity, staffing requests, time off |
| Recruiter | Main app login | Candidates, requisitions, interviews, offers, onboarding |
| Owner | Main app login | Command Center and company-wide oversight |
| Admin | Main app login | People, roles, settings, identities, security, integrations, trust |

## External clients

Clients are **not** internal workspace users. Do not invite a client through
**Admin -> People** and do not grant them `employee`, `pm`, `finance`, `sales`,
`account_owner`, `owner` or `admin` roles.

Current client-facing records are managed from:

```text
Clients -> <client> -> Client portal
```

From that tab, staff can register:

- client portal contacts
- shared documents
- approval requests
- invoice/document references

This is the source of truth for the client portal model. A public, standalone
client login page is a separate delivery surface; until that route is deployed,
client contacts should receive documents, invoices and approval requests via
the communication flow configured by the account team.

## Productivity integrations

Productivity integrations are configured by admins from:

```text
Admin -> Integrations
```

Supported delivery/productivity providers:

- GitHub
- Jira
- Linear
- Google Calendar
- Microsoft Calendar
- Slack
- Teams

Each connection can be mapped to an internal project. A sync stores normalized
external items in the workspace and shows them on the mapped project:

```text
Projects -> <project> -> Productivity integrations
```

Provider secrets live only in Supabase Edge Function secrets. They are never
entered into the browser or stored in frontend environment variables.

## Access decision checklist

Use this checklist when someone asks for access:

| Question | Decision |
|---|---|
| Do they work for the company or as a contractor? | Create an internal workspace user in Admin -> People |
| Are they a client-side stakeholder? | Register them under Clients -> Client portal |
| Do they need to approve time/invoices/documents externally? | Use a client portal approval request; do not give internal roles |
| Do they need accounting or billing administration? | Internal `finance` role only |
| Do they need setup, people, integrations or security policy? | Internal `admin` or `owner` only |
| Do they only need GitHub/Jira/Slack sync data visible in a project? | Map the integration to the project; normal project permissions govern visibility |

## Revocation

- Internal user access is removed from **Admin -> People -> Deactivate**. This
  blocks login and preserves history.
- Role access is changed by granting or revoking role chips in **Admin -> People**.
- Client portal contact access is suspended or removed from the client portal
  administration surface.
- Provider access is revoked by deleting/rotating the provider secret in
  Supabase and pausing/removing the integration connection.
