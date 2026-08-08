# Feature workflows and examples

This guide explains how to use each major feature end to end. It is written as
an operating manual: who starts the workflow, what they click, what the system
does, and what the expected output is.

## 1. Account access and onboarding

**Used by:** admin, all users

### End-to-end flow

1. Admin opens **Admin -> People**.
2. Admin clicks **Add person**.
3. Admin enters name, email, employment type and roles.
4. The system creates the auth user, profile and workspace membership.
5. Admin receives a one-time temporary password.
6. User signs in at `https://os.ibrave.co`.
7. User changes password in **Preferences -> Password**.
8. If MFA is required, the user enrolls an authenticator app before entering
   the workspace.

### Example

Add a PM:

| Field | Value |
|---|---|
| Name | Priya Sharma |
| Email | priya@example.com |
| Employment type | employee |
| Roles | `employee`, `pm` |

Expected result: Priya can log her own time, see assigned projects and approve
submitted time for projects she manages. She cannot issue invoices or manage
users.

## 2. Preferences, MFA and notifications

**Used by:** all users, admin for policy

### User flow

1. User opens **Preferences**.
2. User updates name, title, timezone or appearance.
3. User changes password when needed.
4. User enrolls or manages MFA under **Two-factor authentication**.
5. User controls email copies of notifications.

### Admin policy flow

1. Admin opens **Admin -> Company settings -> Security**.
2. Admin chooses roles that must use MFA.
3. Users with those roles are forced through MFA enrollment at next login.

### Example

Require MFA for finance:

1. Admin toggles `finance` in MFA-required roles.
2. A finance user signs in.
3. The app blocks workspace access until the user scans the QR code and enters
   the current authenticator code.

## 3. Projects, assignments and tasks

**Used by:** PM, finance, admin, sales handoff

### End-to-end flow

1. Create or receive a client/project through sales handoff or **Projects**.
2. PM/finance defines project status and billing model.
3. PM creates coarse tasks if timesheets need structure.
4. PM/resourcing assigns people with start dates, end dates and allocation.
5. Assigned people can log time within assignment dates.

### Example

Client ACME starts a T&M implementation project:

| Object | Example value |
|---|---|
| Project | ACME Platform Build |
| Billing model | T&M |
| Tasks | Backend, Frontend, QA, Meetings |
| Assignment | Alex, Backend Engineer, 80%, starts 2026-08-01 |

Expected result: Alex sees ACME Platform Build in the timesheet and can log
time only for assignment-covered dates.

## 4. Time tracking

**Used by:** employee, contractor, PM

### End-to-end flow

1. User opens **Timesheet**.
2. User selects assigned project and task.
3. User logs hours in 0.25h increments.
4. User marks entries billable or non-billable where allowed.
5. User submits the week.
6. Submitted entries move to the PM approval queue.

### Example

Alex logs:

| Date | Project | Task | Hours | Note |
|---|---|---|---:|---|
| 2026-08-03 | ACME Platform Build | Backend | 6.5 | API integration |
| 2026-08-03 | ACME Platform Build | Meetings | 1.0 | Sprint planning |

Expected result: the week is submitted, Alex cannot edit submitted rows unless
the PM rejects them.

## 5. Approvals

**Used by:** PM

### End-to-end flow

1. PM opens **Approvals**.
2. PM reviews submitted entries grouped by person/week.
3. PM approves valid rows.
4. PM rejects incorrect rows with a required comment.
5. Approved rows become immutable and feed invoicing, payouts and margin.

### Example

Alex submits 7.5 hours but one row has the wrong task.

PM action:

1. Approve the valid backend row.
2. Reject the meetings row with: `Please move this to Sprint planning task`.

Expected result: Alex is notified, fixes the rejected entry and resubmits.

## 6. Client setup and Account 360

**Used by:** finance, sales, account owner

### End-to-end flow

1. Create the client through sales handoff or **Clients -> New client**.
2. Finance fills billing details: legal name, address, invoice code, terms,
   currency, tax/VAT data and invoice grouping.
3. Account owner adds contacts and tracks account activity.
4. The Account 360 screen shows team, hours, AR, renewal, opportunities,
   escalations, feedback and invoice history.

### Example

ACME billing setup:

| Field | Value |
|---|---|
| Invoice code | ACME |
| Currency | USD |
| Payment terms | Net 30 |
| Invoice grouping | project |
| Billing contact | billing@acme.example |

Expected result: issued invoices use numbers like
`INV-ACME-2026-0001`, with due dates based on Net 30.

## 7. Client portal administration

