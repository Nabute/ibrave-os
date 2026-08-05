# iBrave OS — Outsourcing Business Automation Platform

Internal platform for a 10–50 person outsourcing company. **All nine phases of
the [blueprint](docs/outsourcing-automation-blueprint.md) are implemented:**
**core + time tracking** (weekly grid, submit → approve → reject workflow),
**billing** (versioned rate cards, draft invoice generation, issue/void/credit
notes, payments, dunning), **payouts & margin** (versioned cost rates, payout
statements draft → confirm → paid, reconciliation guard, margin by
project/month), and **staffing** (skills, bench view with privacy-tiered bench
cost, staffing requests with ranked candidate matching, capacity forecast,
time off), and **sales & contracts** (lead pipeline board, versioned quotes,
contract records with renewal watchdog, and the Won-deal handoff that creates
client + contract + project + staffing request in one transaction), and
**account management** (Account 360, activity timeline with system-generated
document entries, explainable health scores, opportunities, escalations that
pause dunning, feedback pulses), and **sales development** (prospect list with
fit scores, reusable outreach cadences that auto-schedule the next touch, the
today-view task queue shared with account check-ins, one-click prospect→lead
conversion carrying history, do-not-contact, funnel analytics by source), and
**talent acquisition** (requisitions, candidate pipeline with interview
scorecards required before hiring, offers, talent pool, hire→onboarding
checklist, Talent 360 with automatic engagement history and client-ready
profile export), and the **Owner Command Center** (live company-pulse tiles
that each drill down to their source records, realtime activity feed,
risk-scored engagement board, the two-sided demand-vs-supply pipeline, and
configurable owner alert rules), plus the My Day workspace and reports.

**All communication stays in-app**: every email (invoices, outreach, candidate
correspondence, event invites) is composed in the app and sent through the
`send-user-email` Edge Function — from the company address with reply-to the
sender, written to `email_log`, and mirrored into the record's timeline. An
in-app **calendar** handles scheduling (meetings, account check-ins, interview
rounds); external attendees receive real ICS calendar invites by email. Users
never need an outside mail client or calendar.

## Architecture

**Backend = Supabase.** Postgres is the single source of truth; RLS enforces the
role matrix on every table; every financial state change is an atomic
`SECURITY DEFINER` RPC. Two patterns are borrowed from the ECAA civil-aviation
backend:

- **Declarative FSM** (`supabase/migrations/…_workflow_fsm.sql`): allowed
  transitions live in the `workflow_transitions` table (entity, action,
  from → to, required role, requires-comment). Every state-changing RPC calls
  the single guard `fsm_transition()`, which validates the edge, checks the
  caller's role, appends immutable `workflow_history`, and writes `audit_log`.
  States are never assigned directly — triggers reject out-of-band status
  writes.
- **HATEOAS actions**: `fsm_actions()` + per-entity wrappers
  (`time_entry_actions`, `invoice_actions`) return the actions the *current
  user* may perform on a row in its *current state* — the frontend renders
  buttons from this map (hidden = absent, not disabled) and the server
  re-validates on execution.

**Frontend = Vite + React 18 + TS + Tailwind + shadcn/ui + TanStack
Query/Router**, with the meqenet **repository/factory pattern**:

- `src/lib/api/base.ts` — `ApiConfig` + `BaseRepository` (wraps supabase-js,
  translates every failure into one `ApiError` with a stable `code`).
- `src/lib/api/modules/*` — one repository class per resource with
  intent-named methods; workflow actions only ever call RPCs.
- `src/lib/api/index.ts` — `createApi(config)` factory;
  `Api = ReturnType<typeof createApi>` so adding a repository automatically
  widens every consumer's type.
- `src/lib/api/hateoas.ts` — `can()` / `actionList()` helpers over the
  server-declared action maps.

## Getting started

```bash
npm install
supabase start                  # local stack (Docker required)
cp .env.example .env.local      # paste the anon key printed by supabase start
supabase db reset               # apply migrations + seed demo data
npm run gen:types               # regenerate src/types/database.ts
npm run dev                     # http://localhost:5173
```

Demo logins (password `password123`):

| Email | Roles |
|---|---|
| owner@ibrave.dev | owner, admin |
| pm@ibrave.dev | pm, employee |
| finance@ibrave.dev | finance |
| dev1@ibrave.dev | employee |
| dev2@ibrave.dev | employee (contractor) |

## Demo walkthrough (the money loop)

1. **dev1** → My Timesheet → log hours → *Submit week*.
2. **pm** → Approvals → approve (or reject with a comment — entry returns to
   the employee's drafts).
3. **finance** → Invoices → *Generate draft* for Acme Corp over the last month
   → review lines (T&M priced from the rate card effective per work date,
   retainer + overage, ready-to-bill milestones) → *Issue invoice* (claims
   `INV-YYYY-NNNN`, stamps every entry, freezes the invoice — one
   transaction) → *Record payment* / *Create credit note* / *Void*.
4. **owner** → My Day shows the company pulse; Reports show unbilled work,
   aging, utilization, burn.

## Automation

`pg_cron` runs the idempotent SQL jobs (in-app notifications, overdue
flipping); the Edge Functions `reminders` and `dunning` add the email leg via
Resend:

```bash
supabase functions serve        # local
supabase secrets set RESEND_API_KEY=... EMAIL_FROM=... CRON_SECRET=... APP_URL=...
```

Every run is recorded in `automation_runs` (unique `(job, run_key)` = safe to
re-run).

## Conventions (enforced, not aspirational)

- Money = integer minor units + currency; rounding half-up at line level.
- Approved entries and issued invoices are immutable (triggers); corrections
  are adjustment entries / credit notes.
- Status changes only through RPCs (`app.via_rpc` transaction flag); the FSM
  history and audit log are append-only.
- Types are generated: run `npm run gen:types` after every migration.

See [CLAUDE.md](CLAUDE.md) for the full convention list and phase roadmap.
