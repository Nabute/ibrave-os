# Timesheet & Invoicing Tool — Design & Requirements Specification

**Purpose:** Internal tool for an outsourcing/services company to log billable time against client projects and generate accurate invoices from approved timesheets.

**Status:** v1.0 draft · For internal build

---

## 1. Overview & Goals

The company places staff (developers, designers, support agents, etc.) on client engagements and bills clients based on hours worked, fixed monthly retainers, or milestones. Today this is likely handled in spreadsheets, which causes missed hours, rate errors, and slow invoicing.

**Goals**

The tool should make it trivial for staff to log time daily, give managers a fast approval flow, and let finance generate a correct invoice for any client and period in under five minutes, with a full audit trail from invoice line back to individual time entries.

**Non-goals (v1)**

Payroll, expense claims, client-facing portal, tax filing, and multi-company consolidation are explicitly out of scope for the first version. Design the data model so they can be added later without migration pain.

**Success criteria**

- 95%+ of time entries submitted within 2 working days of the work date.
- Invoice generation requires zero manual recalculation.
- Every invoice line item traceable to approved time entries or a contract clause.

---

## 2. Users & Roles

| Role | Description | Key permissions |
|---|---|---|
| **Employee / Contractor** | Bills time to projects | Create/edit own draft entries, submit timesheets, view own history |
| **Project Manager** | Owns one or more projects | Approve/reject timesheets for their projects, view project burn, manage task lists |
| **Finance / Billing Admin** | Runs invoicing | Manage clients, contracts, rates; generate, edit, issue, and void invoices; record payments |
| **Admin** | System owner | Everything above, plus user management, role assignment, global settings |

Role checks are enforced server-side on every endpoint. A user can hold multiple roles (a PM who also logs time).

---

## 3. Core Workflows

### 3.1 Time logging (Employee)

1. Employee opens "My Timesheet" — a weekly grid (Mon–Sun) with rows per project/task.
2. Enters hours per day (0.25 h increments) with an optional note per entry.
3. Entries save as **Draft**. At week's end (or any time), employee clicks **Submit Week** → all draft entries for that week become **Submitted** and lock for editing.
4. If a submitted entry is rejected, it returns to **Draft** with the PM's comment, and the employee corrects and resubmits.

### 3.2 Approval (Project Manager)

1. PM sees a queue of submitted timesheets grouped by employee and week, filtered to their projects.
2. PM approves or rejects per entry or in bulk per timesheet. Rejection requires a comment.
3. **Approved** entries become immutable and eligible for invoicing. Any later correction is done via a signed adjustment entry (positive or negative hours), never by editing history.

### 3.3 Invoicing (Finance)

1. Finance selects a client + billing period (typically a calendar month).
2. System gathers all **approved, un-invoiced** time entries for that client's projects in the period, applies contract rates, and produces a **Draft Invoice** grouped per the contract's grouping rule (by project, by person, or by role).
3. Finance reviews, optionally adds manual lines (discounts, fixed fees, credits), then marks the invoice **Issued** — this assigns the final invoice number, freezes the invoice, and stamps every included time entry with the invoice ID.
4. Invoice is exported as PDF and sent to the client outside the system (v1). Finance later records payment status (**Paid**, **Partially Paid**, **Overdue**, **Void**).

### 3.4 Correction after issue

Issued invoices are never edited. Mistakes are handled by issuing a **Credit Note** (negative invoice referencing the original) and, if needed, a corrected invoice. This keeps the ledger append-only.

---

## 4. Functional Requirements

### 4.1 Clients, Projects & Contracts

- **FR-1** Finance can create clients with billing details: legal name, billing address, contact email, currency, payment terms (e.g., Net 30), tax rate(s), and preferred invoice grouping.
- **FR-2** Each project belongs to exactly one client and has a status (Active, Paused, Closed). Time can only be logged to Active projects.
- **FR-3** Each project has a **billing model**, one of:
  - **Time & Materials (T&M):** hours × rate.
  - **Monthly Retainer:** fixed fee per period, with optional included-hours cap and an overage rate for hours beyond the cap.
  - **Fixed Price / Milestone:** invoiced from milestone lines, time tracked for internal costing only.
- **FR-4** Rates are defined in a **rate card** attached to the project (or inherited from a client default). A rate card maps either *person → rate* or *role → rate*, in the contract currency. Rate cards are versioned with effective-from dates so historical invoices stay reproducible.
- **FR-5** Projects can define an optional task list; if defined, time entries must select a task. Tasks can be flagged **non-billable** (e.g., internal meetings).

### 4.2 Time Entries & Timesheets

