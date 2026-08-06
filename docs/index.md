# ibrave OS Documentation

The canonical documentation for ibrave OS — the outsourcing business
operations platform covering sales development → quotes and contracts →
staffing and talent → timesheets and approvals → invoicing and collections →
payouts and margin → account management → the owner command center.

## Start here

- New to the platform? [Getting started](user-guide/getting-started.md) —
  login, MFA, preferences, notifications, calendar and email.
- Then read **your role's guide** from the User Guide section.
- "Who can do what?" is always answered by the [Role & Permission
  Matrix](role-matrix.md) — it is generated from the enforced database rules,
  not from intentions.

## Audience map

| You are | Read |
|---|---|
| Everyone | [Getting started](user-guide/getting-started.md) |
| Developer / consultant | [Employee guide](user-guide/employee.md) |
| Project manager | [PM guide](user-guide/project-manager.md) |
| Finance | [Finance guide](user-guide/finance.md) |
| Resourcing / recruiter | [Resourcing & Recruiting](user-guide/resourcing-recruiting.md) |
| Sales / account owner | [Sales & Accounts](user-guide/sales-accounts.md) |
| Owner / admin | [Owner & Admin](user-guide/owner-admin.md) |
| Operator / engineer | [Operations Runbook](operations-runbook.md) |

## Principles worth knowing (they explain most "why can't I…" questions)

1. **The database is the enforcement point.** Roles, workflow transitions and
   immutability are server rules; the UI only reflects them.
2. **Financial history is append-only.** Approved time and issued invoices
   never change — corrections are adjustment entries and credit notes.
3. **Every workflow step is recorded** — who, when, and (for destructive
   steps) why. Comments are mandatory where they matter.
4. **Communication lives in-app** so client history is complete: email sends
   from real identities, calendar invites carry real `.ics` files.

## Engineering references

- [Operations Runbook](operations-runbook.md) — deploys, migrations, jobs,
  secrets, incidents, go-live checklist.
- [Master blueprint](outsourcing-automation-blueprint.md) — the original
  module-by-module specification (A–I).
- [Timesheet & invoicing spec](timesheet-invoicing-spec.md) — the detailed
  Modules C & D contract.
- `tests/validation/` — ~270 executable checks that document behavior by
  proving it.