**Used by:** account owner, PM, finance, admin

### End-to-end flow

1. Open **Clients -> <client> -> Client portal**.
2. Register client contacts under **Portal users**.
3. Register shared documents under **Documents**.
4. Create client approval requests under **Approval requests**.
5. Track the status of what was shared and what the client decided.

### Example

Monthly approval request:

| Field | Value |
|---|---|
| Portal user | maria@acme.example |
| Approval title | Approve July timesheets |
| Details | Please approve the attached July delivery summary by August 5 |
| Linked project | ACME Platform Build |

Expected result: the account team has a single record showing that ACME was
asked to approve July timesheets. Until a public client portal route is
deployed, the client receives the actual document/link through the normal
client communication flow.

## 8. Invoicing

**Used by:** finance

### End-to-end flow

1. Finance checks **Reports -> Unbilled work**.
2. Finance opens **Invoices -> Generate draft**.
3. Finance selects client and billing period.
4. The system pulls approved, uninvoiced time and applies effective rate cards.
5. Finance reviews lines and adds manual lines if required.
6. Finance issues the invoice.
7. The system assigns invoice number, freezes the invoice and marks included
   time as invoiced.
8. Finance sends the invoice email with PDF from the invoice screen.

### Example

Generate ACME July invoice:

| Field | Value |
|---|---|
| Client | ACME |
| Period | 2026-07-01 to 2026-07-31 |
| Grouping | project |

Expected result: a draft invoice with approved July hours priced from the
correct rate card. Once issued, it cannot be edited.

## 9. Payments and collections

**Used by:** finance, account owner

### End-to-end flow

1. Finance opens an issued invoice.
2. Finance records payment amount, date and method.
3. The invoice moves to paid or partially paid.
4. Automatic dunning stops when paid.
5. Aging and account health update from the payment state.

### Example

ACME invoice total is USD 10,000. ACME pays USD 6,000.

Expected result: invoice status becomes partially paid. Remaining open AR is
USD 4,000. The system refuses payment records above the outstanding amount.

## 10. Payouts

**Used by:** finance, employee/contractor for own read

### End-to-end flow

1. Finance generates payout statements for a period.
2. The system uses approved hours and cost rates.
3. Finance checks reconciliation for missing rates or hour mismatches.
4. Finance confirms statements.
5. User is notified.
6. Finance pays outside the system and marks the statement paid.

### Example

Alex has 120 approved July hours at USD 40/hour.

Expected result: draft payout statement for USD 4,800. After confirmation it
is immutable and visible to Alex.

## 11. Reports and accounting exports

**Used by:** owner, finance, PM

### End-to-end flow

1. PM reviews utilization and project burn.
2. Finance reviews unbilled work, aging, margin and accounting export.
3. Owner reviews command center and portfolio health.
4. Drill down from reports to source records when something looks wrong.

### Example

Unbilled work shows ACME has USD 8,000 approved but not invoiced.

Expected result: finance generates a draft invoice or identifies why the work
should remain unbilled.

## 12. Sales, quotes and win handoff

**Used by:** sales, finance, PM, resourcing

### End-to-end flow

1. Sales creates prospects and activities.
2. Sales qualifies a lead.
3. Sales creates quote and sends it.
4. Quote is accepted.
5. Sales marks the deal won.
6. Win handoff creates or links the client, contract, project and staffing
   request where roles were sold.

### Example

ACME accepts a quote for two backend engineers.

Expected result: ACME client exists, contract exists, project is created, and
resourcing sees a staffing request for two backend engineers.

## 13. Staffing and resourcing

**Used by:** PM, resourcing, finance/owner for cost visibility

### End-to-end flow

1. PM or sales handoff opens a staffing request.
2. Resourcing reviews capacity and suggested candidates.
3. Resourcing fills the request.
4. The system creates assignments and notifies assigned people.
5. Assigned people can log time for the project.

### Example

Request:

| Field | Value |
|---|---|
| Role | Senior React Engineer |
| Allocation | 100% |
| Start | 2026-09-01 |
| Skills | React, TypeScript, Supabase |

Expected result: resourcing fills the request with an available person and the
assignment controls timesheet access.

## 14. Recruiting

**Used by:** recruiter, interviewers

### End-to-end flow

1. Recruiter creates requisition.
2. Recruiter adds candidate.
3. Candidate moves through screening, interviews, assessment and offer.
4. Interviewers see only candidates they are assigned to interview.
5. Recruiter marks hired.
6. Hire handoff creates user/profile/onboarding records where configured.

### Example

Candidate Lina is moved to technical interview.

