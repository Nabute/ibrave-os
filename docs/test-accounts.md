# Test accounts and scenarios

Every account below exists on the hosted project and is created idempotently by
migrations `…36_qa_scenarios.sql` and `…37_rename_qa_to_test.sql`, so a `supabase db push` on any
environment reproduces the whole matrix.

> A branded PDF of this page for sharing with the testing team lives at
> [ibrave-OS-test-accounts.pdf](ibrave-OS-test-accounts.pdf); regenerate it from
> `docs/test-accounts.pdf.html` with `node scripts/make-test-accounts-pdf.mjs`.

## Logins

**Demo accounts** (password `password123`) are the "realistic company" set.
**Test accounts** (password `Passw0rd!Test`) each carry exactly one role so a
tester can prove what that role alone can and cannot do.

| Email | Password | Roles | What it is for |
|---|---|---|---|
| owner@ibrave.co | password123 | owner, admin | Sees everything, Command Center, alert rules |
| pm@ibrave.co | password123 | pm, employee, resourcing | Approvals + staffing, realistic delivery lead |
| finance@ibrave.co | password123 | finance | The full money loop |
| dev1@ibrave.co | password123 | employee | Ordinary employee with history |
| dev2@ibrave.co | password123 | employee (contractor) | Contractor variant |
| test.admin@ibrave.co | Passw0rd!Test | admin | Admin **without** owner: user lifecycle, roles, settings, templates. Must NOT see Command Center |
| test.pm@ibrave.co | Passw0rd!Test | pm | Approves only on their own projects. Must NOT see money screens |
| test.finance@ibrave.co | Passw0rd!Test | finance | Invoices, payouts, rates, exports. Must NOT approve time |
| test.sales@ibrave.co | Passw0rd!Test | sales | Prospects, pipeline, quotes, win handoff. Must NOT see cost rates |
| test.recruiter@ibrave.co | Passw0rd!Test | recruiter | Full talent pipeline. Must NOT see invoices |
| test.resourcing@ibrave.co | Passw0rd!Test | resourcing | Bench, staffing requests, skills. Bench cost must be hidden |
| test.account@ibrave.co | Passw0rd!Test | account_owner | Account 360, opportunities, escalations |
| test.employee@ibrave.co | Passw0rd!Test | employee | Baseline: own timesheet, own payouts, nothing else. Has assignments + skills |
| test.multi@ibrave.co | Passw0rd!Test | pm + finance + sales | Multi-role union of permissions in one session |
| test.mfa@ibrave.co | Passw0rd!Test | employee (MFA required) | Forced TOTP enrollment gate at login; factor cannot be removed |
| test.inactive@ibrave.co | Passw0rd!Test | employee (deactivated) | **Login must be refused** ("User is banned") |
| test.nocost@ibrave.co | Passw0rd!Test | employee (contractor) | Has hours but **no cost rate**: margin gap + reconciliation flag |

> `test.contractor@ibrave.co` also exists from earlier admin testing and has an
> enrolled TOTP factor; its password was rotated during testing, reset it from
> Admin → People if you need it.

## Scenario data (all prefixed "Test" and searchable)

### Clients and projects
| Record | State to test |
|---|---|
| Northwind Trading (NWND) | Tier A, USD, Net 30, Europe/Dublin clock, has account owner |
| Umbra Systems (UMBR) | EUR, Net 14, **overdue invoices + open escalation** (red health) |
| Solstice Retail (SOLS) | Net 45, **retainer project**, no account owner |
| Northwind Platform / Umbra Migration | Active T&M with effective-dated rate cards (rate rose 30 days ago) |
| Solstice Support | **Retainer** billing model, 40 included hours, overage rate |
| Northwind Archive | **Closed** project (must not accept new time) |

### Time entries (Test Employee)
draft · submitted (awaiting approval) · approved billable · approved
internal (non-billable) · **rejected back to draft with a reason** · hours on a
second client · contractor hours · retainer hours · a booked vacation.

### Invoices, one per state
| Notes tag | State |
|---|---|
| TEST-DRAFT | Draft, lines editable, can be deleted |
| TEST-COURTESY | Issued, **due in 3 days** → courtesy dunning stage |
| TEST-OVERDUE7 / 14 / 30 | Overdue at exactly 7 / 14 / 30 days → each dunning stage |
| TEST-PARTIAL | Partially paid (one third recorded) |
| TEST-PAID | Fully paid |
| TEST-VOID | Voided with a reason |
| TEST-CREDIT | **Credit note** against the paid invoice, negative total |

Try: overpaying (must be refused), paying a void invoice (refused), editing an
issued invoice (refused), pausing dunning, and the bank CSV matcher.

### Sales
A lead at **every stage**: lead → qualified → proposal_sent → negotiation →
won → lost (with a loss reason). Quotes: one `sent`, one `superseded` and its
`accepted` v2. Contracts: renewing in **30 days**, in **60 days**, already
**expired**, and one **open-ended**.

### Prospecting
Prospects that are `active`, `dnc` (all actions must be blocked), `disqualified`
and `converted`. Sales tasks **overdue** and **due today**. A 3-touch cadence
is defined and ready to start on the active prospect.

### Accounts
Opportunities in `idea`, `proposed`, `won`, `lost`. Escalations: one **open**
(pauses overdue dunning on Umbra) and one **resolved**.

### Staffing
Requests `open` (fill it, candidates rank skills-first) and `cancelled`.
Bench shows an under-allocated person, a fully committed person and upcoming
time off.

### Talent
A candidate in **every stage**: sourced, screening, interview, assessment,
offer, hired, rejected (with reason), talent_pool. The **offer** candidate has
a submitted scorecard so `hire` succeeds; the **interview** candidate has an
unsubmitted round so `hire` must stay blocked. Requisitions: one `open`
(2 seats), one `filled`. The hired candidate has an onboarding checklist.

### Calendar
A **past** event, one **today**, and one **next week** with an external guest
(so the past/today/future colour coding and the summary tiles all have data).

## Suggested first pass for a tester

1. Sign in as each `test.*` account and confirm the sidebar matches the
   [role matrix](role-matrix.md), no more, no less.
2. `test.inactive` must be refused; `test.mfa` must be forced into enrollment.
3. As `test.employee`: log time, submit the week, then confirm the entry locks.
4. As `test.pm`: approve part of it, reject one with a comment, confirm the
   employee's copy returns to draft carrying the reason.
5. As `test.finance`: generate a draft from approved work, issue it (check the
   `INV-NWND-YYYY-NNNN` numbering), try to edit it (must fail), record a
   partial payment, then a credit note.
6. As `test.sales`: drag a lead forward on the board, then run the win handoff
   and confirm a client, contract, project and staffing request all appear.
7. As `test.recruiter`: try to hire the interview-stage candidate (blocked, no
   scorecard), then hire the offer-stage one (succeeds, onboarding appears).
