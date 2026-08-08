# Project Manager guide — approvals and delivery

You are the quality gate between logged hours and client invoices: nothing
gets billed that you haven't approved, and approval is final.

## Approvals (daily)

The queue groups submitted entries by person and week. For each group:

- **Approve all** — the whole week at once.
- **Select rows** (checkboxes) → **Approve selected (n)** for a partial pass.
- **Reject** (✗) — requires a comment; the entry returns to the person's
  draft with your reason attached, and they're notified.

What approval means: *"this work happened, on this project, and can be
billed."* After you approve:

- The entry is immutable — even for you, even for finance.
- It appears in unbilled work and will be picked up by the next invoice.
- It feeds the person's payout and the project's margin.
- The person gets one summary notification per approval batch.

You can only approve entries on projects where you are the PM, and never your
own entries. You'll be nudged daily while anything sits in your queue.

**Common judgment calls**

| Situation | Do |
|---|---|
| Hours look inflated | Reject with a comment — the comment is the record |
| Wrong project | Reject; the person re-logs on the right one |
| You approved by mistake | It's final. Have the person add a negative adjustment entry referencing it |
| Person on the project but entries blocked | Their assignment dates don't cover the work date — fix the assignment |

## Projects

Projects → your projects: status, billing model (T&M / retainer / milestone),
budget burn, team. Burn percentages come from approved hours against budget —
another reason approvals shouldn't lag.

- **Tasks** give timesheet rows structure; keep them coarse (workstreams, not
  tickets).
- **Assignments** control who can log time and when (start/end dates,
  allocation %). End-date people who roll off; don't delete history.

## Productivity integrations on projects

When an admin maps GitHub, Jira, Linear, Google Calendar, Microsoft Calendar,
Slack or Teams to one of your projects, synced items appear under:

```text
Projects -> <project> -> Productivity integrations
```

Use this as delivery context, not as the billing source of truth. Tickets,
pull requests, events and chat messages explain what happened; approved
timesheets still drive invoices, payouts and margin.

Example: if Jira shows `ACME-142 Backend API pending review`, check that the
work is reflected in the team's timesheet notes before approving related time.

## Client-facing approvals

For client sign-off on timesheets, scope or documents:

1. Open **Clients -> <client> -> Client portal**.
2. Create an approval request with a clear title and details.
3. Link the project or invoice where relevant.
4. Coordinate the actual client communication with the account owner until a
   public client portal route is deployed.

## Staffing (with your resourcing hat)

Most PMs also hold the resourcing role:

- **Bench** — who is under-allocated in the next 4 weeks (cost of the bench is
  visible to finance/owner only).
- **Requests** — when you need a person, open a staffing request (role,
  skills, %, start). Suggested candidates are ranked skills-first,
  availability as tiebreak. **Fill** creates the assignment and notifies the
  person; **Cancel** needs a comment.
- **Capacity** — demand vs supply per month, driven by assignment windows.

## Reports you own

Reports → Utilization (billable share per person) and Project burn. If
utilization looks wrong, it's almost always unapproved time — clear the queue
first, then read the report.