Expected result: interviewer receives calendar/email details and can see the
candidate only for that interview context.

## 15. Calendar and email

**Used by:** all users, role-specific identities

### Calendar flow

1. Open **Calendar**.
2. Click **New event**.
3. Add title, time, location, internal attendees and external guest emails.
4. Save event.
5. Internal users receive notifications; external guests receive `.ics`.

### Email flow

1. Open a client, lead, candidate or invoice screen.
2. Click email action.
3. Choose allowed From identity.
4. Write message or use template context.
5. Send.
6. The system logs the email on the related timeline.

### Example

Finance sends an issued invoice to `billing@acme.example`.

Expected result: email is sent with official PDF, `email_log` records the send,
and the client timeline shows the document communication.

## 16. Productivity integrations

**Used by:** admin, PM, account owner

### Setup flow

1. Set provider secrets in Supabase.
2. Deploy the `integrations` Edge Function.
3. Open **Admin -> Integrations**.
4. Add a connection for GitHub, Jira, Linear, Google Calendar, Microsoft
   Calendar, Slack or Teams.
5. Map the connection to an internal project.
6. Click **Test sync**.
7. Open **Projects -> <project> -> Productivity integrations**.

### Example: Jira

Secrets:

```bash
supabase secrets set JIRA_BASE_URL=https://company.atlassian.net
supabase secrets set JIRA_EMAIL=service-account@company.example
supabase secrets set JIRA_API_TOKEN=...
supabase secrets set JIRA_PROJECT_KEY=ACME
```

Connection:

| Field | Value |
|---|---|
| Provider | jira |
| Display name | Jira ACME |
| Project mapping | ACME Platform Build |

Expected result: Jira issues are normalized into project productivity items
with key, title, status, priority, assignee and external link.

### Example: GitHub

Secrets:

```bash
supabase secrets set GITHUB_TOKEN=...
supabase secrets set GITHUB_OWNER=your-org
supabase secrets set GITHUB_REPO=your-repo
```

Expected result: GitHub issues and pull requests appear on the mapped project.
If GitHub returns 404, check owner/repo spelling, token repository selection,
read permissions, SSO approval and token expiry.

## 17. Admin setup checklist, integrations and trust

**Used by:** admin, owner

### Setup checklist flow

1. Open **Admin -> Setup**.
2. Work through import and readiness steps.
3. Mark a step **Done** when completed or **Skip** when intentionally omitted.

### Import batch flow

1. Choose import type: people, clients, projects, rates, opening balances,
   invoices or assignments.
2. Register file/batch metadata.
3. Use it as the controlled migration checklist for onboarding data.

### Trust artifact flow

1. Open **Admin -> Trust**.
2. Add DPA, subprocessors, SLA, backup/DR, incident response or security
   policy artifacts.
3. Publish only documents approved for commercial sharing.

## 18. Privacy Center

**Used by:** all signed-in users, admin/owner for handling

### User flow

1. Open **Privacy Center**.
2. Choose request type: access, portability, rectification, erasure,
   restriction, objection or other.
3. Submit details.
4. Track request status.

### Admin flow

1. Open **Admin -> Privacy**.
2. Review open requests.
3. Export data or take required action using the governed workflow.
4. Close the request with an auditable outcome.

### Example

An employee requests a copy of their workspace data.

Expected result: the request is recorded, admins can process it, and the user
can receive an export without exposing other users' data.

## 19. Security and audit

**Used by:** owner, admin

### Flow

1. Open **Admin -> Security**.
2. Review security events such as denied role attempts, unauthenticated
   function calls and integration sync failures.
3. Investigate the related user/entity.
4. Adjust roles, MFA, provider secrets or access as needed.

### Example

An employee manually enters `/approvals`.

Expected result: the UI denies access and server-side policies prevent data
access. A security event may be logged for sensitive denied paths.

## 20. End-to-end business example

ACME signs a new engineering engagement:

1. Sales creates lead, quote and marks the deal won.
2. Win handoff creates ACME client, contract, project and staffing request.
3. Resourcing fills the request and assignments are created.
4. Employees log daily time.
5. PM approves submitted weeks.
6. Finance checks unbilled work and generates invoice.
7. Finance issues and emails invoice PDF to ACME.
8. Account owner logs monthly digest and tracks client approval request.
9. Finance records payment.
10. Finance confirms payout statements.
11. Owner reviews margin and account health.
12. Jira/GitHub sync shows delivery artifacts on the ACME project page.

Expected result: the entire engagement is traceable from sales promise to
delivery work, invoice, payment, payout and margin.
