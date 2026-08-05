# Outsourcing Business Automation Platform — Master Blueprint

**Scope:** End-to-end internal platform for a 10–50 person outsourcing company: sales → contracts → staffing → delivery (timesheets) → invoicing → payouts → reporting.

**Companion document:** *Timesheet & Invoicing Spec v1.0* — that document remains the detailed spec for Modules D and E below; this blueprint defines everything around it and how it all connects.

---

## 1. Vision & Operating Principles

One integrated system, not six tools. Every module reads and writes a **shared core**: People, Clients, Projects, Rates, Time, and Money. A deal closed in Sales becomes a Project in Delivery without retyping; approved hours drive both the client invoice and the contractor payout; margin reporting falls out for free because revenue and cost live in the same database.

**Principles**

1. **Single source of truth.** No data is entered twice. If it exists in one module, others reference it.
2. **Append-only money trail.** Anything financial (approved hours, issued invoices, payouts) is immutable; corrections are new records.
3. **Automate the handoffs, not just the tasks.** The biggest waste in a services business is between stages — quote→contract→project→invoice. Each transition should be one click.
4. **Boring technology, one deployment.** At 10–50 people, a single modular monolith beats microservices in every way that matters.
5. **Humans approve, the system prepares.** Automation drafts everything (quotes, invoices, reminders, payout statements); a person confirms the ones that move money.

---

## 2. System Map

```
┌─────────────────────────────────────────────────────────────────┐
│                      SHARED CORE (Postgres)                     │
│   People · Roles · Skills · Clients · Contracts · Projects      │
│   Rate cards (bill + cost) · Time entries · Invoices · Payouts  │
└─────────────────────────────────────────────────────────────────┘
   ▲            ▲             ▲            ▲            ▲
   │            │             │            │            │
 A. Sales     B. Staffing   C. Delivery  D. Billing   E. Payouts
 Development, & Bench       (Timesheets  & Collections & Margin
 Quotes &     Management     + Approvals)               Reporting
 Contracts          │
        H. Talent Acquisition & Talent Database
        (candidate pipeline → hire → talent 360)
                    │
                    │        G. Client / Account Management
                    │        (contacts, health, renewals, growth)
                    ▼
              F. Automation Engine
   (scheduled jobs, notifications, document generation)
                    │
                    ▼
     I. Daily Workspaces & Owner Command Center
   (role-based home screens · company activity feed ·
    100% drill-down transparency for admin/owner)
```

The two sides of the business mirror each other deliberately: the **client side** runs Prospect → Lead → Contract → Account 360, and the **talent side** runs Candidate → Hire → Assignment → Talent 360 — same pipeline mechanics, same 360-view pattern, same activity timelines. Delivery, billing, and payouts sit in the middle where the two sides meet.

---

## 3. Module A — Sales Development, Quotes & Contracts

**Purpose:** Fill the top of the funnel systematically, then turn a lead into a signed engagement and an active project with zero retyping.

### 3a. Sales development (prospecting & outreach)

- **A-0.1** **Prospect list:** a pre-pipeline stage for companies you intend to pursue: company, industry, size, region, source (referral, event, inbound, research), fit score (manual 1–5 in v1), and the target contact(s). Bulk import from CSV/LinkedIn exports.
- **A-0.2** **Outreach cadences:** define reusable sequences of touches (e.g., Day 0 email → Day 3 LinkedIn → Day 7 call → Day 14 email). The system schedules the touches as tasks for the owner, provides the email template with merge fields (name, company, relevant case study), and logs each completed touch. v1 creates drafts/tasks rather than auto-sending cold email — a human sends, the system remembers.
- **A-0.3** **Task queue ("today view"):** each salesperson sees today's due touches, follow-ups, and meetings in one list; completing a task logs the activity and schedules the next step in the cadence automatically.
- **A-0.4** **Meeting → lead conversion:** when a prospect responds or books a meeting, one click converts them to a Lead in the pipeline (A-1) carrying over the full activity history.
- **A-0.5** **Source & conversion analytics:** prospects → conversations → qualified leads → won, by source and by owner, so you learn which channels actually produce clients.
- **A-0.6** Do-not-contact list and per-contact opt-out flag, respected by all templates and cadences.

### 3b. Pipeline, quotes & contracts

