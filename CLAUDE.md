# CLAUDE.md — Outsourcing Business Automation Platform

You are building an internal platform for a 10–50 person outsourcing company covering:
sales development → quotes/contracts → staffing & talent → timesheets/approvals →
invoicing/collections → payouts/margin → client & account management → owner command center.

**Authoritative specs (read before building anything):**
- `docs/outsourcing-automation-blueprint.md` — master blueprint: all modules (A–I), data model, roadmap.
- `docs/timesheet-invoicing-spec.md` — detailed spec for time tracking + invoicing (Modules C & D).

When a requirement is ambiguous, the specs win over assumptions. If the specs are silent, ask before inventing.

## Stack (fixed — do not substitute)

- **Backend:** Supabase (Postgres + Auth + RLS + Edge Functions + Storage + pg_cron + Realtime), managed via the Supabase CLI.
- **Frontend:** Vite + React 18 + TypeScript, Tailwind CSS, **shadcn/ui** components, TanStack Query + TanStack Router, react-hook-form + zod.
- **Email:** Resend via an Edge Function. **PDFs:** print-optimized HTML templates in v1.

## Repository layout

```
/
├── CLAUDE.md
├── docs/                      # the two spec files
├── supabase/
│   ├── migrations/            # versioned SQL — the only way schema changes
│   ├── functions/             # Edge Functions (Deno/TS): reminders, dunning, emails
│   └── seed.sql               # demo/dev data
├── src/
│   ├── lib/                   # supabase client, query helpers, zod schemas, money utils
│   ├── components/ui/         # shadcn components (generated via CLI)
│   ├── components/            # shared app components
│   ├── features/              # one folder per module:
│   │   ├── timesheets/  approvals/  projects/  clients/
│   │   ├── invoicing/   payouts/    staffing/  talent/
│   │   ├── sales/       accounts/   command-center/  my-day/
│   ├── routes/                # TanStack Router route tree
│   └── types/database.ts      # generated: supabase gen types typescript
└── package.json
```

## Non-negotiable conventions

1. **RLS on every table, no exceptions.** Every migration that creates a table must enable RLS and define policies in the same migration. Role matrix: employees read/write own drafts; PMs read+approve entries on their projects; finance full access to money tables; recruiter/HR to talent tables; `owner`/`admin` read everything. Roles live in a `user_roles` table (a user can hold several) and are checked via a `has_role(text)` SQL helper — never trust client-side checks alone.
2. **Money is integer minor units** (cents) + currency code. Never floats. Line rounding: half-up to 2 dp at line level; totals = sum of rounded lines.
3. **Append-only financial history.** Approved time entries and issued invoices are immutable — enforce with triggers that reject UPDATE/DELETE. Corrections = adjustment entries / credit notes referencing the original.
4. **Financial state transitions are Postgres RPC functions** (single transaction): `submit_week`, `approve_entries`, `reject_entry`, `generate_draft_invoice`, `issue_invoice`, `void_invoice`, `create_credit_note`, `confirm_payout_statement`. `issue_invoice` claims the number from a sequence, stamps entries, freezes the invoice, and writes `audit_log` — atomically. The frontend never performs these as multi-step client writes.
5. **Every sensitive action writes `audit_log`** (actor, action, entity, before/after diff).
6. **Types are generated, not hand-written:** after every migration run `supabase gen types typescript --local > src/types/database.ts`.
7. **All dates:** timestamps in UTC (`timestamptz`); `work_date` is a plain `date` in company timezone (setting in `company_settings`).
8. **shadcn/ui first:** compose screens from shadcn primitives (Table, Card, Dialog, Sheet, Form, Command, Tabs, Badge, Toast; charts via Recharts). Add components with `npx shadcn@latest add <component>`. No other UI kits.
9. **Zod schemas in `src/lib/schemas/`** are shared by forms and Edge Functions.
10. **Automation jobs are idempotent** and log to `automation_runs`; schedule with `pg_cron` calling Edge Functions.

## Build order (follow strictly — each phase must be working before the next)

Matches blueprint §14. Definition of done for every phase: migrations + RLS + RPCs, UI screens, seed data updated, types regenerated, and the relevant **My Day** cards + **Command Center** tiles added.

1. **Phase 1 — Core + Time:** auth, user_roles, clients, projects, tasks, assignments, weekly timesheet grid (keyboard-friendly; rows=project/task, cols=Mon–Sun, 0.25h steps), submit/approve/reject flow, reminder job. My Day v1 (employee + PM).
2. **Phase 2 — Billing:** rate cards (versioned, effective-dated), `generate_draft_invoice` for T&M, invoice workspace (draft edit → issue), numbering `INV-YYYY-NNNN`, printable invoice HTML, payment recording, unbilled report, dunning job.
3. **Phase 3 — Payouts & margin:** cost_rates, payout statements + reconciliation guard, margin by project/client/person, exec dashboard v1.
4. **Phase 4 — Staffing:** skills, bench view, time off, staffing requests + candidate-match ranking, capacity forecast.
5. **Phase 5 — Sales & contracts:** pipeline, quote builder + versioning, contract records, Won-deal handoff wizard, renewal watchdog.
6. **Phase 6 — Accounts (Module G):** Account 360, contacts, activity timeline, health score job, opportunities, escalations (escalation pauses dunning escalation).
7. **Phase 7 — Sales development:** prospects, cadences, today-view task queue, conversion analytics, do-not-contact.
8. **Phase 8 — Talent (Module H):** requisitions, candidate pipeline, interview scorecards, talent pool, hire→onboarding wizard, Talent 360 (engagement history derived from assignments + approved entries), client-ready profile PDF (rates/notes stripped), privacy tiering per H-11.
9. **Phase 9 — Command Center (Module I):** company pulse tiles, realtime activity feed, engagement board, two-sided pipeline, owner alert rules. Honor the drill-down guarantee: every aggregate links to its source records.
10. **Phase 10 — Hardening:** Edge-Function PDF + auto-email, bank CSV matcher, accounting export, Slack webhook, client digests.

## Commands

```bash
npm run dev                         # Vite dev server
supabase start                      # local stack
supabase migration new <name>       # new migration
supabase db reset                   # replay migrations + seed locally
supabase gen types typescript --local > src/types/database.ts
supabase functions serve            # run Edge Functions locally
supabase db push                    # apply to linked remote (staging first!)
```

## Guardrails

- Never edit schema in the Supabase dashboard; migrations only.
- Never expose the `service_role` key to the frontend; it lives only in Edge Function secrets.
- Never bypass an RPC for a financial state change, even "temporarily."
- Deploy order: staging project → verify → production project.
- Free-tier note: the project pauses after ~1 week idle; before real invoices run in production, move to Pro.
