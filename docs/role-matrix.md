# ibrave OS — Role & Permission Matrix

Derived from the enforced sources of truth: RLS policies (`supabase/migrations/*`),
the `workflow_transitions` FSM table, and `has_role()`. Nothing in this document
is aspirational — every line is backed by a database rule the client cannot bypass.

## Roles

A user can hold **several workspace roles** (`workspace_memberships`, with
legacy `user_roles` compatibility during migration). Two rules frame everything:

1. **`owner` and `admin` implicitly pass every `has_role()` check** — they can do
   anything any other role can do, plus their exclusive areas below.
2. Employees are the baseline: everyone authenticated holds the implicit
   "member" surface (own timesheet, own profile, directory, calendar, own
   notifications) even without a `user_roles` row.

| Role | Intent |
|---|---|
| `employee` | Logs time, sees own work, payouts and profile |
| `pm` | Approves time on their projects, runs delivery |
| `finance` | Everything money: rates, invoices, payments, payouts, exports |
| `resourcing` | Bench, staffing requests, skills, capacity |
| `recruiter` | Talent pipeline end-to-end, requisitions, offers, hiring |
| `sales` | Prospecting, pipeline, quotes, contracts, win handoff |
| `account_owner` | Client relationship surfaces (Account 360, check-ins) |
| `owner` | Command center + everything above (implicit) |
| `admin` | People lifecycle, roles, settings, email identities + everything above (implicit) |

External client contacts are not workspace members and do not receive these
roles. They are registered from **Clients -> Client portal** and are governed
by the client portal access model, not the internal role matrix.

## Permission matrix

✅ full · 👁 read · ◐ own/scoped only · — none
(`owner`/`admin` are ✅ everywhere unless a row says otherwise.)

| Capability | employee | pm | finance | resourcing | recruiter | sales | account_owner |
|---|---|---|---|---|---|---|---|
| **Time & delivery** |
| Log/edit own draft time (0.25h steps, assignment-gated) | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Submit own week | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| See others' time entries | — | ◐ their projects | ✅ | — | — | — | — |
| Approve / reject entries | — | ◐ their projects | — | — | — | — | — |
| Projects & tasks | 👁 assigned | ✅ | ✅ | 👁 | — | — | — |
| **Money** |
| Rate cards (bill rates) | — | — | ✅ | — | — | — | — |
| Cost rates (what people cost) | — | — | ✅ | — | — | — | — |
| Clients (billing details, terms, timezone) | — | — | ✅ | — | — | — | 👁 |
| Generate / issue / void invoices, credit notes | — | — | ✅ | — | — | — | — |
| Record payments, pause dunning | — | — | ✅ | — | — | — | — |
| Payout statements | ◐ own (read) | — | ✅ | — | — | — | — |
| Margin, aging, unbilled, accounting export | — | 👁 reports | ✅ | — | — | — | — |
| **Staffing** |
| Bench view | 👁 (cost hidden) | 👁 | 👁 +cost | 👁 | — | — | — |
| Skills & person skills | ◐ own | ✅ | — | ✅ | — | — | — |
| Staffing requests (create/fill/cancel) | 👁 | ✅ | 👁 | ✅ | — | — | — |
| Time off | ◐ own | 👁 | 👁 | ✅ | — | — | — |
| **Sales & prospecting** |
| Prospects, cadences, sales tasks | — | — | — | — | — | ✅ | ◐ tasks |
| Leads, pipeline, quotes | — | — | 👁 | — | — | ✅ | — |
| Win handoff (client+contract+project+staffing) | — | — | — | — | — | ✅ | — |
| Contracts | — | — | ✅ | — | — | ✅ | 👁 |
| **Accounts** |
| Account 360, activities, opportunities | — | — | ✅ | — | — | ✅ | ✅ |
| Escalations (pause dunning tone) | — | — | ✅ | — | — | ✅ | ✅ |
| **Talent** |
| Requisitions | — | — | 👁 | 👁 | ✅ | — | — |
| Candidates (privacy tier H-11) | — | — | — | — | ✅ | — | — |
| Candidate visibility as interviewer | ◐ only candidates they interview | ◐ | ◐ | ◐ | ✅ | ◐ | ◐ |
| Offers, hire wizard, onboarding | — | — | — | — | ✅ | — | — |
| **Comms** |
| Send email as self | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Send email as department identity | — | per `allowed_roles` on each identity (server-validated) | | | | | |
| Calendar events (organizer cancels) | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Productivity integration items on projects | 👁 assigned | 👁 projects | 👁 | — | — | — | 👁 client accounts |
| Client portal records | — | ✅ project-linked | ✅ billing-linked | — | — | 👁 | ✅ |
| **Owner/Admin exclusive** |
| Command center, alert rules, two-sided pipeline | owner/admin only |
| People lifecycle: invite, deactivate (auth ban), reset password | admin/owner only (service-role Edge Function, server-checked) |
| Grant/revoke roles, email identities, company settings | admin (owner via expansion) |
| Setup checklist, integrations, trust artifacts | admin/owner only |
| Audit log | owner/admin only |
| MFA policy (required roles / per-user mandate) | admin (owner via expansion) |