- **A-1** Lead pipeline with stages: `Lead → Qualified → Proposal Sent → Negotiation → Won | Lost`. Fields: company, contact, source, expected value, expected start, probability, owner, notes/activity log.
- **A-2** **Quote builder:** compose a quote from your service catalog — role-based line items (e.g., "Senior Developer, 160 h/mo @ $X") pulled from a standard rate card, or retainer/fixed-price packages. Output: branded PDF quote with validity date.
- **A-3** Quote versioning: revised quotes create v2, v3…; the accepted version is locked and becomes the contract's commercial basis.
- **A-4** **Contract generation:** merge accepted quote data into a contract template (DOCX/PDF) — parties, scope, rates, payment terms, term dates, notice period. Store the signed copy against the client.
- **A-5** **Win handoff (the key automation):** marking a deal Won triggers a wizard that creates, in one step: the Client (if new), the Contract record, the Project(s) with billing model and rate card pre-filled from the quote, and a staffing request (Module B) for the roles sold.
- **A-6** Renewal & expiry watchdog: alerts 60/30 days before contract end or rate-review dates.
- **A-7** Simple pipeline reporting: weighted pipeline value, win rate, revenue booked vs. target.

**Deliberately excluded (v1):** automated cold-email sending at scale, marketing automation/ads, and external CRM sync. Cadences (A-0.2) prepare and track outreach; humans press send. If volume later justifies it, an email-sequencing integration can bolt onto the same data.

---

## 4. Module B — Staffing & Bench Management

**Purpose:** Always know who is available, who is billable, and who fits an incoming request.

**Requirements**