- **FR-6** A time entry = person + project + (task) + date + hours + note + billable flag. Hours in 0.25 increments, max 24 h/day total per person (soft warning above 12 h).
- **FR-7** Entry lifecycle: `Draft → Submitted → Approved | Rejected(→Draft)`. Approved entries are immutable.
- **FR-8** Weekly submission model: submitting locks the week. Employees can log for past dates but the system flags entries older than N days (configurable, default 14) for PM attention.
- **FR-9** Employees can copy the previous week's grid as a starting point.
- **FR-10** PMs and Admins can view, but not edit, anyone's entries on their projects. Corrections post-approval are made only through adjustment entries that reference the original.
- **FR-11** Reminder email/notification to employees who have unsubmitted hours after the week closes, and to PMs with pending approvals older than 3 days.

### 4.3 Invoice Generation

- **FR-12** Invoice draft generation takes (client, period start, period end) and includes:
  - All approved, billable, un-invoiced T&M entries in the period, priced from the rate card version effective on the entry's date.
  - Retainer lines for retainer projects active in the period, plus overage lines if included hours are exceeded.
  - Any milestone lines finance marks as "ready to bill."
- **FR-13** Line grouping per contract preference: one line per project, per person, per role, or fully detailed (per person per task). Each line shows description, quantity (hours or 1 for fixed), unit price, and amount.
- **FR-14** Invoice totals: subtotal, per-tax-rate tax lines, total, all in the contract currency. Rounding: line amounts rounded to 2 dp (half-up); totals are sums of rounded lines.
- **FR-15** Invoice numbering: sequential per company with a configurable prefix and year, e.g., `INV-2026-0042`. Numbers are assigned only at issue time and are never reused, including for voided invoices. Credit notes use `CN-` prefix and reference the original invoice.
- **FR-16** Manual lines (discounts, one-off fees) allowed on drafts, each requiring a description; negative amounts permitted.
- **FR-17** Issuing an invoice: assigns the number, freezes all content, stamps every included time entry with the invoice ID, generates a PDF, and logs the acting user + timestamp.
- **FR-18** Invoice statuses: `Draft → Issued → Paid | Partially Paid | Overdue | Void`. Overdue is computed from issue date + payment terms. Voiding requires a reason and releases nothing — corrections go through credit notes; the void state simply marks it as not collectible.
- **FR-19** PDF output includes: company letterhead block, client billing block, invoice number & dates, line table, totals, payment terms, and bank details (from settings). A timesheet appendix (per-day detail) can be toggled per client.

### 4.4 Reporting

- **FR-20** Utilization report: billable vs. total hours per person per period.
- **FR-21** Project burn report: hours and revenue by project vs. optional budget, with % consumed.
- **FR-22** Unbilled work report: approved hours not yet invoiced, by client, with monetary value — this is the "revenue leakage" safety net.
- **FR-23** Invoice aging report: outstanding invoices bucketed 0–30 / 31–60 / 61–90 / 90+ days.
- **FR-24** All reports exportable to CSV.

### 4.5 Administration & Audit