## Workflow actions (FSM — who may fire which transition)

Server-enforced by `fsm_transition()`; the UI only shows what `*_actions()` returns.

| Entity | Action | From → To | Role | Comment required |
|---|---|---|---|---|
| time_entry | submit | draft → submitted | the employee | — |
| time_entry | approve | submitted → approved | pm (their projects) | — |
| time_entry | reject | submitted → draft | pm (their projects) | ✅ |
| invoice | issue | draft → issued | finance | — |
| invoice | record_payment | issued/partially_paid/overdue | finance | — |
| invoice | void | issued/overdue/partially_paid → void | finance | ✅ |
| invoice | credit_note | issued/paid/… → (new CN) | finance | — |
| invoice | delete_draft | draft → (gone) | finance | — |
| payout_statement | confirm | draft → confirmed | finance | — |
| payout_statement | mark_paid | confirmed → paid | finance | — |
| staffing_request | fill | open → filled | resourcing | — |
| staffing_request | cancel | open → cancelled | resourcing | ✅ |
| lead | qualify / send_proposal / negotiate | ladder | sales | — |
| lead | win | qualified/proposal_sent/negotiation → won | sales | — |
| lead | lose | any active → lost | sales | ✅ |
| quote | send / accept / reject / revise | draft→sent→accepted/rejected/superseded | sales | reject ✅ |
| prospect | convert / disqualify / mark_dnc | active → … | sales | disqualify ✅ |
| candidate | screen/interview/assess/offer | ladder | recruiter | — |
| candidate | hire | offer → hired (scorecard-gated) | recruiter | — |
| candidate | reject | any active → rejected | recruiter | ✅ |
| candidate | pool / reactivate | ↔ talent_pool | recruiter | — |

## Hard guarantees (validated 2026-08-06, ~245 automated checks)

- Status columns can **never** be written directly — guard triggers reject any
  update outside `fsm_transition()` (`app.via_rpc` transaction flag).
- Approved time entries and issued invoices are **immutable**; corrections are
  adjustment entries / credit notes. Payments are append-only.
- Payments cannot be negative or exceed the remaining balance.
- Money RPCs re-check roles server-side (`42501` on violation) — hiding a
  button is cosmetic, the database is the enforcement point.
- Every sensitive action writes `audit_log`; workflow steps write
  `workflow_history`.
- `service_role` exists only inside Edge Functions; user-facing admin actions
  re-verify the caller's admin/owner role server-side.
- Client contacts are never granted internal roles. Register them under
  **Clients -> Client portal** and use client-facing documents/approval
  requests for external collaboration.

## MFA

TOTP (authenticator app) via Supabase Auth — **off by default**.

- **Per role**: Admin → Company settings → Security: pick roles that must use MFA.
- **Per user**: Admin → People → edit (✎) → "Require MFA".
- Mandated users without a factor are blocked at a full-screen enrollment gate
  after login; users with a factor are stepped up to AAL2 with a 6-digit code.
- Anyone may enroll voluntarily (Preferences → Two-factor authentication);
  mandated users cannot remove their factor.
