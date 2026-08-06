# Resourcing & Recruiting guide — supply side

Resourcing keeps today's people optimally allocated; recruiting keeps
tomorrow's people arriving on time. The two meet at the staffing request.

## Resourcing

### Bench (the daily view)

Everyone with capacity, their committed allocation over the next 4 weeks,
free %, upcoming time off, and (finance/owner eyes only) what the free
capacity costs per week. Anyone under 80% allocated is flagged. Sortable by
any column.

### Staffing requests

The formal "we need a person" record — created by you, a PM, or automatically
when sales wins a deal with roles attached. You're notified when one opens.

1. Open the request (role title, skills, seniority, %, start, duration).
2. **Suggested candidates** ranks internal people **skills-first**;
   availability only breaks ties between equally-skilled people. An
   over-allocated expert still outranks an idle non-match — the point is to
   surface the right conversation, not to auto-assign.
3. **Fill** with a person → the assignment is created for the request's
   window and they're notified. **Cancel** requires a comment.
4. Can't fill internally? Hand it to recruiting as a requisition
   (reason: staffing_request keeps the link).

### Skills & capacity

Maintain the skills catalog and people's skill levels — matching is only as
good as this data. Capacity forecast shows demand (assignments) vs supply
(capacity − time off) per month; it's your early warning to open requisitions.

## Recruiting

### Requisitions

Every hire starts as a requisition (role, skills, seniority, headcount,
reason). It auto-fills when enough candidates are hired against it.

### Candidate pipeline

`sourced → screening → interview → assessment → offer → hired`, with
`rejected` (comment required — it's the record) and `talent_pool` (parked,
reactivatable) as exits. Cards move by drag or from the candidate workspace;
stage skips the ladder doesn't allow are refused.

**Privacy is enforced, not polite fiction**: candidates are visible to
recruiters/owner/admin — and to an interviewer only for candidates they
interview. Expected rates are recruiter-only.

### Interviews and scorecards

Schedule rounds with any colleague as interviewer (calendar invite included —
external candidates get a real `.ics`). The interviewer fills the scorecard
(criteria 1–5 + recommendation). **Hiring is blocked until at least one
scorecard is submitted** — no gut-feel hires.

### Offer → hire

**Record offer** (rate, period, start) moves the candidate to `offer`.
**Hire** then, atomically: accepts the offer, creates the onboarding
checklist (owner: admin — account creation, contract, cost rate, first
assignment), closes the requisition at headcount, and notifies the admin.
The auth account itself is created by the admin (Admin → People) as a
checklist step.

### Talent pool

Strong-but-not-now candidates get parked, not rejected — the pool is your
cheapest sourcing channel. Reactivate straight into screening when a
requisition matches. Idle candidates (stuck >7 days in an active stage)
nudge their owner automatically.