- **FR-25** User management: invite by email, assign roles, deactivate (deactivated users' history is retained).
- **FR-26** Global settings: company details, invoice numbering scheme, default tax rates, bank details, logo, reminder schedules.
- **FR-27** Append-only audit log of sensitive actions: approvals, rejections, rate changes, invoice issue/void, payment recording, role changes — capturing who, what, when, and before/after values.

---

## 5. Data Model

Core entities (PostgreSQL; all tables carry `id`, `created_at`, `updated_at`; money stored as integer minor units, e.g., cents, plus a currency code):

```
users            (name, email, role[], status, default_role_for_rates)
clients          (name, billing_address, contact_email, currency,
                  payment_terms_days, tax_config, invoice_grouping)
projects         (client_id, name, status, billing_model,
                  retainer_fee, retainer_included_hours, budget_hours?)
project_members  (project_id, user_id, role_on_project)
tasks            (project_id, name, billable, status)
rate_cards       (project_id | client_id, effective_from)
rate_card_lines  (rate_card_id, user_id? | role?, hourly_rate)
time_entries     (user_id, project_id, task_id?, work_date, hours,
                  note, billable, status, approved_by?, approved_at?,
                  invoice_id?, adjusts_entry_id?)
milestones       (project_id, name, amount, ready_to_bill, invoice_id?)
invoices         (client_id, number?, period_start, period_end, status,
                  currency, subtotal, tax_total, total, issued_at?,
                  due_date?, pdf_ref?, credits_invoice_id?)
invoice_lines    (invoice_id, kind[time|retainer|overage|milestone|manual],
                  description, quantity, unit_price, amount, tax_rate,
                  group_key)
invoice_line_entries (invoice_line_id, time_entry_id)   -- traceability
payments         (invoice_id, amount, paid_at, method, note)
audit_log        (actor_id, action, entity_type, entity_id, diff, at)
```

Key integrity rules:

- A time entry may belong to at most one invoice (`invoice_id` set exactly once, at issue).
- `invoice_line_entries` provides the line → entries traceability required by FR-17.
- Rate lookups always resolve by `work_date` against rate card `effective_from`, never "current rate."
- Deletion is disallowed for approved entries and issued invoices; use adjustments and credit notes.

---

## 6. Architecture & Tech Stack (final: Supabase + Vite + shadcn/ui)

- **Backend:** Supabase — managed Postgres with Row-Level Security enforcing all role permissions, Postgres RPC functions for atomic operations (`submit_week`, `approve_entries`, `issue_invoice`), `pg_cron` + Edge Functions for reminders, Supabase Storage for PDFs, Auth for login.
- **Database:** the data model in §5 as versioned SQL migrations via the Supabase CLI.
- **Frontend:** Vite + React + TypeScript, Tailwind + shadcn/ui components, TanStack Query/Router, react-hook-form + zod. The timesheet grid is the flagship interactive screen.
- **PDF generation:** print-optimized HTML invoice template in v1; Edge Function generation when automated emailing lands.
- **Deployment:** Supabase staging + production projects; frontend on any static host (Vercel/Netlify/Cloudflare Pages).

See the master blueprint §13 for full stack rationale, free-tier limits, and conventions.

---

## 7. UI — Screen Inventory

1. **My Timesheet (weekly grid):** rows = project/task, columns = days, cells = hours; totals per row/column; Submit Week button; status chips per entry. This screen must be fast and keyboard-friendly — it's used daily.
2. **Approvals queue (PM):** list of submitted weeks by person; expandable detail; bulk approve; reject-with-comment.
3. **Projects:** list + detail with members, tasks, rate card (versioned), budget/burn widget.
4. **Clients:** list + detail with billing info, contracts/projects, invoice history.
5. **Invoice workspace (Finance):** "Generate draft" wizard (client + period) → editable draft view (lines, manual lines, totals) → Issue → PDF preview/download; payment recording on issued invoices.
6. **Reports:** utilization, project burn, unbilled work, invoice aging; date-range filters; CSV export.
7. **Admin:** users & roles, company settings, numbering, audit log viewer.

---

## 8. Non-Functional Requirements

- **NFR-1 Auditability:** every financial figure reproducible from stored data; append-only history for approved/issued records.
- **NFR-2 Security:** server-side authorization per role; TLS; passwords hashed (argon2/bcrypt); audit log immutable to app users.
- **NFR-3 Reliability:** invoice issue is atomic (number assignment + entry stamping + freeze in one transaction). Daily backups, 30-day retention.
- **NFR-4 Performance:** timesheet grid loads < 1 s; draft invoice generation for a month of a 50-person org < 10 s.
- **NFR-5 Data retention:** financial records retained ≥ 7 years (adjust to local statutory requirements).
- **NFR-6 Timezone:** store timestamps in UTC; work_date is a plain date interpreted in company timezone.
- **NFR-7 Concurrency:** two finance users cannot issue the same draft twice (optimistic locking or row lock on issue).

---

## 9. Edge Cases to Handle Explicitly

- Rate changes mid-month → two invoice lines for the same person/project priced by rate card version.
- Approved hours arriving after the invoice was issued → they appear in the next period's unbilled pool (FR-22 catches them).
- Retainer project with zero logged hours → retainer line still bills.
- Entry rejected after week submitted → only that entry unlocks, not the whole week.
- Employee leaves mid-engagement → deactivate user; their approved history and invoiceability are unaffected.
- Client currency differs from company currency → v1: invoice in contract currency only; no FX conversion in-app.

---

## 10. Phased Build Plan

**Phase 1 — Time tracking (2–3 weeks):** users/roles, clients/projects/tasks, weekly grid, submit/approve flow, basic reminders. *Value: hours are captured reliably.*

**Phase 2 — Invoicing (2–3 weeks):** rate cards, draft generation for T&M, manual lines, issue + numbering + PDF, payment status, unbilled report. *Value: invoices in minutes.*

**Phase 3 — Contracts & reporting (2 weeks):** retainer/milestone models, credit notes, utilization/burn/aging reports, audit log viewer, CSV exports.

**Phase 4 — Polish (ongoing):** SSO, per-client invoice templates, notification tuning, possible client portal.

---

## 11. Open Questions (decide before building)

1. Are contractors paid from the same logged hours (i.e., will this later feed cost/payroll)? If yes, add a `cost_rate` alongside billing rate now.
2. One legal entity or several? Multi-entity affects invoice numbering and bank details.
3. Single currency or multiple? If multiple, confirm no FX conversion is needed in v1.
4. Do any client contracts require their own timesheet format as an invoice appendix?
5. What's the statutory invoice retention and numbering requirement in your jurisdiction?
