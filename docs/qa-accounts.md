# QA accounts and test scenarios

Every account below exists on the hosted project and is created idempotently by
migration `20260806000036_qa_scenarios.sql`, so a `supabase db push` on any
environment reproduces the whole matrix.

## Logins

**Demo accounts** (password `password123`) are the "realistic company" set.
**QA accounts** (password `Passw0rd!QA`) each carry exactly one role so a
tester can prove what that role alone can and cannot do.

| Email | Password | Roles | What it is for |
|---|---|---|---|
| owner@ibrave.co | password123 | owner, admin | Sees everything, Command Center, alert rules |
| pm@ibrave.co | password123 | pm, employee, resourcing | Approvals + staffing, realistic delivery lead |
| finance@ibrave.co | password123 | finance | The full money loop |
| dev1@ibrave.co | password123 | employee | Ordinary employee with history |
| dev2@ibrave.co | password123 | employee (contractor) | Contractor variant |
| qa.admin@ibrave.co | Passw0rd!QA | admin | Admin **without** owner: user lifecycle, roles, settings, templates. Must NOT see Command Center |
| qa.pm@ibrave.co | Passw0rd!QA | pm | Approves only on their own projects. Must NOT see money screens |
| qa.finance@ibrave.co | Passw0rd!QA | finance | Invoices, payouts, rates, exports. Must NOT approve time |
| qa.sales@ibrave.co | Passw0rd!QA | sales | Prospects, pipeline, quotes, win handoff. Must NOT see cost rates |
| qa.recruiter@ibrave.co | Passw0rd!QA | recruiter | Full talent pipeline. Must NOT see invoices |
| qa.resourcing@ibrave.co | Passw0rd!QA | resourcing | Bench, staffing requests, skills. Bench cost must be hidden |
| qa.account@ibrave.co | Passw0rd!QA | account_owner | Account 360, opportunities, escalations |
| qa.employee@ibrave.co | Passw0rd!QA | employee | Baseline: own timesheet, own payouts, nothing else. Has assignments + skills |
| qa.multi@ibrave.co | Passw0rd!QA | pm + finance + sales | Multi-role union of permissions in one session |
| qa.mfa@ibrave.co | Passw0rd!QA | employee (MFA required) | Forced TOTP enrollment gate at login; factor cannot be removed |
| qa.inactive@ibrave.co | Passw0rd!QA | employee (deactivated) | **Login must be refused** ("User is banned") |
| qa.nocost@ibrave.co | Passw0rd!QA | employee (contractor) | Has hours but **no cost rate**: margin gap + reconciliation flag |

> `test.contractor@ibrave.co` also exists from earlier admin testing and has an
> enrolled TOTP factor; its password was rotated during testing, reset it from
> Admin → People if you need it.

## Scenario data (all prefixed "QA" and searchable)

### Clients and projects
| Record | State to test |
|---|---|
| Northwind Trading (NWND) | Tier A, USD, Net 30, Europe/Dublin clock, has account owner |
| Umbra Systems (UMBR) | EUR, Net 14, **overdue invoices + open escalation** (red health) |
| Solstice Retail (SOLS) | Net 45, **retainer project**, no account owner |
| Northwind Platform / Umbra Migration | Active T&M with effective-dated rate cards (rate rose 30 days ago) |
| Solstice Support | **Retainer** billing model, 40 included hours, overage rate |
| Northwind Archive | **Closed** project (must not accept new time) |

### Time entries (dev QA Employee)
draft · submitted (awaiting approval) · approved billable · approved
internal (non-billable) · **rejected back to draft with a reason** · hours on a
second client · contractor hours · retainer hours · a booked vacation.

### Invoices, one per state
| Notes tag | State |
|---|---|
| QA-DRAFT | Draft, lines editable, can be deleted |
| QA-COURTESY | Issued, **due in 3 days** → courtesy dunning stage |
| QA-OVERDUE7 / 14 / 30 | Overdue at exactly 7 / 14 / 30 days → each dunning stage |
| QA-PARTIAL | Partially paid (one third recorded) |
| QA-PAID | Fully paid |
| QA-VOID | Voided with a reason |
| QA-CREDIT | **Credit note** against the paid invoice, negative total |

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

1. Sign in as each `qa.*` account and confirm the sidebar matches the
   [role matrix](role-matrix.md), no more, no less.
2. `qa.inactive` must be refused; `qa.mfa` must be forced into enrollment.
3. As `qa.employee`: log time, submit the week, then confirm the entry locks.
4. As `qa.pm`: approve part of it, reject one with a comment, confirm the
   employee's copy returns to draft carrying the reason.
5. As `qa.finance`: generate a draft from approved work, issue it (check the
   `INV-NWND-YYYY-NNNN` numbering), try to edit it (must fail), record a
   partial payment, then a credit note.
6. As `qa.sales`: drag a lead forward on the board, then run the win handoff
   and confirm a client, contract, project and staffing request all appear.
7. As `qa.recruiter`: try to hire the interview-stage candidate (blocked, no
   scorecard), then hire the offer-stage one (succeeds, onboarding appears).