- **B-1** **People profiles:** role/seniority, skills with proficiency (tag-based, e.g., `react:senior`, `qa-automation:mid`), languages, location/timezone, employment type (employee/contractor), cost rate (see Module E), weekly capacity (default 40 h).
- **B-2** **Assignments:** person ↔ project with start/end dates and allocation % (e.g., 50% on Client A, 50% bench). Assignments drive both the timesheet grid (you only see projects you're assigned to) and capacity math.
- **B-3** **Bench view:** for any date range, each person's allocation vs. capacity; anyone under 80% allocated is flagged. Bench cost surfaced in currency (unallocated hours × cost rate) to make the bench visible to management.
- **B-4** **Staffing requests:** created manually or by a Won deal (A-5): role, skills, allocation, start date, duration. The system suggests candidates ranked by skill match and availability; a resourcing manager confirms, which creates the assignment.
- **B-5** **Capacity forecast:** committed allocations + weighted pipeline demand (from Module A) vs. total capacity, by month, by role — answers "do we hire or do we sell?"
- **B-6** Time-off records (vacation/leave) reduce capacity in forecasts and grey out timesheet days.

---

## 5. Module C — Delivery (Timesheets & Approvals)

As specified in the companion document, unchanged, with two integration points added:

- **C-1** The weekly grid is scoped by **assignments** (B-2) rather than raw project membership.
- **C-2** Project **budget/burn alerts**: when logged+approved hours reach 70% / 90% / 100% of budget or retainer-included hours, notify the PM (and account owner from Module A at 100%).
- **C-3** Optional **client status digest:** monthly auto-drafted email per client summarizing hours by person/task (from approved entries), for the account owner to review and send.

---

## 6. Module D — Billing & Collections

Invoice generation as per the companion spec (rate cards, draft → issue, credit notes, PDF). Additions for automation:

- **D-1** **Billing calendar:** each contract has a billing schedule (e.g., monthly on the 1st, in arrears). On schedule, the system auto-generates draft invoices for finance review — finance starts from a queue of ready drafts, not from a blank screen.
- **D-2** **Sending:** issued invoices are emailed to the client's billing contact from the system with the PDF attached (and timesheet appendix where the contract requires it). Delivery logged.
- **D-3** **Dunning:** automated reminder emails at due−3 days (courtesy), due+7, due+14, due+30, each escalating in tone from templates; account owner CC'd from +14. All reminders logged; finance can pause dunning per invoice.
- **D-4** **Payment recording:** manual in v1 (finance marks paid from bank statement). Integration hook reserved for bank/accounting sync (e.g., import bank CSV and suggest matches by amount + invoice number).
- **D-5** **Accounting export:** monthly CSV/journal export of issued invoices and payments formatted for your accountant (map to their chart of accounts once, reuse forever).

---

## 7. Module E — Payouts, Margins & Reporting

**Purpose:** Compute what you owe your people from the same approved hours you bill from, and see margin everywhere.

**Requirements**

- **E-1** **Cost rates** per person, versioned with effective dates (like bill-rate cards): hourly cost for contractors; for salaried employees, either a derived hourly cost (salary ÷ capacity) or a flat monthly cost — configurable.
- **E-2** **Contractor payout statements:** per period, per contractor: approved hours × cost rate, grouped by project, generated as PDF + CSV. Statuses: `Draft → Confirmed → Paid`. Contractors can view their own statements. (Actual money transfer stays in your bank/payroll — v1 prepares and tracks, doesn't move money.)
- **E-3** **Discrepancy guard:** hours billed to clients vs. hours paid out per person per period must reconcile; differences (e.g., non-billable internal time) shown explicitly.
- **E-4** **Margin reporting:** revenue (invoiced) − cost (payout/derived cost) per project, client, person, and month; gross margin % with drill-down to the underlying entries.
- **E-5** **Executive dashboard:** monthly revenue, margin, utilization, bench cost, pipeline coverage (next 3 months' capacity vs. sold work), DSO (days sales outstanding), cash collected.
- **E-6** All figures exportable; every number traceable to source records (invoices, entries, payouts).

---

## 8. Module G — Client & Account Management

**Purpose:** Once a client is won, manage the relationship deliberately: keep contacts and communications in one place, watch account health, and grow the account. In an outsourcing business, existing clients are where most revenue and nearly all margin stability comes from.

**Requirements**

- **G-1** **Account 360 view:** for each client, one screen showing contacts, active contracts and projects, assigned team, hours this month, open and overdue invoices, recent activity, upcoming renewals, and open opportunities — pulled live from the other modules, entered nowhere twice.
- **G-2** **Contacts & roles:** multiple contacts per client with roles (billing, technical, decision-maker, champion), preferred channel, and notes. Contacts are shared with Modules A and D (the billing contact D-2 emails is defined here).
- **G-3** **Activity & communication log:** calls, meetings, emails (logged manually or via BCC-to-system address in v1), and internal notes, in one timeline per account. Every client-facing document generated by the system (quotes, invoices, status digests) appears in the same timeline automatically.
- **G-4** **Account health score:** a simple, explainable traffic light computed from live signals — invoice payment behavior (D), hours trend vs. contract (C), escalations open (G-6), time since last meaningful contact (G-3), and upcoming contract end without renewal motion (A-6). Red accounts appear on the exec dashboard (E-5).
- **G-5** **Growth opportunities:** upsell/cross-sell records attached to an account (e.g., "add 2 QA engineers in Q4"), with value and stage — these flow into the same pipeline analytics and capacity forecast (B-5) as new-business leads, so sold-but-not-started work is never invisible to resourcing.
- **G-6** **Escalations/issues:** logged per account with severity, owner, and resolution; open escalations pause the account's automated dunning tone escalation (D-3) beyond the courtesy reminder, so collections pressure never lands mid-firefight without a human deciding.
- **G-7** **Cadence for accounts:** configurable check-in rhythm per account tier (e.g., monthly call for A-tier, quarterly for B-tier); missed check-ins generate tasks for the account owner, same task queue as A-0.3.
- **G-8** **Client feedback:** lightweight periodic satisfaction capture (a 1–5 pulse per project per quarter, entered by the account owner after a check-in, or via emailed one-click survey later); feeds the health score.

---

## 9. Module H — Talent Acquisition & Talent Database

**Purpose:** The supply side of the business, treated with the same rigor as sales. A candidate pipeline feeds a rich talent database, and every person's profile carries their full engagement history — so "who do we have, what have they done, and who can we place tomorrow" is always one search away.

### Talent pipeline (recruiting)

- **H-1** **Job requisitions:** opened manually or auto-suggested when a staffing request (B-4) finds no internal match or the capacity forecast (B-5) shows a gap — the demand signal flows straight from sales to hiring.
- **H-2** **Candidate pipeline:** `Sourced → Screening → Interview(s) → Technical Assessment → Offer → Hired | Rejected | Talent Pool`. Candidate record: CV upload (parsed to profile fields where possible), skills, seniority, expected rate/salary, availability date, source, and full activity log (same timeline pattern as clients).
- **H-3** **Interview workflow:** schedule rounds, assign interviewers, structured scorecards per round (criteria + 1–5 + notes); a hiring decision requires completed scorecards, giving you comparable data across candidates.
- **H-4** **Talent pool:** strong candidates you can't place *now* are parked with skills and availability tagged; when a new requisition or staffing request opens, the pool is searched first — your cheapest hire is one you already interviewed.
- **H-5** **Offer → onboarding handoff:** marking Hired triggers a wizard: creates the user account, People profile (B-1) with skills carried over, cost rate record (E-1), contract/document checklist, and an onboarding task list (equipment, accesses, intro meetings) with owners and due dates.
- **H-6** **Recruiting analytics:** time-to-fill, pipeline conversion per stage, source effectiveness, offer acceptance rate.

### Talent database (Talent 360)

- **H-7** **Talent 360 view** — the mirror of the Account 360: one screen per person showing profile and skills, current assignments and allocation, complete **engagement history** (every project ever, with role, period, hours delivered, and the client), utilization trend, feedback received, documents (contracts, NDAs, certifications with expiry alerts), rate history (cost, and bill rates they've commanded), and time off.
- **H-8** **Engagement history is automatic:** it's derived from assignments + approved time entries — nobody maintains it by hand, so it's always current. When an engagement ends, the PM adds a short outcome note and a 1–5 internal rating that future staffing searches can filter on.
- **H-9** **Skill freshness:** skills carry a "last used on engagement" date computed from history; searches can prefer recently-exercised skills.
- **H-10** **CV/profile export:** generate a branded, client-ready profile PDF from the Talent 360 (with rates and internal notes stripped) — what sales attaches to proposals, always up to date.
- **H-11** **Privacy tiering:** interview scorecards, internal ratings, cost rates, and salary data visible only to Admin/Owner and designated HR/resourcing roles — not to PMs at large, and never in client-facing exports.

---

## 10. Module I — Daily Workspaces & Owner Command Center

**Purpose:** Make the platform the first tab everyone opens each morning, and give the owner complete, drill-down-to-the-source visibility over both sides of the business without asking anyone for a status update.

### Role-based home screens ("My Day")

Every role logs into a home screen listing exactly what needs their action today — nothing generic:

- **Employee/Consultant:** this week's timesheet status, today's assignments and allocation, pending corrections, upcoming time off, announcements.
- **Salesperson:** today's cadence touches and follow-ups (A-0.3), meetings, deals needing action, quotes awaiting response past N days.
- **Recruiter:** interviews today, candidates waiting > N days in a stage, requisitions aging, offers pending.
- **PM:** approvals queue, budget/burn alerts, engagement milestones due, client digests to review.
- **Account owner:** check-ins due (G-7), red/yellow health accounts, renewals inside 60 days, open escalations.
- **Finance:** draft invoices ready to issue, overdue invoices by bucket, payout statements to confirm, unbilled work total.
- **Resourcing:** staffing requests open, people rolling off inside 30 days, bench today.

Rule: nothing on a My Day screen is decorative — every card is an action or a decision. Empty screen = genuinely done for the day.

### Owner Command Center (100% transparency)

- **I-1** **Company pulse (single screen):** live tiles for revenue this month vs. target, gross margin, cash collected, overdue AR, utilization, bench cost, weighted pipeline (new business + upsell), open requisitions vs. capacity gap, red-health accounts, and unsubmitted timesheets — each tile clicks through to the underlying records, all the way down to a single time entry or email touch.
- **I-2** **Company activity feed:** a filterable, chronological stream of significant events across all modules — deal stage changes, contracts signed, engagements started/ended, invoices issued/paid, escalations opened, candidates hired, people rolling off. Filter by client, person, module, or event type. This is the "what happened while I was away" answer.
- **I-3** **Engagement board:** every active engagement as a card — client, team, health, burn vs. budget, invoice status, renewal date — the whole delivery portfolio on one wall, sortable by risk.
- **I-4** **Two-sided pipeline view:** demand (sales pipeline + upsells, weighted) against supply (bench + hiring pipeline by expected start), by month and role — the single most important owner decision, "sell harder or hire faster," answered with live data.
- **I-5** **Drill-down guarantee (design rule):** every aggregate number in the system links to the list of records that produced it, and every record shows its full history. No dead-end numbers anywhere.
- **I-6** **Owner alerts:** configurable thresholds pushed to the owner (email/Slack): invoice > X days overdue, margin on any project below Y%, account turned red, deal above Z value won or lost, resignation/offer-declined events.
- **I-7** **Read-everything role:** Owner/Admin sees all modules and all records (audit-logged like everyone else), including the privacy-tiered talent data (H-11). Transparency runs top-down; peer-level privacy still applies between staff.

---

## 11. Module F — Automation Engine (cross-cutting)

A single scheduler + notification layer that all modules use:

| Trigger | Automation |
|---|---|
| Week closes | Remind employees with unsubmitted hours |
| Submission > 3 days old | Nudge PM to approve |
| Billing schedule date | Generate draft invoices into finance queue |
| Invoice due/overdue thresholds | Dunning emails per D-3 |
| Budget thresholds hit | Burn alerts per C-2 |
| Contract end − 60/30 days | Renewal alerts per A-6 |
| Cadence step due | Outreach task appears in salesperson's today view (A-0.3) |
| No meaningful contact in N days (per tier) | Check-in task for account owner (G-7) |
| Health score turns red | Alert account owner + management (G-4) |
| Staffing request unmatched after N days | Suggest opening a requisition (H-1) |
| Candidate idle in stage > N days | Nudge recruiter (H-2) |
| Certification expiring in 30 days | Alert person + HR (H-7) |
| Owner threshold crossed (margin, AR, health…) | Owner alert per I-6 |
| Daily 07:00 | Refresh all My Day screens and company pulse tiles |
| Allocation ending < 30 days, no next assignment | Bench warning to resourcing |
| Month close | Draft payout statements, accounting export, exec dashboard refresh |

Notifications delivered in-app + email (Slack/Teams webhook optional). Every automated action is logged and idempotent (safe to re-run).

---

## 12. Extended Data Model (additions to the companion spec)

```
leads             (company, contact, email, source, stage, expected_value,
                   probability, expected_start, owner_id, lost_reason?)
lead_activities   (lead_id, kind[note|call|email|meeting], body, at, actor_id)
quotes            (lead_id, version, status[draft|sent|accepted|rejected],
                   currency, valid_until, pdf_ref)
quote_lines       (quote_id, service_role?, description, qty_hours?,
                   unit_price, amount, billing_model_hint)
contracts         (client_id, quote_id?, start_date, end_date?, notice_days,
                   payment_terms_days, billing_schedule, signed_doc_ref,
                   status[active|expired|terminated])
skills            (name)                       -- tag vocabulary
person_skills     (user_id, skill_id, level[junior|mid|senior])
assignments       (user_id, project_id, start_date, end_date?, allocation_pct)
time_off          (user_id, start_date, end_date, kind)
staffing_requests (project_id?, lead_id?, role, skills[], allocation_pct,
                   start_date, duration_weeks, status, filled_by_assignment?)
cost_rates        (user_id, effective_from, hourly_cost | monthly_cost)
payout_statements (user_id, period_start, period_end, currency, total,
                   status[draft|confirmed|paid], pdf_ref)
payout_lines      (statement_id, project_id, hours, rate, amount)
payout_line_entries (payout_line_id, time_entry_id)   -- same traceability
                                                      -- pattern as invoices
prospects         (company, industry, size, region, source, fit_score,
                   owner_id, status[active|converted|disqualified|dnc])
contacts          (client_id? | prospect_id?, name, email, phone, role,
                   preferred_channel, opted_out, notes)
cadences          (name, steps_json)         -- reusable outreach sequences
cadence_runs      (cadence_id, prospect_id, current_step, status)
sales_tasks       (owner_id, prospect_id? | client_id?, kind[touch|followup|
                   checkin|meeting], due_date, template_ref?, done_at?)
account_activities(client_id, kind[call|meeting|email|note|doc], body,
                   at, actor_id, source[manual|bcc|system])
opportunities     (client_id, description, value, stage, expected_start,
                   owner_id)                 -- upsell/cross-sell (G-5)
escalations       (client_id, severity, summary, owner_id, opened_at,
                   resolved_at?, resolution?)
account_health    (client_id, score, factors_json, computed_at)
feedback_pulses   (client_id, project_id, score_1_5, comment?, at)
requisitions      (role, skills[], seniority, count, reason[growth|backfill|
                   staffing_request_id?], status, opened_at, filled_at?)
candidates        (name, email, cv_ref, skills[], seniority, expected_rate,
                   available_from, source, stage, requisition_id?,
                   talent_pool_flag, owner_id)
interview_rounds  (candidate_id, round_no, interviewer_id, scheduled_at,
                   scorecard_json, recommendation)
offers            (candidate_id, rate_or_salary, start_date,
                   status[sent|accepted|declined], sent_at)
onboarding_tasks  (user_id, task, owner_id, due_date, done_at?)
engagements       (assignment_id, outcome_note?, internal_rating_1_5?,
                   closed_by?, closed_at?)   -- derived view + PM close-out
person_documents  (user_id, kind[contract|nda|certification|id], file_ref,
                   expires_at?)
owner_alert_rules (metric, comparator, threshold, channel)
activity_feed     (event_type, entity_type, entity_id, summary,
                   actor_id?, at)            -- denormalized for I-2
notifications     (user_id, kind, payload, read_at?)
automation_runs   (job, ran_at, status, log_ref)      -- idempotency + audit
```

Relationships worth noting: `quotes → contracts → projects` gives full provenance from first contact to invoice; `time_entries` feed **both** `invoice_line_entries` and `payout_line_entries`, which is what makes margin reporting exact rather than estimated.

---

## 13. Tech Stack & Architecture (chosen: Supabase + Vite + shadcn/ui)

- **Backend: Supabase** (managed Postgres + Auth + Storage + Edge Functions).
  - **Database:** Postgres remains the single source of truth; the full data model in §12 maps 1:1 to tables. All schema changes via the Supabase CLI as versioned SQL migrations in the repo — never edited live in the dashboard.
  - **Authorization:** Postgres **Row-Level Security (RLS) on every table**, implementing the role matrix (employee sees own entries, PM sees their projects, finance sees money, owner sees all). The client talks to the DB directly through supabase-js; RLS *is* the server-side enforcement, so no table ships without policies.
  - **Business logic that moves money:** Postgres functions called via RPC — `submit_week()`, `approve_entries()`, `issue_invoice()`, `generate_draft_invoice()`, `confirm_payout()` — so multi-step financial operations are atomic transactions in the DB, not client-side sequences. Invoice numbering uses a sequence claimed inside `issue_invoice()`.
  - **Scheduled automation (Module F):** `pg_cron` triggers Supabase **Edge Functions** (Deno/TypeScript) for reminders, dunning, draft-invoice generation, health-score computation, and month-close. Every run logged to `automation_runs`.
  - **Email:** an Edge Function wrapping a transactional provider (Resend has a workable free tier); all sends logged.
  - **Files:** Supabase Storage buckets for CVs, signed contracts, invoice PDFs, certificates — with storage policies mirroring table RLS.
  - **PDFs (quotes, invoices, payout statements, talent profiles):** v1 renders a print-optimized HTML document from a React template (browser print-to-PDF for finance is acceptable at this scale); Phase 10 moves generation into an Edge Function for fully automated emailing.
  - **Realtime:** Supabase Realtime subscriptions power the activity feed (I-2) and live approval queues without polling.
- **Frontend: Vite + React + TypeScript.**
  - **UI:** Tailwind CSS + **shadcn/ui** components (Table, Card, Dialog, Form, Command, Sheet, Toast, Charts via Recharts) — consistent look with full ownership of the code.
  - **Data:** TanStack Query around supabase-js for caching/optimistic updates; TanStack Router for routing; react-hook-form + zod for forms, with zod schemas shared with Edge Functions.
  - **Types:** `supabase gen types typescript` regenerated on every migration, so DB and UI never drift.
- **Environments:** two Supabase projects — `staging` and `production` — with the CLI linking migrations to both; seed script for demo data.
- **Cost reality check:** the free tier fits the build phase and early usage, but note two limits: free projects **pause after ~1 week of inactivity** and cap at 500 MB database / 1 GB storage. Once real invoices run through it, budget for the Pro tier (~$25/mo) — this system will hold your revenue records, and daily backups + no pausing are worth it.
- **Est. build effort:** unchanged (§14 roadmap); Supabase removes the API-server layer entirely, which roughly offsets the care RLS policies demand.

---

## 14. Build Roadmap (value-first ordering)

**Phase 1 — Core + Time (weeks 1–4):** shared core entities, auth/roles, projects, assignments, weekly timesheet grid, approvals, reminders. *Everything else depends on trustworthy hours.*

**Phase 2 — Billing (weeks 5–8):** rate cards, draft invoice generation, issue + PDF + numbering, email sending, payment status, unbilled report, dunning. *Cash impact starts here.*

**Phase 3 — Payouts & margin (weeks 9–11):** cost rates, payout statements, reconciliation guard, margin by project/client, exec dashboard v1.

**Phase 4 — Staffing (weeks 12–15):** skills, bench view, staffing requests + matching, capacity forecast, time off.

**Phase 5 — Sales & contracts (weeks 16–20):** pipeline, quote builder, contract generation, Won-deal handoff wizard, renewal watchdog, pipeline-vs-capacity forecast.

**Phase 6 — Client & account management (weeks 21–24):** account 360 view, contacts, activity timeline, health score, opportunities, escalations, account cadences. Ships fast because it's mostly *reading* data Phases 1–5 already created.

**Phase 7 — Sales development (weeks 25–27):** prospect list, cadences, today-view task queue, conversion analytics.

**Phase 8 — Talent acquisition (weeks 28–31):** requisitions, candidate pipeline, interview scorecards, talent pool, hire-to-onboarding wizard, Talent 360 with engagement history (the history itself has been accumulating since Phase 1 — this phase just surfaces it).

**Phase 9 — Owner Command Center (weeks 32–34):** company pulse, activity feed, engagement board, two-sided pipeline, owner alert rules. Ships last as a *complete* screen but doesn't wait until then in practice — see the note below.

**Phase 10 — Hardening (ongoing):** accounting export mapping, bank CSV matching, client status digests, BCC email capture, Slack/Teams notifications, per-client document templates.

**Two threading rules across all phases:**

- **My Day ships with Phase 1** and every subsequent phase adds its cards to the relevant roles' home screens. Daily adoption is won in month one or not at all.
- **The Command Center grows incrementally:** each phase adds its tiles to the owner's pulse screen as its data comes alive (timesheet compliance in Phase 1, AR in Phase 2, margin in Phase 3…). The owner gets increasing transparency every month, not a big reveal in month eight.

Rationale for the order: Phases 1–3 close the money loop (hours → invoice → payout → margin) — the highest-leverage automation. Everything after digitizes decisions you can survive making in spreadsheets a little longer; account management and the Talent 360 arrive almost free once the operational data exists, because they mostly *read* what earlier phases recorded.

---

## 15. Adoption & Rollout (as important as the code)

1. **Migrate reference data first:** clients, projects, people, rates — one clean import, validated by finance.
2. **Run parallel for one billing cycle:** generate invoices in both the old way and the new system; reconcile to the cent before switching.
3. **Timesheet discipline policy:** submission deadline (e.g., Monday 12:00 for prior week) announced by management, enforced by the reminder automation — the tool can't fix culture alone, but it makes compliance visible.
4. **One owner per module:** finance owns Billing/Payouts config, resourcing owns Staffing, sales lead owns Pipeline. Admin changes (rates, numbering) restricted and audited.
5. **Feedback loop:** ship Phase 1 to real users in week 4, not month 6; the grid UX will need two rounds of tuning.

---

## 16. Decisions Needed Before Build

1. **Currencies:** confirm billing currency/currencies and payout currency; if they differ (e.g., bill in USD, pay contractors in ETB), decide where FX rates come from and whether the system stores both amounts.
2. **Salaried cost model:** derived hourly cost vs. flat monthly — affects margin math.
3. **Contract templates:** collect your current quote/contract/invoice documents so templates match legal reality.
4. **Accounting system:** which one (or which accountant format) for the D-5 export.
5. **Tax/regulatory:** invoice numbering, tax lines, and retention rules for your jurisdiction(s) — confirm with your accountant before Phase 2 ships.
6. **Data migration cutoff:** which historical data (if any) gets imported vs. archived in spreadsheets.
7. **Talent data privacy:** who besides Owner/HR can see cost rates, salaries, interview scorecards, and internal ratings (H-11) — decide the access matrix before Phase 3, and check local employment/data-protection law on candidate data retention.
8. **Full-transparency ground rules:** the Command Center makes individual activity highly visible; decide and communicate openly what is monitored (work records: hours, approvals, deals) and what is not, so transparency reads as fairness rather than surveillance — this materially affects adoption.
